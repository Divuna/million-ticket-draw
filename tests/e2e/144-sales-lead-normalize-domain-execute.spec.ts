import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 144 — index expressions must be executable by whoever writes the table (F3).
 *
 * Cause, both halves in one file — 20260809153000_sales_lead_work_intake.sql:
 *   line  80  CREATE INDEX idx_partners_work_intake_domain
 *               ON public.partners (public.sales_lead_normalize_domain(website_url));
 *   line 337  REVOKE ALL ON FUNCTION public.sales_lead_normalize_domain(text)
 *               FROM PUBLIC, anon, authenticated;
 *
 * Postgres evaluates index expressions as the invoking role while maintaining a
 * row version, so the revoke turned EXECUTE into a WRITE requirement on
 * public.partners. It only fires on a non-HOT update — and because the same
 * migration also indexes lower(btrim(contact_email)), changing contact_email is
 * exactly that. PartnerBillingForm therefore died with 42501 whenever the
 * partner also changed their billing e-mail.
 *
 * This spec locks the invariant, not just the one grant: any expression index on
 * a table `authenticated` can write must use a function `authenticated` can execute.
 *
 * Pure source contracts. No network, no DB, no emails.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260823210000_sales_lead_normalize_domain_execute_for_authenticated.sql',
);
const origin = read('supabase/migrations/20260809153000_sales_lead_work_intake.sql');

/** Strips SQL comments so "must not contain" assertions test real statements. */
const statementsOnly = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const fix = statementsOnly(migration);

test.describe('144 — sales_lead_normalize_domain execute grant (F3)', () => {
  test('144a the conflict this fixes still exists in the original migration', () => {
    // If either half ever disappears, this fix should be re-examined.
    expect(origin, 'the expression index must still exist').toMatch(
      /CREATE INDEX IF NOT EXISTS idx_partners_work_intake_domain[\s\S]{0,200}sales_lead_normalize_domain\(website_url\)/,
    );
    expect(origin, 'the original revoke must still be there').toMatch(
      /REVOKE ALL ON FUNCTION public\.sales_lead_normalize_domain\(text\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(origin, 'contact_email must still be indexed — that is what forces the non-HOT update').toMatch(
      /idx_partners_work_intake_email/,
    );
  });

  test('144b authenticated is granted EXECUTE on the index expression function', () => {
    expect(fix).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sales_lead_normalize_domain\(text\) TO authenticated;/,
    );
  });

  test('144c anon gets nothing — it never writes public.partners', () => {
    expect(fix).not.toMatch(/GRANT[^;]*sales_lead_normalize_domain[^;]*\banon\b/i);
  });

  test('144d no other sales_lead_* function is opened up', () => {
    const granted = [...fix.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)/g)].map((m) => m[1]);
    expect(granted).toEqual(['sales_lead_normalize_domain']);
  });

  test('144e the index and the function itself are left alone', () => {
    expect(fix).not.toMatch(/DROP INDEX/i);
    expect(fix).not.toMatch(/CREATE INDEX/i);
    expect(fix).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(fix).not.toMatch(/DROP FUNCTION/i);
    expect(fix).not.toMatch(/ALTER FUNCTION/i);
  });

  test('144f the fix touches no data, no table and no policy', () => {
    expect(fix).not.toMatch(/\b(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\b/i);
    expect(fix).not.toMatch(/ALTER TABLE/i);
    expect(fix).not.toMatch(/(CREATE|DROP|ALTER)\s+POLICY/i);
  });

  test('144g the granted function is safe to hand to a partner', () => {
    // SECURITY INVOKER + IMMUTABLE + pinned search_path + pure string body:
    // EXECUTE conveys no data access and no write capability.
    const body = origin.match(
      /CREATE OR REPLACE FUNCTION public\.sales_lead_normalize_domain\(p_value text\)[\s\S]*?\$\$;/,
    );
    expect(body, 'the function definition must be findable').not.toBeNull();
    const def = body![0];

    expect(def, 'must be IMMUTABLE — required for an index expression').toMatch(/IMMUTABLE/i);
    expect(def, 'must not be SECURITY DEFINER').not.toMatch(/SECURITY DEFINER/i);
    expect(def, 'must pin search_path').toMatch(/SET search_path\s*=\s*''/);
    // Pure string work only: no table access of any kind.
    expect(def).not.toMatch(/\bFROM\s+public\./i);
    expect(def).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  test('144h F2 stays intact — this fix must not widen the partner column lock', () => {
    // F3 restores an EXECUTE grant; it must not touch the F2 column allow-list.
    expect(fix).not.toMatch(/GRANT UPDATE/i);
    expect(fix).not.toMatch(/REVOKE UPDATE/i);
    expect(fix).not.toContain('price_per_coin');
    expect(fix).not.toContain('vat_rate');
  });
});
