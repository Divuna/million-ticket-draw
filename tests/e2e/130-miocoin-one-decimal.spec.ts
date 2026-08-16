import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MIN_PARTNER_REWARD_MC,
  MIOCOIN_STEP,
  formatMioCoin,
  formatMioCoinNumber,
  hasAtMostOneDecimal,
  isValidManualRewardMc,
  mioCoinPlural,
  roundMioCoin,
  validateManualRewardMc,
} from '../../src/lib/miocoin';

/**
 * Spec 130 — the MioCoin one-decimal rule.
 *
 * Confirmed OneMil rule (ONEMIL_BUSINESS_CONTEXT.md §8.1):
 *   * a MioCoin value never carries more than ONE decimal place
 *   * the minimum issuable partner reward is 0.5 MC
 *   * a manually entered value must be >= 0.5 with at most 1 decimal, and an
 *     out-of-spec value is REJECTED — never silently rounded (1.25 ↛ 1.3)
 *   * an automatic calculation rounds ONCE, on the whole order, never per item
 *
 * This is the regression lock. Production before this work floored the reward to
 * an integer and stored coins in `integer` columns, so a 0.6 MC reward could not
 * exist anywhere between the product page and the invoice.
 *
 * No network, no DB, no emails — pure logic plus source contracts.
 */

// Normalised to LF: the repo checks out with CRLF on Windows and several
// assertions below match multi-line SQL statements.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const columns = read('supabase/migrations/20260817100000_miocoin_one_decimal_columns.sql');
const engine = read('supabase/migrations/20260817110000_compute_partner_reward_one_decimal.sql');
const issuance = read('supabase/migrations/20260817120000_partner_reward_issuance_one_decimal.sql');
const preview = read('supabase/functions/partner-reward-preview/index.ts');
const widget = read('public/shoptet-widget.js');
const dashboard = read('src/pages/PartnerDashboard.tsx');
const invoicePdf = read('supabase/functions/generate-partner-invoice-pdf/index.ts');
const adminInvoices = read('src/pages/AdminInvoices.tsx');
const partnersPortal = read('src/pages/AdminPartnersPortal.tsx');

/** Strips comments so "must not contain" assertions test real code, not safety notes. */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('--'))
    .join('\n');

// ── manual values ────────────────────────────────────────────────────────────

test.describe('130 — manually entered MioCoin values', () => {
  for (const ok of [0.5, 0.6, 1.2, 1, 5, 10.7, 15.7]) {
    test(`${ok} is accepted`, () => {
      expect(validateManualRewardMc(ok)).toBeNull();
      expect(isValidManualRewardMc(ok)).toBe(true);
    });
  }

  for (const bad of [0.4, 0.1, 0]) {
    test(`${bad} is rejected — below the ${MIN_PARTNER_REWARD_MC} MC minimum`, () => {
      expect(isValidManualRewardMc(bad)).toBe(false);
      expect(validateManualRewardMc(bad)).toMatch(/Minimální odměna/);
    });
  }

  for (const bad of [1.25, 2.333, 0.55, 4.95]) {
    test(`${bad} is rejected — more than one decimal place`, () => {
      expect(isValidManualRewardMc(bad)).toBe(false);
      // Rejected, not silently corrected: 1.25 must never be stored as 1.3.
      expect(validateManualRewardMc(bad)).toMatch(/desetinné místo/);
    });
  }

  test('the minimum and step are the confirmed values', () => {
    expect(MIN_PARTNER_REWARD_MC).toBe(0.5);
    expect(MIOCOIN_STEP).toBe(0.1);
  });
});

// ── automatic calculation ────────────────────────────────────────────────────

test.describe('130 — automatic calculation rounds once, to one decimal', () => {
  test('the confirmed rounding examples', () => {
    expect(roundMioCoin(4.95)).toBe(5);
    expect(roundMioCoin(4.85)).toBe(4.9);
    expect(roundMioCoin(4.84)).toBe(4.8);
  });

  test('99 Kč at 100 Kč = 5 MC yields 5,0 MC', () => {
    const raw = (99 / 100) * 5; // 4.95
    expect(raw).toBeCloseTo(4.95, 10);
    expect(roundMioCoin(raw)).toBe(5);
  });

  test('rounding happens once on the order total, never per item', () => {
    // Three items that each round down on their own but must not be rounded first.
    const items = [0.44, 0.44, 0.44];
    const roundedPerItem = items.reduce((sum, mc) => sum + roundMioCoin(mc), 0);
    const roundedOnce = roundMioCoin(items.reduce((sum, mc) => sum + mc, 0));

    expect(roundedPerItem).toBeCloseTo(1.2, 10); // 0.4 + 0.4 + 0.4 — fractions lost
    expect(roundedOnce).toBe(1.3); // 1.32 → 1.3 — the correct result
    expect(roundedOnce).not.toBe(roundedPerItem);
  });

  test('hasAtMostOneDecimal distinguishes valid from invalid results', () => {
    expect(hasAtMostOneDecimal(0.6)).toBe(true);
    expect(hasAtMostOneDecimal(5)).toBe(true);
    expect(hasAtMostOneDecimal(1.25)).toBe(false);
    expect(hasAtMostOneDecimal(4.333)).toBe(false);
  });
});

