import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 143 — a partner may edit its own settings, never OneMil's terms (F2).
 *
 * Cause: `partners_update_own` scopes the ROW, but Postgres RLS cannot scope
 * COLUMNS and `authenticated` held UPDATE on all 41 columns of public.partners.
 * The PartnerDashboard only sends a handful of fields, but the policy — not the
 * frontend — is the security boundary: with their own JWT a partner could
 * `PATCH /rest/v1/partners?id=eq.<own>` with `{"price_per_coin": 0}` and switch
 * off their own billing. Confirmed on staging before the fix.
 *
 * Fix: keep the row scoping, add column scoping via column-level GRANT. The
 * engine rejects a non-granted column with 42501 before any policy or trigger
 * runs, and every column the partner UI writes stays granted, so the frontend is
 * unchanged.
 *
 * This spec locks the allow-list to what the frontend actually writes. If a new
 * partner-facing UPDATE is added without granting its column, 143a fails; if a
 * withheld column is ever granted, 143c fails.
 *
 * Pure source contracts. No network, no DB, no emails.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260823200000_partner_self_update_column_lock.sql',
);

/** The GRANT UPDATE (...) column list from the migration. */
const grantedColumns = (() => {
  const m = migration.match(/GRANT UPDATE \(([\s\S]*?)\) ON public\.partners TO authenticated;/);
  expect(m, 'migration must contain a GRANT UPDATE column list').not.toBeNull();
  return m![1]
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').trim().replace(/,$/, ''))
    .filter((c) => c.length > 0);
})();

/** Every column of public.partners that a partner must never write. */
const WITHHELD = [
  'id',
  'created_at',
  'updated_at',
  'status',
  'approved_at',
  'suspended_at',
  'rejected_at',
  'price_per_coin',
  'vat_rate',
  'notes',
  'auth_user_id',
  'mc_per_99_czk',
  'payout_currency',
  'referred_by_affiliate_id',
  'shoptet_import_enabled',
  'shoptet_export_secret_name',
  'shoptet_customer_delivery',
  'reward_trigger_status',
] as const;

/**
 * Columns each partner-facing file updates on public.partners, taken from the
 * real call sites on origin/main a037d77b.
 */
const PARTNER_FACING_WRITES: Record<string, string[]> = {
  'src/pages/PartnerDashboard.tsx': [
    'logo_url',
    'logo_status',
    'reward_mode',
    'product_badge_enabled',
    'reward_base_czk',
    'reward_mc',
  ],
  'src/components/PartnerBillingForm.tsx': [
    'company_name',
    'ico',
    'dic',
    'billing_street',
    'billing_city',
    'billing_zip',
    'billing_country',
    'contact_email',
  ],
  'src/components/InfluencerProfileSection.tsx': [
    'name',
    'contact_email',
    'contact_phone',
    'website_url',
    'billing_street',
    'billing_city',
    'billing_zip',
    'billing_country',
    'currency',
    'payout_account',
    'payout_bank',
    'payout_ready',
    'payout_updated_at',
    'logo_url',
  ],
  'src/components/InfluencerTermsSection.tsx': ['terms_accepted_at'],
};

