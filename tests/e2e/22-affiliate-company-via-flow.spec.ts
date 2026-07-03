import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';

const ADMIN_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

type AffiliateAccount = {
  id: string;
  ref_code: string;
};

const seedCookieConsent = () => {
  localStorage.setItem(
    'cookie_consent',
    JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }),
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
  params: { email: string; authUserId?: string | null; partnerId?: string | null; affiliateId?: string | null },
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

  if (params.affiliateId) {
    await supabase.from('affiliate_accounts').delete().eq('id', params.affiliateId);
  }
}

test.describe('Affiliate v2 company via flow', () => {
  test('partner registration via affiliate code creates pending registration, approval, company ref, and partner mirror', async ({ page }) => {
    test.setTimeout(120_000);

    if (
      !SUPABASE_URL.includes(STAGING_REF) ||
      !SUPABASE_ANON_KEY ||
      !SERVICE_ROLE_KEY ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD
    ) {
      test.skip(true, 'staging-only affiliate company flow test requires staging Supabase, service role, and admin credentials');
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const unique = Date.now();
    const refCode = `CODEX${String(unique).slice(-8)}`;
    const companyName = `Codex Affiliate Company ${unique}`;
    const email = `codex-aff-company-${unique}@onemil.cz`;
    const password = `CodexAff${unique}!`;
    let affiliate: AffiliateAccount | null = null;
    let authUserId: string | null = null;
    let partnerId: string | null = null;

    try {
      await page.addInitScript(seedCookieConsent);
      const { data: insertedAffiliate, error: affiliateError } = await supabase
        .from('affiliate_accounts')
        .insert({
          name: `Codex Sales Rep ${unique}`,
          email: `codex-sales-rep-${unique}@onemil.cz`,
          ref_code: refCode,
          modes: ['sales_rep'],
          status: 'approved',
          commission_rate_customer: 5,
          commission_rate_company: 5,
          approved_at: new Date().toISOString(),
          notes: 'codex staging e2e temporary sales_rep',
        })
        .select('id, ref_code')
        .single<AffiliateAccount>();

      expect(affiliateError, 'temporary sales_rep affiliate setup should succeed').toBeNull();
      expect(insertedAffiliate?.ref_code).toBe(refCode);
      affiliate = insertedAffiliate ?? null;

      await page.goto(`/partner/register?via=${encodeURIComponent(affiliate.ref_code)}`);
      await page.fill('#companyName', companyName);
      await page.fill('#websiteUrl', `https://codex-aff-company-${unique}.example.com`);
      await page.fill('#ico', String(unique).slice(-8).padStart(8, '1'));
      await page.fill('#email', email);
      await page.fill('#contactPhone', '+420 777 000 001');
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
            website_url: `https://codex-aff-company-${unique}.example.com`,
            contact_phone: '+420 777 000 001',
            ico: String(unique).slice(-8).padStart(8, '1'),
            dic: null,
            affiliate_via_code: affiliate.ref_code,
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

      const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(authUserId);
      expect(authUserError, 'created auth user must be readable by admin API').toBeNull();
      const authUser = authUserData.user;
      expect(authUser?.user_metadata?.partner_registration).toBe(true);
      expect(authUser?.user_metadata?.affiliate_via_code).toBe(affiliate.ref_code);

      await page.evaluate(() => localStorage.clear());
      await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      const pendingResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/functions/v1/get-pending-partner-registrations'),
        { timeout: 20_000 },
      );
      await page.goto('/admin/partners-portal');
      await expect(page.getByRole('heading', { name: /Spr.va partner/i })).toBeVisible({ timeout: 20_000 });
      const pendingResponse = await pendingResponsePromise;
      expect(
        pendingResponse.status(),
        'get-pending-partner-registrations must accept the staging admin JWT',
      ).toBe(200);

      const pendingCard = page.getByText(companyName).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await expect(pendingCard, 'pending registration must be visible in admin portal').toBeVisible({ timeout: 30_000 });

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
          return data?.referred_by_affiliate_id === affiliate.id ? data : null;
        },
        20_000,
        'admin approval must create a partner row with affiliate mirror',
      );

      partnerId = partner?.id ?? null;
      expect(partner?.status).toBe('approved');
      expect(partner?.contact_email).toBe(email);
      expect(partner?.referred_by_affiliate_id).toBe(affiliate.id);

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
        'admin approval must record affiliate_company_refs',
      );

      expect(companyRef?.affiliate_id).toBe(affiliate.id);
      expect(companyRef?.source).toBe('via_link');
    } finally {
      await cleanupTestCompany(supabase, { email, authUserId, partnerId, affiliateId: affiliate?.id });
    }
  });
});
