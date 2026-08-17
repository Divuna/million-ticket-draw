import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 125 — the single-reward-engine invariant.
 *
 * The whole product-reward feature rests on one rule: the MioCoin figure shown to a
 * customer in the Shoptet cart and the figure OneMil actually issues after the order
 * must come from ONE server-side engine. This spec is the regression lock that stops
 * anyone re-introducing a second calculation in the widget, the preview endpoint,
 * the importer or the Partner Order API.
 *
 * Static source contract — no network, no DB, no emails.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/**
 * Strips comments so a "must not contain" assertion tests real code rather than the
 * safety notes that legitimately name the things the file must never touch.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

// The engine and the issuance RPC were each superseded by the MioCoin one-decimal
// migrations; the specs below assert the CURRENT definition, not the historical one.
const engine = read('supabase/migrations/20260818100100_compute_partner_reward_one_decimal.sql');
const issuance = read('supabase/migrations/20260818100200_partner_reward_issuance_one_decimal.sql');
const preview = read('supabase/functions/partner-reward-preview/index.ts');
const widget = read('public/shoptet-widget.js');
const importer = read('supabase/functions/import-shoptet-orders/index.ts');
const partnerApi = read('supabase/functions/partner-activate/index.ts');
const dashboard = read('src/pages/PartnerDashboard.tsx');
const config = read('supabase/config.toml');

test.describe('125 — one shared reward engine', () => {
  test('the engine is pure, single-rounding and service_role only', () => {
    expect(engine).toContain('CREATE OR REPLACE FUNCTION public.compute_partner_reward');
    // STABLE + no writes = safe to call from a public preview path.
    expect(engine).toContain('STABLE');
    expect(engine).not.toMatch(/\bINSERT INTO\b|\bUPDATE public\.|\bDELETE FROM\b/);
    // Rounding happens once, on the summed total (confirmed rule D), to ONE decimal.
    // `floor(...)::integer` is what used to destroy sub-1 MC rewards — it must stay gone.
    // SQL comments stripped: the migration header legitimately names the floor()
    // bug it removes, so only executable lines may be asserted against.
    const engineSql = engine.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(engineSql).not.toMatch(/floor\(v_total_mc\)/);
    expect(engine.match(/round\(v_total_mc, 1\)/g) ?? []).toHaveLength(2); // one per return path
    expect(engine).toContain("REVOKE ALL ON FUNCTION public.compute_partner_reward");
    expect(engine).toContain('GRANT EXECUTE ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) TO service_role');
  });

  test('issuance delegates to the engine instead of computing inline', () => {
    expect(issuance).toContain('public.compute_partner_reward(p_partner_id, v_order_total, p_items)');
    // The old inline formula must be gone.
    expect(issuance).not.toContain('floor((v_order_total / v_partner.reward_base_czk)');
    // Idempotency and the coins-once guarantee stay intact.
    expect(issuance).toContain('pg_advisory_xact_lock');
    expect(issuance).toMatch(/duplicate['"]?\s*,\s*true/);
    // Audit trail rich enough to reconstruct any historical payout.
    expect(issuance).toContain("'reward_mode'");
    expect(issuance).toContain("'reward_items'");
    expect(issuance).toContain("'reward_raw_total_mc'");
  });

  test('the preview endpoint only forwards to the engine — it never calculates', () => {
    expect(preview).toContain('compute_partner_reward');
    // No arithmetic on rates/prices anywhere in the endpoint.
    expect(preview).not.toMatch(/reward_base_czk\s*[*/]/);
    expect(preview).not.toMatch(/fixed_mc\s*[*/]/);
    expect(preview).not.toContain('ratio_base_czk');
    // And no rounding of its own: the Math.floor that used to sit here turned a
    // 0.6 MC product reward into 0 and hid the badge entirely.
    expect(codeOnly(preview)).not.toMatch(/Math\.(floor|round|ceil|trunc)/);
  });

  test('the preview endpoint exposes no secret and is read-only', () => {
    const code = codeOnly(preview).toLowerCase();

    // It must never select, read or return any of these.
    for (const secret of ['shoptet_export_secret_name', 'get_shoptet_export_url', 'api_key', 'vault', 'customer_email']) {
      expect(code, `preview must not touch ${secret}`).not.toContain(secret.toLowerCase());
    }

    // The only partner columns it may read are public display configuration.
    const selectMatch = preview.match(/\.select\("([^"]+)"\)/);
    expect(selectMatch, 'preview must select an explicit column list').not.toBeNull();
    for (const col of selectMatch![1].split(',').map((c) => c.trim())) {
      expect(
        ['id', 'status', 'reward_mode', 'product_badge_enabled', 'shoptet_import_enabled'],
        `unexpected column in preview select: ${col}`,
      ).toContain(col);
    }

    // Read-only: no issuance, no writes.
    expect(code).not.toContain('create_partner_order_reward');
    expect(preview).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    // Public by design, and that decision is documented next to the config.
    expect(config).toContain('[functions.partner-reward-preview]');
    // \r? — the repo checks out config.toml with CRLF endings on Windows.
    expect(config).toMatch(/\[functions\.partner-reward-preview\]\r?\nverify_jwt = false/);
  });

  test('the widget carries no maths and no secret', () => {
    const code = codeOnly(widget);

    // The widget renders whatever the endpoint returned — it must not derive coins.
    expect(code).not.toContain('reward_base_czk');
    expect(code).not.toContain('fixed_mc');
    expect(code).not.toMatch(/coins\s*=\s*[^;]*[*/]/);
    // No credential of any kind may sit in a file served to the storefront.
    expect(code.toLowerCase()).not.toContain('service_role');
    expect(code.toLowerCase()).not.toContain('apikey');
    expect(code.toLowerCase()).not.toContain('bearer');
    // Cart figure is mandatory; only the product badge is partner-toggleable.
    expect(widget).toContain('product_badge_enabled');
    expect(widget).toContain('Dárek od nás:');
    expect(widget).toContain('Za tento produkt získáte');
    // It must react to basket changes.
    expect(widget).toContain('MutationObserver');
    expect(widget).toMatch(/addEventListener\('change'/);
  });

  test('both issuance callers route items through the same RPC', () => {
    expect(importer).toContain('create_partner_order_reward');
    expect(importer).toContain('p_items');
    // The importer must not compute a reward itself.
    expect(importer).not.toContain('reward_base_czk');

    expect(partnerApi).toContain('create_partner_order_reward');
    expect(partnerApi).toContain('p_items');
    expect(partnerApi).not.toContain('reward_base_czk');
    // A partner is still forbidden from dictating the reward amount.
    expect(partnerApi).toContain('hasForbiddenRewardAmount');
  });

  test('partner UI offers the three modes and never computes a reward', () => {
    expect(dashboard).toContain("'whole_shop'");
    expect(dashboard).toContain("'selected_products'");
    expect(dashboard).toContain("'whole_shop_with_exceptions'");
    expect(dashboard).toContain('partner_product_reward_rules');
    // Product picker is fed by codes actually seen in real orders.
    expect(dashboard).toContain('partner_seen_products');
    // Mode/badge saves must verify affected rows, like the conversion save does.
    expect(dashboard).toMatch(/reward_mode: nextMode[\s\S]{0,400}select\('id'\)/);
    expect(dashboard).toContain('no_rows_updated');
  });
});