test.describe('143 — partner self-update column lock (F2)', () => {
  test('143a every column the partner UI writes is granted', () => {
    for (const [file, columns] of Object.entries(PARTNER_FACING_WRITES)) {
      for (const column of columns) {
        expect(
          grantedColumns,
          `${file} writes ${column}, so it must stay in the GRANT list`,
        ).toContain(column);
      }
    }
  });

  test('143b the partner-facing write sites still exist and still write those columns', () => {
    // Guards the list above against silently drifting away from the code.
    for (const [file, columns] of Object.entries(PARTNER_FACING_WRITES)) {
      const src = read(file);
      expect(src, `${file} must still update public.partners`).toContain("from('partners')");
      for (const column of columns) {
        expect(src, `${file} must still write ${column}`).toContain(column);
      }
    }
  });

  test('143c no internal, financial or admin column is granted', () => {
    for (const column of WITHHELD) {
      expect(
        grantedColumns,
        `${column} must never be partner-writable`,
      ).not.toContain(column);
    }
  });

  test('143d price_per_coin and vat_rate are the headline withheld fields', () => {
    // The two columns the audit proved a partner could rewrite.
    expect(grantedColumns).not.toContain('price_per_coin');
    expect(grantedColumns).not.toContain('vat_rate');
  });

  test('143e the granted list is exactly the 23 known partner fields', () => {
    // A new grant must be a deliberate edit to this spec, not a side effect.
    expect(grantedColumns.sort()).toEqual(
      [
        'billing_city',
        'billing_country',
        'billing_street',
        'billing_zip',
        'company_name',
        'contact_email',
        'contact_phone',
        'currency',
        'dic',
        'ico',
        'logo_status',
        'logo_url',
        'name',
        'payout_account',
        'payout_bank',
        'payout_ready',
        'payout_updated_at',
        'product_badge_enabled',
        'reward_base_czk',
        'reward_mc',
        'reward_mode',
        'terms_accepted_at',
        'website_url',
      ].sort(),
    );
  });

  test('143f the blanket UPDATE grant is revoked from anon and authenticated', () => {
    expect(migration).toMatch(
      /REVOKE UPDATE ON public\.partners FROM anon, authenticated;/,
    );
  });

  test('143g row scoping is left in place — the fix adds columns, not rows', () => {
    // partners_update_own / partners_update_admin still do the row check; the
    // migration must not touch them or it would change who can write which row.
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/ALTER POLICY/i);
  });

  test('143h applying the migration mutates no data', () => {
    // The admin RPC body legitimately contains an UPDATE, but it only runs when
    // an admin calls the function — never at apply time. So the check is on the
    // migration OUTSIDE any function body.
    // GRANT UPDATE / REVOKE UPDATE are privilege statements, not DML, so the
    // privilege lines are dropped before looking for real data statements.
    const outsideFunctionBodies = migration
      .replace(/\$function\$[\s\S]*?\$function\$/g, '')
      .split('\n')
      .filter((line) => !/^\s*(GRANT|REVOKE)\b/i.test(line))
      .join('\n');

    expect(outsideFunctionBodies).not.toMatch(/\bUPDATE\s+[\w.]+[\s\S]{0,120}?\bSET\b/i);
    expect(outsideFunctionBodies).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(outsideFunctionBodies).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(outsideFunctionBodies).not.toMatch(/ALTER TABLE/i);
  });

  test('143i service_role is untouched', () => {
    // Admin approval and the Shoptet flow run through service_role Edge
    // Functions, which must keep full access.
    expect(migration).not.toMatch(/REVOKE[^;]*FROM[^;]*service_role/i);
  });

  test('143j admins keep a supported path to the commercial terms', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_set_partner_commercial_terms');
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path = public/);
    expect(migration).toMatch(/IF NOT public\.is_admin\(\) THEN\s*\n\s*RETURN jsonb_build_object\('status', 'forbidden'\);/);
  });

  test('143k the admin RPC is not reachable by anon', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_set_partner_commercial_terms\(uuid, numeric, numeric\)\s*\nFROM PUBLIC, anon;/,
    );
  });

  test('143l the admin RPC keeps vat_rate a fraction, never a percent', () => {
    // Locks the 20260629180000 invariant: 0.21 = 21 %, so 25 must be refused.
    expect(migration).toMatch(/p_vat_rate < 0 OR p_vat_rate > 1/);
    expect(migration).toContain("'invalid_vat_rate'");
  });

  test('143m NULL means "leave unchanged" so one field can be set alone', () => {
    expect(migration).toMatch(/price_per_coin = COALESCE\(p_price_per_coin, price_per_coin\)/);
    expect(migration).toMatch(/vat_rate\s+= COALESCE\(p_vat_rate, vat_rate\)/);
  });
});
