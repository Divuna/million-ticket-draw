import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

/**
 * Affiliate v2 — Influencer customer attribution, end-to-end through the
 * global useApplyPendingAffiliateRef mechanism (App.tsx), not a direct RPC
 * call from the test. Covers the confirmed gap: record_affiliate_customer_ref
 * used to run only inside Register.tsx's immediate-session email/password
 * branch, so Google/Facebook OAuth and any signup that requires e-mail
 * confirmation first never completed the attribution.
 *
 * This test does not drive real Google/Facebook OAuth (infeasible in CI).
 * Instead it seeds sessionStorage['onemil_affiliate_ref'] the same way
 * Register.tsx does on /register?ref=<code>, then logs the user in on a
 * later, separate page load via /login — the same "session arrives after
 * the ref was captured" shape as OAuth return or a confirm-email flow.
 * If the global hook is wired correctly, it must pick up the pending code
 * regardless of why the session was delayed.
 *
 * STAGING-ONLY. Skipped cleanly when required env vars are absent.
 */

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const seedCookieConsent = () => {
  localStorage.setItem(
    'cookie_consent',
    JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntil<T>(read: () => Promise<T | null>, timeoutMs: number, message: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | null = null;
  while (Date.now() < deadline) {
    lastValue = await read();
    if (lastValue) return lastValue;
    await wait(500);
  }
  expect(lastValue, message).toBeTruthy();
  throw new Error(message);
}

test.describe('Affiliate v2 influencer customer attribution (global pending-ref mechanism)', () => {
  test('delayed-session ref_code is applied via useApplyPendingAffiliateRef and first-touch is preserved', async ({ page }) => {
    test.setTimeout(120_000);

    if (!SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      test.skip(true, 'staging-only influencer attribution test requires staging Supabase + service role');
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as SupabaseClient;

    const unique = Date.now();
    const refCodeA = `INFA${String(unique).slice(-8)}`;
    const refCodeB = `INFB${String(unique).slice(-8)}`;
    const customerEmail = `codex-inf-customer-${unique}@onemil.cz`;
    const customerPassword = `CodexInf${unique}!`;

    let affiliateAId: string | null = null;
    let affiliateBId: string | null = null;
    let customerAuthId: string | null = null;

    try {
      const { data: affA, error: affAError } = await supabase
        .from('affiliate_accounts')
        .insert({
          name: `Codex Influencer A ${unique}`,
          email: `codex-inf-a-${unique}@onemil.cz`,
          ref_code: refCodeA,
          modes: ['influencer'],
          status: 'approved',
          commission_rate_customer: 5,
          commission_rate_company: 5,
          approved_at: new Date().toISOString(),
          notes: 'codex staging e2e temporary influencer A',
        })
        .select('id')
        .single();
      expect(affAError, 'temporary influencer A setup should succeed').toBeNull();
      affiliateAId = affA?.id ?? null;

      const { data: affB, error: affBError } = await supabase
        .from('affiliate_accounts')
        .insert({
          name: `Codex Influencer B ${unique}`,
          email: `codex-inf-b-${unique}@onemil.cz`,
          ref_code: refCodeB,
          modes: ['influencer'],
          status: 'approved',
          commission_rate_customer: 5,
          commission_rate_company: 5,
          approved_at: new Date().toISOString(),
          notes: 'codex staging e2e temporary influencer B',
        })
        .select('id')
        .single();
      expect(affBError, 'temporary influencer B setup should succeed').toBeNull();
      affiliateBId = affB?.id ?? null;

      const { data: createdCustomer, error: createCustomerError } = await supabase.auth.admin.createUser({
        email: customerEmail,
        password: customerPassword,
        email_confirm: true,
      });
      expect(createCustomerError, 'temporary customer setup should succeed').toBeNull();
      customerAuthId = createdCustomer.user?.id ?? null;
      expect(customerAuthId, 'created customer must have an auth id').toBeTruthy();

      // ── Step 1: pending ref_code A is already in sessionStorage (as if the
      // visitor previously loaded /register?ref=<A> in this tab), the session
      // only becomes available now — same shape as an OAuth/e-mail-confirm return.
      await page.addInitScript((code: string) => {
        localStorage.setItem(
          'cookie_consent',
          JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
        );
        sessionStorage.setItem('onemil_affiliate_ref', code);
      }, refCodeA);

      await loginViaUI(page, customerEmail, customerPassword);

      const refRow = await pollUntil(
        async () => {
          const { data, error } = await supabase
            .from('affiliate_customer_refs')
            .select('id, affiliate_id, user_id, source')
            .eq('user_id', customerAuthId)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        30_000,
        'useApplyPendingAffiliateRef must record affiliate_customer_refs after a delayed-session login',
      );

      expect(refRow?.affiliate_id).toBe(affiliateAId);
      expect(refRow?.source).toBe('direct_link');

      // The RPC must have cleared the pending code once it got a definitive answer.
      await expect
        .poll(async () => page.evaluate(() => sessionStorage.getItem('onemil_affiliate_ref')), { timeout: 10_000 })
        .toBeNull();

      // ── Step 2 (first-touch): a second pending ref_code (B) arrives on a
      // fresh page load for the *same already-attributed* customer. The
      // existing attribution to affiliate A must not be overwritten.
      await page.addInitScript((code: string) => {
        sessionStorage.setItem('onemil_affiliate_ref', code);
      }, refCodeB);
      await page.goto('/profile');
      await expect(page.getByText(customerEmail)).toBeVisible({ timeout: 20_000 }).catch(() => {
        // Profile may render the name instead of the raw e-mail; presence is
        // not required for this assertion — the DB check below is authoritative.
      });

      // Give the hook a moment to run its (idempotent) second attempt.
      await wait(3_000);

      const { data: refRowsAfterSecondAttempt, error: secondError } = await supabase
        .from('affiliate_customer_refs')
        .select('id, affiliate_id, user_id')
        .eq('user_id', customerAuthId);
      expect(secondError, 'reading affiliate_customer_refs after second attempt should succeed').toBeNull();

      expect(refRowsAfterSecondAttempt?.length, 'first-touch: exactly one attribution row must exist').toBe(1);
      expect(refRowsAfterSecondAttempt?.[0]?.affiliate_id, 'first-touch: original affiliate A must not be overwritten by B').toBe(affiliateAId);
    } finally {
      if (customerAuthId) {
        await supabase.from('affiliate_customer_refs').delete().eq('user_id', customerAuthId);
        await supabase.from('profiles').delete().eq('id', customerAuthId);
        await supabase.from('wallets').delete().eq('user_id', customerAuthId);
        await supabase.from('users').delete().eq('id', customerAuthId);
        await supabase.auth.admin.deleteUser(customerAuthId);
      }
      if (affiliateAId) await supabase.from('affiliate_accounts').delete().eq('id', affiliateAId);
      if (affiliateBId) await supabase.from('affiliate_accounts').delete().eq('id', affiliateBId);
    }
  });
});
