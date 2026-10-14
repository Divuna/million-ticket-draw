import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 136 — partner invoice money is CZK with at most 2 decimal places (F1).
 *
 * Rule (audit finding F1):
 *   amount_net   = round(coins * price_per_coin, 2)
 *   vat_amount   = round(amount_net * vat_rate, 2)   -- from the ROUNDED net
 *   amount_gross = round(amount_net + vat_amount, 2) -- net + VAT, always
 *
 * Why this lock exists: partner MioCoins became decimal (1 dp, min 0.5 MC) in
 * 20260818100000..300, but the three coin-invoice functions kept multiplying the
 * coin amount straight into the money columns with no rounding. `vat_amount`,
 * `amount_ex_vat` and `amount_inc_vat` are numeric(14,2) so they truncated
 * silently, while `amount_net` and `amount_gross` are unconstrained numeric and
 * kept the full expansion. 11.5 MC then produced amount_gross = 13.915 next to
 * amount_inc_vat = 13.92 — two columns, one figure, two answers — and the
 * partner-facing UI and PDF read amount_gross.
 *
 * Scope: the coin-invoice path only. The partner OFFER invoice path
 * (create_partner_offer_invoices_for_period) already rounds and casts its net to
 * numeric(12,2); it is asserted here only as a non-regression boundary.
 *
 * Pure source + arithmetic contracts. No network, no DB, no emails.
 */

// Normalised to LF: the repo checks out with CRLF on Windows and the assertions
// below match multi-line SQL statements.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260823190000_partner_invoice_czk_two_decimals.sql',
);

/** The three coin-invoice functions this fix must cover. */
const INVOICE_FUNCTIONS = [
  'create_partner_invoices_for_last_week',
  'create_partner_invoices_for_period',
  'generate_partner_invoice',
] as const;

