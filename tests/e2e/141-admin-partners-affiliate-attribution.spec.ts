import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

/**
 * Affiliate v2 — company attribution when a partner registration is approved
 * from /admin/partners (as opposed to /admin/partners-portal, already
 * covered by spec 22). Fixes the confirmed gap: AdminPartners.tsx approved
 * the partner via the same approve-partner-registration Edge Function, but
 * never followed up with record_affiliate_company_ref, so
 * affiliate_company_refs / partners.referred_by_affiliate_id were silently
 * never created for any partner approved on this admin page.
 *
 * Also exercises the short link (/a/:refCode) as the actual registration
 * entry point, and a first-touch guard against a second, later attribution
 * attempt for the same partner.
 *
 * STAGING-ONLY. Skipped cleanly when required env vars are absent.
 */

const STAGING_REF = 'dxmowysntemfqfnanxua';
const ADMIN_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

type AffiliateAccount = { id: string; ref_code: string };

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

async function cleanupTestCompany(
  supabase: SupabaseClient,
  params: { email: string; authUserId?: string | null; partnerId?: string | null; affiliateIds: (string | null | undefined)[] },
) {
  let partnerId = params.partnerId ?? null;
  let authUserId = params.authUserId ?? null;

  if (!partnerId || !authUserId) {
    const { data: partner } = await supabase
      .from('partners')
      .select('id, auth_user_id')
      .or(`contact_email.eq.${params.email},auth_user_id.eq.${authUserId || '00000000-0000-0000-0000-000000000000'}`)
      .maybeSingle();
    partnerId = partnerId ?? partner?.id ?? null;
    authUserId = authUserId ?? partner?.auth_user_id ?? null;
  }

  if (partnerId) {
    await supabase.from('affiliate_company_refs').delete().eq('partner_id', partnerId);
    await supabase.from('partners').delete().eq('id', partnerId);
  }
  if (authUserId) {
    await supabase.from('profiles').delete().eq('id', authUserId);
    await supabase.from('wallets').delete().eq('user_id', authUserId);
    await supabase.from('users').delete().eq('id', authUserId);
    await supabase.auth.admin.deleteUser(authUserId);
  }
  for (const id of params.affiliateIds) {
    if (id) await supabase.from('affiliate_accounts').delete().eq('id', id);
  }
}

