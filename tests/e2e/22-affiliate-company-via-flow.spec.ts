import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

type AffiliateAccount = {
  id: string;
  ref_code: string;
};

async function cleanupTestCompany(
  supabase: SupabaseClient,
  params: { email: string; authUserId?: string | null; partnerId?: string | null },
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

    const { data: affiliate, error: affiliateError } = await supabase
      .from('affiliate_accounts')
      .select('id, ref_code')
      .eq('status', 'approved')
      .contains('modes', ['sales_rep'])
      .limit(1)
      .single<AffiliateAccount>();

    expect(affiliateError, 'staging must have an approved sales_rep affiliate account').toBeNull();
    expect(affiliate?.ref_code, 'sales_rep affiliate ref_code is required').toBeTruthy();

    const unique = Date.now();
    const companyName = `Codex Affiliate Company ${unique}`;
    const email = `codex-aff-company-${unique}@onemil.cz`;
    const password = `CodexAff${unique}!`;
    let authUserId: string | null = null;
    let partnerId: string | null = null;

    try {
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
      expect(signupResponse.status(), 'partner signup request should succeed').toBeLessThan(400);
      const signupBody = await signupResponse.json();
      authUserId = signupBody?.id ?? signupBody?.user?.id ?? null;
      expect(authUserId, 'partner signup response must contain auth user id').toBeTruthy();

      await expect(page.getByRole('heading', { name: /Registrace odesl/i })).toBeVisible({ timeout: 20_000 });

      const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(authUserId);
      expect(authUserError, 'created auth user must be readable by admin API').toBeNull();
      const authUser = authUserData.user;
      expect(authUser?.user_metadata?.partner_registration).toBe(true);
      expect(authUser?.user_metadata?.affiliate_via_code).toBe(affiliate.ref_code);

      await page.evaluate(() => localStorage.clear());
      await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/admin/partners-portal');
      await expect(page.getByRole('heading', { name: /Spr.va partner/i })).toBeVisible({ timeout: 20_000 });

      const pendingCard = page.getByText(companyName).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await expect(pendingCard, 'pending registration must be visible in admin portal').toBeVisible({ timeout: 30_000 });

      await pendingCard.getByRole('button', { name: /Schv/i }).click();
      await expect(pendingCard, 'approved pending registration should leave the pending list').toBeHidden({ timeout: 30_000 });

      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, auth_user_id, referred_by_affiliate_id, status, contact_email')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      expect(partnerError, 'partner read-back should not error').toBeNull();
      expect(partner, 'admin approval must create a partner row').toBeTruthy();
      partnerId = partner?.id ?? null;
      expect(partner?.status).toBe('approved');
      expect(partner?.contact_email).toBe(email);
      expect(partner?.referred_by_affiliate_id).toBe(affiliate.id);

      const { data: companyRef, error: companyRefError } = await supabase
        .from('affiliate_company_refs')
        .select('id, affiliate_id, partner_id, via_code, source')
        .eq('partner_id', partnerId)
        .maybeSingle();

      expect(companyRefError, 'affiliate_company_refs read-back should not error').toBeNull();
      expect(companyRef, 'admin approval must record affiliate_company_refs').toBeTruthy();
      expect(companyRef?.affiliate_id).toBe(affiliate.id);
      expect(companyRef?.via_code).toBe(affiliate.ref_code);
      expect(companyRef?.source).toBe('via_link');
    } finally {
      await cleanupTestCompany(supabase, { email, authUserId, partnerId });
    }
  });
});