// ── Czech formatting ─────────────────────────────────────────────────────────

test.describe('130 — Czech MioCoin formatting', () => {
  test('decimal comma and correct declension', () => {
    expect(formatMioCoin(0.6)).toBe('0,6 MioCoinu');
    expect(formatMioCoin(1.2)).toBe('1,2 MioCoinu');
    expect(formatMioCoin(4.9)).toBe('4,9 MioCoinu');
    expect(formatMioCoin(1)).toBe('1 MioCoin');
    expect(formatMioCoin(3)).toBe('3 MioCoiny');
    expect(formatMioCoin(5)).toBe('5 MioCoinů');
  });

  test('a whole number keeps no pointless trailing decimal', () => {
    expect(formatMioCoinNumber(5)).toBe('5');
    expect(formatMioCoinNumber(5.0)).toBe('5');
    expect(formatMioCoinNumber(4.9)).toBe('4,9');
  });

  test('plural rules', () => {
    expect(mioCoinPlural(1)).toBe('MioCoin');
    expect(mioCoinPlural(2)).toBe('MioCoiny');
    expect(mioCoinPlural(5)).toBe('MioCoinů');
    expect(mioCoinPlural(0.6)).toBe('MioCoinu');
  });
});

// ── database contract ────────────────────────────────────────────────────────