test.describe('Affiliate v2 company attribution via /admin/partners', () => {
  test('short link -> registration -> /admin/partners approve creates affiliate_company_refs, and first-touch holds', async ({ page }) => {
    test.setTimeout(150_000);

    if (
      !SUPABASE_URL.includes(STAGING_REF) ||
      !SUPABASE_ANON_KEY ||
      !SERVICE_ROLE_KEY ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD
    ) {
      test.skip(true, 'staging-only /admin/partners affiliate attribution test requires staging Supabase, service role, and admin credentials');
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as SupabaseClient;

    const unique = Date.now();
    const refCodeA = `ADMPA${String(unique).slice(-8)}`;
    const refCodeB = `ADMPB${String(unique).slice(-8)}`;
    const companyName = `Codex AdminPartners Company ${unique}`;
    const email = `codex-adminpartners-company-${unique}@onemil.cz`;
    const password = `CodexAdmP${unique}!`;

    let affiliateA: AffiliateAccount | null = null;
    let affiliateB: AffiliateAccount | null = null;
    let authUserId: string | null = null;
    let partnerId: string | null = null;

    try {
      const { data: insertedA, error: affAError } = await supabase
        .from('affiliate_accounts')
        .insert({
          name: `Codex Sales Rep AdminPartners A ${unique}`,
          email: `codex-sales-rep-adminpartners-a-${unique}@onemil.cz`,
          ref_code: refCodeA,
          modes: ['sales_rep'],
          status: 'approved',
          commission_rate_customer: 5,
          commission_rate_company: 5,
          approved_at: new Date().toISOString(),
          notes: 'codex staging e2e temporary sales_rep A (admin/partners flow)',
        })
        .select('id, ref_code')
        .single<AffiliateAccount>();
      expect(affAError, 'temporary sales_rep A setup should succeed').toBeNull();
      affiliateA = insertedA ?? null;

      const { data: insertedB, error: affBError } = await supabase
        .from('affiliate_accounts')
        .insert({
          name: `Codex Sales Rep AdminPartners B ${unique}`,
          email: `codex-sales-rep-adminpartners-b-${unique}@onemil.cz`,
          ref_code: refCodeB,
          modes: ['sales_rep'],
          status: 'approved',
          commission_rate_customer: 5,
          commission_rate_company: 5,
          approved_at: new Date().toISOString(),
          notes: 'codex staging e2e temporary sales_rep B (first-touch guard)',
        })
        .select('id, ref_code')
        .single<AffiliateAccount>();
      expect(affBError, 'temporary sales_rep B setup should succeed').toBeNull();
      affiliateB = insertedB ?? null;

      // ── Step 1: the actual short link, not the long /partner/register?via= URL.
      await page.addInitScript(seedCookieConsent);
      await page.goto(`/a/${encodeURIComponent(affiliateA!.ref_code)}`);
      await expect(page).toHaveURL(new RegExp(`/partner/register\\?via=${affiliateA!.ref_code}$`), { timeout: 10_000 });

      await page.fill('#companyName', companyName);
      await page.fill('#websiteUrl', `https://codex-adminpartners-company-${unique}.example.com`);
      await page.fill('#ico', String(unique).slice(-8).padStart(8, '2'));
      await page.fill('#email', email);
      await page.fill('#contactPhone', '+420 777 000 002');
      await page.fill('#password', password);
      await page.fill('#confirmPassword', password);

      const [signupResponse] = await Promise.all([
        page.waitForResponse((response) => response.url().includes('/auth/v1/signup'), { timeout: 20_000 }),
        page.getByRole('button', { name: /Odeslat registraci/i }).click(),
      ]);
      if (signupResponse.status() === 429) {
        const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            partner_registration: true,
            company_name: companyName,
            website_url: `https://codex-adminpartners-company-${unique}.example.com`,
            contact_phone: '+420 777 000 002',
            ico: String(unique).slice(-8).padStart(8, '2'),
            dic: null,
            affiliate_via_code: affiliateA!.ref_code,
          },
        });
        expect(createUserError, 'fallback pending auth user setup should work after signup rate limit').toBeNull();
        authUserId = createdUser.user?.id ?? null;
      } else {
        expect(signupResponse.status(), 'partner signup request should succeed').toBeLessThan(400);
        const signupBody = await signupResponse.json();
        authUserId = signupBody?.id ?? signupBody?.user?.id ?? null;
        await expect(page.getByRole('heading', { name: /Registrace odesl/i })).toBeVisible({ timeout: 20_000 });
      }
      expect(authUserId, 'partner signup response or fallback setup must contain auth user id').toBeTruthy();

      const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(authUserId!);
      expect(authUserError, 'created auth user must be readable by admin API').toBeNull();
      expect(authUserData.user?.user_metadata?.affiliate_via_code).toBe(affiliateA!.ref_code);

      // ── Step 2: approve via /admin/partners (the page that previously
      // skipped affiliate attribution), not /admin/partners-portal.
      await page.evaluate(() => localStorage.clear());
      await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      const pendingResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/functions/v1/get-pending-partner-registrations'),
        { timeout: 20_000 },
      );
      await page.goto('/admin/partners');
      await expect(page.getByRole('heading', { name: /Správa partner/i })).toBeVisible({ timeout: 20_000 });
      const pendingResponse = await pendingResponsePromise;
      expect(pendingResponse.status(), 'get-pending-partner-registrations must accept the staging admin JWT').toBe(200);

      const pendingCard = page.getByText(companyName).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await expect(pendingCard, 'pending registration must be visible on /admin/partners').toBeVisible({ timeout: 30_000 });

      const approveResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/functions/v1/approve-partner-registration'),
        { timeout: 20_000 },
      );
      await pendingCard.getByRole('button', { name: /Schv/i }).click();
      const approveResponse = await approveResponsePromise;
      expect(approveResponse.status(), 'approve-partner-registration should succeed').toBe(200);
      await expect(pendingCard, 'approved pending registration should leave the pending list').toBeHidden({ timeout: 30_000 });

      const partner = await pollUntil(
        async () => {
          const { data, error } = await supabase
            .from('partners')
            .select('id, auth_user_id, referred_by_affiliate_id, status, contact_email')
            .eq('auth_user_id', authUserId)
            .maybeSingle();
          if (error) throw error;
          return data?.referred_by_affiliate_id === affiliateA!.id ? data : null;
        },
        20_000,
        '/admin/partners approve must create a partner row with the affiliate mirror set',
      );
      partnerId = partner?.id ?? null;
      expect(partner?.status).toBe('approved');
      expect(partner?.referred_by_affiliate_id).toBe(affiliateA!.id);

      const companyRef = await pollUntil(
        async () => {
          const { data, error } = await supabase
            .from('affiliate_company_refs')
            .select('id, affiliate_id, partner_id, source')
            .eq('partner_id', partnerId)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        20_000,
        '/admin/partners approve must record affiliate_company_refs',
      );
      expect(companyRef?.affiliate_id).toBe(affiliateA!.id);
      expect(companyRef?.source).toBe('via_link');

      // ── Step 3 (first-touch): a later attempt to attribute the same
      // partner to a different affiliate (B) must not overwrite A. Calls the
      // exact same RPC AdminPartners.tsx now calls, under a real admin JWT.
      const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error: adminSignInError } = await adminClient.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      expect(adminSignInError, 'admin sign-in for the first-touch RPC check should succeed').toBeNull();

      const { data: secondAttempt, error: secondAttemptError } = await adminClient.rpc('record_affiliate_company_ref', {
        p_via_code: affiliateB!.ref_code,
        p_partner_id: partnerId,
      });
      expect(secondAttemptError, 'second attribution attempt call should not error').toBeNull();
      expect((secondAttempt as { status?: string })?.status).toBe('already_attributed');

      const { data: refsAfterSecondAttempt, error: refsAfterError } = await supabase
        .from('affiliate_company_refs')
        .select('id, affiliate_id')
        .eq('partner_id', partnerId);
      expect(refsAfterError, 'reading affiliate_company_refs after the second attempt should succeed').toBeNull();
      expect(refsAfterSecondAttempt?.length, 'first-touch: exactly one company ref row must exist').toBe(1);
      expect(refsAfterSecondAttempt?.[0]?.affiliate_id, 'first-touch: original affiliate A must not be overwritten by B').toBe(affiliateA!.id);

      const { data: partnerAfterSecondAttempt, error: partnerAfterError } = await supabase
        .from('partners')
        .select('referred_by_affiliate_id')
        .eq('id', partnerId)
        .maybeSingle();
      expect(partnerAfterError, 'reading partners after the second attempt should succeed').toBeNull();
      expect(partnerAfterSecondAttempt?.referred_by_affiliate_id, 'first-touch: partners.referred_by_affiliate_id must stay on A').toBe(affiliateA!.id);
    } finally {
      await cleanupTestCompany(supabase, {
        email,
        authUserId,
        partnerId,
        affiliateIds: [affiliateA?.id, affiliateB?.id],
      });
    }
  });
});
