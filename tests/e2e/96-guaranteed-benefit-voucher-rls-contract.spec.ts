import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath =
  'supabase/migrations/20260724155213_restrict_guaranteed_benefit_voucher_visibility.sql';
const readMigration = () =>
  readFileSync(resolve(process.cwd(), migrationPath), 'utf8');

test.describe('guaranteed purchase benefit voucher RLS correction', () => {
  test('keeps public classic vouchers public', () => {
    const migration = readMigration();

    expect(migration).toContain("distribution_mode = 'classic'");
    expect(migration).toContain('is_public = true');
    expect(migration).toContain('to anon, authenticated');
  });

  test('adds restrictive fail-closed guards', () => {
    const migration = readMigration();

    expect(migration).toContain('vouchers_anon_guaranteed_benefit_guard');
    expect(migration).toContain(
      'vouchers_authenticated_guaranteed_benefit_guard',
    );
    expect(migration.match(/as restrictive/g)).toHaveLength(2);
  });

  test('allows only partner, superadmin or issued user ownership', () => {
    const migration = readMigration();

    expect(migration).toContain('vouchers_partner_own_select');
    expect(migration).toContain(
      'vouchers_guaranteed_benefit_superadmin_select',
    );
    expect(migration).toContain(
      'vouchers_guaranteed_benefit_issued_user_select',
    );
    expect(migration).toContain(
      "uv.acquisition_source = 'guaranteed_purchase_benefit'",
    );
  });

  test('does not alter purchase or application code', () => {
    const migration = readMigration();

    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.buy_ticket_atomic/i,
    );
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.buy_voucher_atomic/i,
    );
    expect(migration).not.toMatch(/partner_invoice/i);
  });
});