/** Returns the body of one CREATE OR REPLACE FUNCTION block from the migration. */
function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} must be defined in the migration`).toBeGreaterThan(-1);
  const end = migration.indexOf('$function$;', start);
  expect(end, `${name} must be terminated`).toBeGreaterThan(start);
  return migration.slice(start, end);
}

/**
 * Mirrors the SQL rounding rule exactly, so the arithmetic cases below fail if
 * the documented rule itself is ever restated differently.
 */
function invoiceMoney(coins: number, pricePerCoin: number, vatRate: number) {
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const amountNet = round2(coins * pricePerCoin);
  const vatAmount = round2(amountNet * vatRate);
  const amountGross = round2(amountNet + vatAmount);
  return { amountNet, vatAmount, amountGross };
}

const decimals = (v: number) => (String(v).split('.')[1] ?? '').length;

test.describe('136 — partner invoice CZK two decimals (F1)', () => {
  test('136a all three invoice functions round net, VAT and gross', () => {
    for (const fn of INVOICE_FUNCTIONS) {
      const body = functionBody(fn);

      expect(body, `${fn}: net must be rounded to 2 dp`).toMatch(
        /v_amount_net\s+:=\s+round\([^;]+,\s*2\);/,
      );
      expect(body, `${fn}: VAT must be rounded to 2 dp`).toMatch(
        /v_vat_amount\s+:=\s+round\(v_amount_net \* [^;]+,\s*2\);/,
      );
      expect(body, `${fn}: gross must be rounded to 2 dp`).toMatch(
        /v_amount_gross\s+:=\s+round\(v_amount_net \+ v_vat_amount,\s*2\);/,
      );
    }
  });

  test('136b VAT is derived from the ROUNDED net, never from the raw product', () => {
    for (const fn of INVOICE_FUNCTIONS) {
      const body = functionBody(fn);
      // The only accepted VAT source is v_amount_net, which is already rounded.
      // `coins * price * vat_rate` in one expression is the original defect.
      expect(body, `${fn}: VAT must not be computed from coins directly`).not.toMatch(
        /v_vat_amount\s+:=\s+round\(\s*v_coins/,
      );
    }
  });

  test('136c gross is net + VAT, never a separate (1 + vat_rate) product', () => {
    for (const fn of INVOICE_FUNCTIONS) {
      const body = functionBody(fn);
      expect(body, `${fn}: gross must not use the (1 + vat_rate) shortcut`).not.toMatch(
        /\(1 \+ [a-z_.]*vat_rate\)/,
      );
    }
  });

  test('136d vat_rate stays a fraction — no /100 regression', () => {
    // Locks the earlier fix from 20260629180000 in place.
    for (const fn of INVOICE_FUNCTIONS) {
      expect(functionBody(fn), `${fn}: vat_rate must not be divided by 100`).not.toMatch(
        /vat_rate\s*\/\s*100/,
      );
    }
  });

  test('136e the table enforces at most 2 decimals on every CZK column', () => {
    for (const column of [
      'amount_net',
      'vat_amount',
      'amount_gross',
      'amount_ex_vat',
      'amount_inc_vat',
    ]) {
      expect(migration, `${column} must have a 2 dp CHECK`).toContain(
        `CHECK (${column} IS NULL OR ${column} = round(${column}, 2))`,
      );
    }
  });

  test('136f the guard must not rewrite already-issued invoices', () => {
    // A column type change would rewrite historical rows; a value-based CHECK
    // accepts 12.10000000 because 12.10000000 = round(12.10000000, 2).
    expect(migration).not.toMatch(/ALTER\s+COLUMN\s+amount_(net|gross)\s+TYPE/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.partner_invoices/i);
  });

  test('136g 11.5 MC invoices as 11.50 / 2.42 / 13.92', () => {
    const m = invoiceMoney(11.5, 1, 0.21);
    expect(m.amountNet).toBe(11.5);
    expect(m.vatAmount).toBe(2.42);
    expect(m.amountGross).toBe(13.92);
    // The pre-fix production value was 13.915 — three decimals on an invoice.
    expect(m.amountGross).not.toBe(13.915);
  });

  test('136h 1.9 MC invoices as 1.90 / 0.40 / 2.30', () => {
    const m = invoiceMoney(1.9, 1, 0.21);
    expect(m.amountNet).toBe(1.9);
    expect(m.vatAmount).toBe(0.4);
    expect(m.amountGross).toBe(2.3);
    expect(m.amountGross).not.toBe(2.299);
  });

  test('136i 11.5 + 1.9 MC on one invoice is 13.40 / 2.81 / 16.21', () => {
    // The two production activations waiting for the weekly cron.
    const m = invoiceMoney(11.5 + 1.9, 1, 0.21);
    expect(m.amountNet).toBe(13.4);
    expect(m.vatAmount).toBe(2.81);
    expect(m.amountGross).toBe(16.21);
    expect(m.amountGross).not.toBe(16.214);
  });

  test('136j net + VAT = gross for every decimal MioCoin amount', () => {
    // Every value the 1-decimal rule can produce from 0.5 to 200.0 MC.
    for (let tenths = 5; tenths <= 2000; tenths++) {
      const coins = tenths / 10;
      const m = invoiceMoney(coins, 1, 0.21);
      expect(
        Math.round((m.amountNet + m.vatAmount) * 100),
        `net + VAT must equal gross at ${coins} MC`,
      ).toBe(Math.round(m.amountGross * 100));
    }
  });

  test('136k no CZK amount ever carries more than 2 decimals', () => {
    for (const pricePerCoin of [1, 0.5, 1.25, 2.4]) {
      for (let tenths = 5; tenths <= 500; tenths++) {
        const coins = tenths / 10;
        const m = invoiceMoney(coins, pricePerCoin, 0.21);
        expect(decimals(m.amountNet), `net at ${coins} MC @ ${pricePerCoin}`).toBeLessThanOrEqual(2);
        expect(decimals(m.vatAmount), `VAT at ${coins} MC @ ${pricePerCoin}`).toBeLessThanOrEqual(2);
        expect(decimals(m.amountGross), `gross at ${coins} MC @ ${pricePerCoin}`).toBeLessThanOrEqual(2);
      }
    }
  });

  test('136l 1 MC = 1 CZK excl. VAT is unchanged', () => {
    // price_per_coin stays the only source of the rate; the fix must not
    // introduce a second conversion constant.
    for (const coins of [0.5, 1.9, 11.5, 13.4, 24.4]) {
      expect(invoiceMoney(coins, 1, 0.21).amountNet).toBe(coins);
    }
    for (const fn of INVOICE_FUNCTIONS) {
      expect(functionBody(fn), `${fn}: net must come from price_per_coin`).toMatch(
        /round\(v_coins(_total)? \* v_(partner\.)?price_per_coin, 2\)/,
      );
    }
  });

  test('136m MioCoin quantities keep the 1-decimal rule — untouched by this fix', () => {
    // coins_total / coins_activated are written raw on purpose: the 1 dp rule is
    // already enforced upstream by CHECKs on the coin tables.
    expect(migration).not.toMatch(/round\(v_coins(_total)?,\s*1\)/);
    expect(migration).not.toMatch(/CHECK \(coins_total/);
  });

  test('136n the offer invoice path is not touched', () => {
    expect(migration).not.toContain('create_partner_offer_invoices_for_period');
    expect(migration).not.toContain('partner_offer_invoice_lines');
    // Its own net is already numeric(12,2), so the new CHECKs cannot reject it.
    const offer = read(
      'supabase/migrations/20260413_create_partner_offer_invoices_per_offer_billing.sql',
    );
    expect(offer).toContain('numeric(12,2)');
  });

  test('136o period/idempotency/line logic is unchanged', () => {
    for (const fn of INVOICE_FUNCTIONS) {
      const body = functionBody(fn);
      // Still refuses to invoice the same partner+period twice.
      expect(body, `${fn}: duplicate-period guard must remain`).toMatch(/v_existing_id/);
      // Still snapshots the activations and flips the invoiced flag.
      expect(body, `${fn}: line snapshot must remain`).toContain('partner_invoice_lines');
      expect(body, `${fn}: invoiced flag must remain`).toMatch(/SET invoiced = true/);
    }
  });

  test('136p the weekly function stays internal-only', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_partner_invoices_for_last_week\(\)\s*\nFROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_partner_invoices_for_last_week\(\)\s*\nTO service_role;/,
    );
  });
});
