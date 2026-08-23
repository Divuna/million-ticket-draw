import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 145 — the invoice number series is safe against concurrent allocation.
 *
 * Cause: generate_invoice_number(date) allocated with
 *     SELECT COALESCE(MAX(substring(variable_symbol from 5)::int), 0) + 1
 * and took no lock. A plain SELECT reserves nothing and reads the calling
 * transaction's snapshot, so two concurrent allocators derive the same number —
 * and public.partner_invoices had no unique constraint and no unique index on
 * invoice_number or variable_symbol to stop them inserting it twice.
 *
 * Reproduced on staging before the fix: three consecutive generator calls all
 * returned OMA-20260001, and two invoices for two different partners were
 * accepted with the identical number AND the identical variable symbol.
 *
 * Three paths share the one series, so they can also collide with each other:
 * create_partner_invoices_for_last_week, create_partner_invoices_for_period and
 * create_partner_offer_invoices_for_period.
 *
 * Pure source contracts. No network, no DB, no emails.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260823220000_invoice_number_concurrency_lock.sql',
);

/** The generator body as this migration defines it. */
const generatorBody = (() => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.generate_invoice_number(');
  expect(start, 'the migration must redefine generate_invoice_number').toBeGreaterThan(-1);
  const end = migration.indexOf('$function$;', start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
})();

/** Everything except the function body, for statement-level assertions. */
const outsideBody = migration.replace(/\$function\$[\s\S]*?\$function\$/g, '');

test.describe('145 — invoice number concurrency lock', () => {
  test('145a allocation is serialised by a transaction-scoped advisory lock', () => {
    expect(generatorBody).toMatch(/PERFORM pg_advisory_xact_lock\(/);
    // *_xact_* matters: a session-scoped lock would be released before the
    // caller's INSERT and would not close the race at all.
    expect(generatorBody).not.toMatch(/pg_advisory_lock\(/);
    expect(generatorBody).not.toMatch(/pg_try_advisory/);
  });

  test('145b the lock is taken BEFORE the MAX read', () => {
    const lockAt = generatorBody.indexOf('pg_advisory_xact_lock');
    const maxAt = generatorBody.indexOf('MAX(substring');
    expect(lockAt).toBeGreaterThan(-1);
    expect(maxAt).toBeGreaterThan(-1);
    expect(lockAt, 'locking after the read would leave the race open').toBeLessThan(maxAt);
  });

  test('145c the lock key is scoped per year', () => {
    // Different years must not block each other, and the key must not be a
    // constant shared with some unrelated advisory lock.
    expect(generatorBody).toMatch(/hashtextextended\('partner_invoice_number:' \|\| v_year, 0\)/);
  });

  test('145d a unique index backs both columns', () => {
    expect(outsideBody).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS partner_invoices_invoice_number_uniq\s*\n\s*ON public\.partner_invoices \(invoice_number\)/,
    );
    expect(outsideBody).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS partner_invoices_variable_symbol_uniq\s*\n\s*ON public\.partner_invoices \(variable_symbol\)/,
    );
  });

  test('145e the unique indexes are partial so numberless invoices still work', () => {
    // generate_partner_invoice() creates rows with no number at all, and three
    // legacy production rows have none either.
    expect(outsideBody).toMatch(/partner_invoices_invoice_number_uniq[\s\S]{0,160}WHERE invoice_number IS NOT NULL/);
    expect(outsideBody).toMatch(/partner_invoices_variable_symbol_uniq[\s\S]{0,160}WHERE variable_symbol IS NOT NULL/);
  });

  test('145f the number format is unchanged', () => {
    expect(generatorBody).toMatch(/'OMA-' \|\| v_year \|\| lpad\(v_next::text, 4, '0'\)/);
    expect(generatorBody).toMatch(/v_year \|\| lpad\(v_next::text, 4, '0'\)/);
  });

  test('145g MAX+1 semantics are kept so the series continues from existing data', () => {
    // The fix serialises allocation; it must not renumber or reset anything.
    expect(generatorBody).toMatch(/COALESCE\(MAX\(substring\(pi\.variable_symbol from 5\)::int\), 0\)/);
    expect(generatorBody).toMatch(/v_next := v_last \+ 1;/);
    expect(migration).not.toMatch(/CREATE SEQUENCE/i);
    expect(migration).not.toMatch(/setval/i);
  });

  test('145h no invoice is read, rewritten or renumbered', () => {
    const statements = outsideBody
      .split('\n')
      .filter((line) => !/^\s*(GRANT|REVOKE)\b/i.test(line))
      .join('\n');
    expect(statements).not.toMatch(/\bUPDATE\s+[\w.]+[\s\S]{0,120}?\bSET\b/i);
    expect(statements).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(statements).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(statements).not.toMatch(/ALTER TABLE/i);
  });

  test('145i the generator is internal-only', () => {
    // After the fix, EXECUTE also confers the ability to take the year lock.
    // Every caller is service_role-only, and nothing in src/ or the Edge
    // Functions calls it.
    expect(outsideBody).toMatch(
      /REVOKE ALL ON FUNCTION public\.generate_invoice_number\(date\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(outsideBody).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.generate_invoice_number\(date\) TO service_role;/,
    );
  });

  test('145j the three invoicing paths are left untouched', () => {
    // The fix belongs in the generator, not in its callers.
    for (const fn of [
      'create_partner_invoices_for_last_week',
      'create_partner_invoices_for_period',
      'create_partner_offer_invoices_for_period',
      'generate_partner_invoice',
    ]) {
      expect(migration, `${fn} must not be redefined here`).not.toContain(
        `CREATE OR REPLACE FUNCTION public.${fn}`,
      );
    }
  });

  test('145k F1 rounding and the F2/F3 permission model are not touched', () => {
    expect(migration).not.toMatch(/GRANT UPDATE|REVOKE UPDATE/i);
    expect(migration).not.toContain('price_per_coin');
    expect(migration).not.toContain('sales_lead_normalize_domain');
    expect(migration).not.toMatch(/(CREATE|DROP|ALTER)\s+POLICY/i);
    expect(migration).not.toMatch(/_2dp/);
  });

  test('145l all three sharing paths are named so the shared series stays visible', () => {
    // Documentation contract: the next person must see that offer invoices draw
    // from the same series as coin invoices.
    for (const fn of [
      'create_partner_invoices_for_last_week',
      'create_partner_invoices_for_period',
      'create_partner_offer_invoices_for_period',
    ]) {
      expect(migration).toContain(fn);
    }
  });
});
