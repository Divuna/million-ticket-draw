import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migrationPath =
  'supabase/migrations/20260724140039_guaranteed_purchase_benefit_phase1.sql';

test.describe('garantovaný nákupní benefit Phase 1 contract', () => {
  test('keeps the classic free voucher model separate', () => {
    const context = read('ONEMIL_BUSINESS_CONTEXT.md');

    expect(context).toContain('### 17.2 Classic partner vouchers placed into contests');
    expect(context).toContain('### 17.4 Garantovaný nákupní benefit');
    expect(context).toContain('The classic vouchers in sections 17.1–17.3 remain free');
    expect(context).toContain('must never be labelled as a contest voucher');
  });

  test('is additive and does not replace purchase or invoice automation', () => {
    const migration = read(migrationPath);

    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.buy_ticket_atomic/i,
    );
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.create_partner_invoices/i,
    );
    expect(migration).toContain(
      'Not connected to current invoice automation',
    );
    expect(migration).toContain(
      'No current purchase function uses this table',
    );
  });

  test('contains ownership RLS and blocks direct sensitive writes', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('voucher_versions_partner_own_select');
    expect(migration).toContain('voucher_distribution_orders_partner_own_select');
    expect(migration).toContain('voucher_issuances_owner_select');
    expect(migration).toContain('partner_invoice_items_partner_own_select');
    expect(migration).toContain(
      'revoke all on public.voucher_issuances from public, anon, authenticated',
    );
    expect(migration).toContain(
      'revoke all on public.partner_invoice_items from public, anon, authenticated',
    );
    expect(migration).not.toContain(
      'grant insert on public.voucher_issuances to authenticated',
    );
  });

  test('protects issuance, billing, approved terms and historical prices', () => {
    const migration = read(migrationPath);

    expect(migration).toMatch(
      /voucher_code_id uuid not null unique references public\.voucher_codes/,
    );
    expect(migration).toMatch(
      /ticket_id uuid not null unique references public\.tickets/,
    );
    expect(migration).toContain('unique (source_type, source_id)');
    expect(migration).toContain('Approved voucher versions are immutable');
    expect(migration).toContain('Used price values are immutable');
    expect(migration).toContain(
      'idx_voucher_issuances_one_billable_per_customer_benefit',
    );
  });

  test('uses explicit percent VAT and accepts a zero ex-VAT price', () => {
    const migration = read(migrationPath);

    expect(migration).toMatch(
      /unit_price_ex_vat numeric\(14,2\) not null check \(unit_price_ex_vat >= 0\)/,
    );
    expect(migration).toMatch(
      /vat_rate_percent numeric\(5,2\) not null default 21/,
    );
    expect(migration).toContain(
      'vat_amount = round(amount_ex_vat * (vat_rate_percent / 100), 2)',
    );
  });
});