test.describe('130 — database keeps one decimal through the whole partner chain', () => {
  test('the partner coin chain is numeric, not integer', () => {
    for (const stmt of [
      'ALTER TABLE public.partner_reward_codes\n  ALTER COLUMN coins TYPE numeric',
      'ALTER TABLE public.partner_coin_activations\n  ALTER COLUMN coins TYPE numeric',
      'ALTER TABLE public.partner_invoice_lines\n  ALTER COLUMN coins TYPE numeric',
      'ALTER COLUMN coins_activated TYPE numeric',
    ]) {
      expect(columns, `missing: ${stmt}`).toContain(stmt);
    }
  });

  test('every coin column is guarded to at most one decimal', () => {
    for (const constraint of [
      'partner_reward_codes_coins_one_decimal',
      'partner_coin_activations_coins_one_decimal',
      'partner_invoice_lines_coins_one_decimal',
      'partner_invoices_coins_one_decimal',
    ]) {
      expect(columns).toContain(constraint);
    }
    expect(columns).toContain('CHECK (coins = round(coins, 1))');
    expect(columns).toContain('coins_activated = round(coins_activated, 1)');
    expect(columns).toContain('coins_total = round(coins_total, 1)');
  });

  test('manual settings are guarded by min 0.5 AND one decimal', () => {
    for (const guard of [
      'CHECK (reward_mc >= 0.5 AND reward_mc = round(reward_mc, 1))',
      'CHECK (fixed_mc IS NULL OR (fixed_mc >= 0.5 AND fixed_mc = round(fixed_mc, 1)))',
      'CHECK (ratio_mc IS NULL OR (ratio_mc >= 0.5 AND ratio_mc = round(ratio_mc, 1)))',
    ]) {
      expect(columns).toContain(guard);
    }
    expect(columns).toContain('scr_reward_mc_one_decimal');
  });

  test('coin columns use plain numeric so 1.25 is rejected, not silently rounded', () => {
    // numeric(x,1) would quietly turn 1.25 into 1.3 before the CHECK ever ran.
    expect(columns).not.toMatch(/coins\w*\s+TYPE\s+numeric\s*\(/i);
  });

  test('the 0.5 minimum lives in one place', () => {
    expect(columns).toContain('CREATE OR REPLACE FUNCTION public.miocoin_min_partner_reward_mc()');
    expect(columns).toContain('SELECT 0.5::numeric');
  });
});

// ── reward engine ────────────────────────────────────────────────────────────

test.describe('130 — the engine is the only place that rounds', () => {
  test('single rounding to one decimal, on the summed total', () => {
    // codeOnly: the migration header legitimately names the floor() bug it removes.
    const engineCode = codeOnly(engine);
    expect(engineCode).not.toMatch(/floor\(v_total_mc\)/);
    expect(engineCode).not.toMatch(/::integer/);
    // Exactly one rounding statement per return path (order-total and items).
    expect(engine.match(/v_coins\s*:?=\s*round\(v_total_mc, 1\)/g) ?? []).toHaveLength(2);
  });

  test('per-item amounts are summed raw — never rounded before the sum', () => {
    // The only per-item round is the display value, which is never summed.
    const loop = engine.slice(engine.indexOf('FOR v_item IN'), engine.indexOf('-- Single rounding'));
    expect(loop).toContain("'mc',             v_item_mc");
    expect(loop).toContain("'mc_display',     round(v_item_mc, 1)");
    expect(loop).toContain('v_total_mc := v_total_mc + v_item_mc;');
    expect(loop).not.toMatch(/v_total_mc\s*:=\s*v_total_mc\s*\+\s*round\(/);
  });

  test('the engine reports the 0.5 threshold instead of each caller inventing one', () => {
    expect(engine).toContain('public.miocoin_min_partner_reward_mc()');
    expect(engine.match(/'issuable',\s*v_coins >= v_min_mc/g) ?? []).toHaveLength(2);
  });

  test('the engine stays pure and service_role only', () => {
    expect(engine).toContain('STABLE');
    expect(engine).not.toMatch(/\bINSERT INTO\b|\bUPDATE public\.|\bDELETE FROM\b/);
    expect(engine).toContain('GRANT EXECUTE ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) TO service_role');
  });
});

// ── issuance ─────────────────────────────────────────────────────────────────

test.describe('130 — issuance carries the decimal and applies the 0.5 floor', () => {
  test('create_partner_order_reward uses numeric coins and never rounds again', () => {
    expect(issuance).toContain('v_coins       numeric;');
    expect(issuance).toContain("v_coins := (v_reward->>'coins')::numeric;");
    expect(issuance).not.toContain("(v_reward->>'coins')::integer");
    // No second rounding anywhere in the issuance function.
    const fn = issuance.slice(
      issuance.indexOf('FUNCTION public.create_partner_order_reward'),
      issuance.indexOf('GRANT EXECUTE ON FUNCTION public.create_partner_order_reward'),
    );
    expect(codeOnly(fn)).not.toMatch(/round\(|floor\(|trunc\(/);
  });

  test('a reward below 0.5 MC is not issued', () => {
    expect(issuance).toContain('v_min_mc      numeric := public.miocoin_min_partner_reward_mc();');
    expect(issuance).toContain('IF v_coins IS NULL OR v_coins < v_min_mc THEN');
    expect(issuance).toContain("'error', 'reward_amount_too_low'");
  });

  test('idempotency is untouched by the decimal work', () => {
    expect(issuance).toContain('pg_advisory_xact_lock');
    expect(issuance).toMatch(/'duplicate',\s*true/);
  });

  test('the manual issuance path enforces the same rules', () => {
    expect(issuance).toContain('DROP FUNCTION IF EXISTS public.generate_partner_reward_code(uuid, integer, text, citext, jsonb);');
    expect(issuance).toContain('p_coins             numeric,');
    expect(issuance).toContain('IF p_coins IS NULL OR p_coins < v_min_mc THEN');
    expect(issuance).toContain('IF p_coins <> round(p_coins, 1) THEN');
    expect(issuance).toContain('GRANT EXECUTE ON FUNCTION public.generate_partner_reward_code(uuid, numeric, text, citext, jsonb) TO service_role');
  });

  test('the status update only carries coins through — it never recomputes', () => {
    const fn = issuance.slice(issuance.indexOf('FUNCTION public.update_partner_order_reward_status'));
    expect(codeOnly(fn)).not.toMatch(/round\(|floor\(|trunc\(|compute_partner_reward/);
    // Customer e-mail prints "0,6 MioCoinu", not the raw "0.6" of a text cast.
    expect(fn).toContain('public.format_miocoin_cz(v_row.coins)');
    expect(fn).not.toContain('v_row.coins::text');
  });

  test('the Czech server-side formatter follows the same rules', () => {
    expect(issuance).toContain('CREATE OR REPLACE FUNCTION public.format_miocoin_cz(p_value numeric)');
    expect(issuance).toContain("v_word   := 'MioCoinu';");
    expect(issuance).toContain("v_word := 'MioCoin';");
    expect(issuance).toContain("v_word := 'MioCoiny';");
    expect(issuance).toContain("v_word := 'MioCoinů';");
  });
});

// ── widget + preview ─────────────────────────────────────────────────────────

test.describe('130 — the storefront shows the decimal it was given', () => {
  test('the preview endpoint forwards the engine value without rounding', () => {
    expect(codeOnly(preview)).not.toMatch(/Math\.(floor|round|ceil|trunc)/);
    expect(preview).toContain('const coins = Number(result.coins ?? 0);');
    expect(preview).toContain('i.mc_display ?? i.mc ?? 0');
    // Below the minimum nothing is promised in the storefront either.
    expect(preview).toContain("reason: \"reward_amount_too_low\"");
  });

  test('the widget formats Czech decimals and never derives a reward', () => {
    const code = codeOnly(widget);
    expect(code).not.toMatch(/Math\.floor/);
    expect(widget).toContain('function czCoins(');
    // All three surfaces go through the shared formatter.
    expect(widget).toContain("render(target, 'Za tento produkt získáte ' + czCoins(coins), false);");
    expect(widget).toContain("textNode.textContent = 'Získáte ' + czCoins(coins);");
    expect(widget).toContain('valEl.textContent = czCoins(coins);');
    // Decimal comma + genitive singular, mirroring src/lib/miocoin.ts.
    expect(widget).toContain("return 'MioCoinu';");
    expect(widget).toContain("replace('.', ',')");
  });
});

// ── partner dashboard + invoices ─────────────────────────────────────────────

test.describe('130 — dashboard and invoices respect the rule', () => {
  test('every manual MioCoin input uses min 0.5 / step 0.1 and server-shared validation', () => {
    expect(dashboard).toContain("from '@/lib/miocoin'");
    expect(dashboard.match(/min=\{MIN_PARTNER_REWARD_MC\}/g) ?? []).toHaveLength(3);
    expect(dashboard.match(/step=\{MIOCOIN_STEP\}/g) ?? []).toHaveLength(3);
    // Three entry points: global conversion, new product rule, inline rule edit.
    expect(dashboard.match(/validateManualRewardMc\(/g) ?? []).toHaveLength(3);
    // The old silent corrector must stay gone.
    expect(dashboard).not.toContain('Math.round(val * 10) / 10');
  });

  test('coin sums parse the numeric string instead of concatenating it', () => {
    // `sum + c.coins` on a PostgREST numeric (a string) silently builds "00.6".
    expect(dashboard).not.toMatch(/sum \+ c\.coins/);
    expect(partnersPortal).not.toMatch(/sum \+ a\.coins/);
    expect(invoicePdf).not.toMatch(/\+= act\.coins;/);
  });

  test('invoice surfaces render MioCoin quantity with at most one decimal', () => {
    expect(invoicePdf).toContain('function formatCoins(');
    expect(invoicePdf).toContain('maximumFractionDigits: 1');
    expect(invoicePdf).not.toMatch(/String\((line|act)\.coins\)/);
    expect(adminInvoices).toContain('formatMioCoinNumber');
    expect(partnersPortal).toContain('formatMioCoinNumber');
  });

  test('MioCoin quantity formatting is not mixed with CZK formatting', () => {
    // Money keeps 2 decimals, MioCoins keep 1 — the PDF must have both helpers.
    expect(invoicePdf).toContain('minimumFractionDigits: 2, maximumFractionDigits: 2');
    expect(invoicePdf).toContain('minimumFractionDigits: 0, maximumFractionDigits: 1');
  });
});

// ── architecture ─────────────────────────────────────────────────────────────

test('130 — no second reward calculation was introduced', () => {
  // The engine remains the only place MioCoins are derived. These layers may
  // format and parse, but must never multiply/divide a rate into a reward.
  for (const [name, src] of [
    ['preview endpoint', preview],
    ['widget', widget],
    ['dashboard', dashboard],
  ] as const) {
    const code = codeOnly(src);
    expect(code, `${name} must not read the raw conversion rate`).not.toMatch(/reward_base_czk\s*[*/]/);
    expect(code, `${name} must not multiply a per-SKU rule`).not.toMatch(/fixed_mc\s*[*/]/);
  }
});
