/**
 * Affiliate v2 — simplified registration + profile fields (spec 28)
 *
 * /affiliate/register was simplified to: Jméno / název, E-mail, Heslo, Heslo
 * znovu, Telefon (volitelný), Režim spolupráce (Influencer / Obchodník).
 * Social/profile fields (web, Instagram, TikTok, YouTube, Facebook, dosah,
 * kategorie) and the manual ref_code field were removed from registration —
 * they now belong exclusively to Affiliate dashboard -> Profil
 * (AffiliateProfileSection, unchanged). register_affiliate_account is still
 * called with its full current production signature; the profile/ref_code
 * params are simply passed as null, and the server derives+dedupes the
 * ref_code from the name automatically (existing RPC behavior, unchanged).
 *
 * This spec verifies:
 *   1. /affiliate/register no longer renders the social/profile inputs or a
 *      manual ref_code field.
 *   2. The short registration still creates a pending affiliate_accounts row.
 *   3. The server auto-generates a non-empty ref_code (no user input needed).
 *   4. After approval + login, Affiliate dashboard -> Profil lets the
 *      affiliate fill in web/Instagram/TikTok/YouTube/Facebook/dosah/kategorie.
 *   5. Saved values survive a full page reload.
 *
 * STAGING-ONLY. Skips cleanly when required env vars are missing.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAffiliateViaUI } from './helpers/auth';

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL                 ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY            ?? '';
const SERVICE_KEY       = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY     ?? '';

const unique = Date.now().toString(36).toUpperCase();
const TEST_EMAIL = `affiliate-reg-fields-${unique.toLowerCase()}@onemil.cz`;
const TEST_PASSWORD = `AffReg${unique}!`;
const TEST_NAME = `Spec28 Affiliate ${unique}`;
const TEST_PHONE = '+420 777 222 333';
const TEST_WEBSITE = `https://spec28-${unique.toLowerCase()}.onemil.test`;
const TEST_INSTAGRAM = `https://instagram.com/spec28_${unique.toLowerCase()}`;
const TEST_TIKTOK = `https://tiktok.com/@spec28_${unique.toLowerCase()}`;
const TEST_YOUTUBE = `https://youtube.com/@spec28${unique.toLowerCase()}`;
const TEST_FACEBOOK = `https://facebook.com/spec28.${unique.toLowerCase()}`;
const TEST_AUDIENCE = '25 000 sledujících / 100 000 měsíční dosah';
const TEST_CATEGORIES = 'lifestyle, luxury rewards, e-commerce';

test.describe('Affiliate v2 — simplified registration + profile fields (spec 28)', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY,
    'Missing required env vars — skipping spec 28',
  );

  let affiliateId: string | null = null;
  let authUserId: string | null = null;

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (affiliateId) {
      await (admin as any).from('affiliate_accounts').delete().eq('id', affiliateId);
    } else {
      await (admin as any).from('affiliate_accounts').delete().eq('email', TEST_EMAIL);
    }
    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  });

  test('registration is short, still creates an account, and profile fields move to the dashboard', async ({ page }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    // ── 1. /affiliate/register no longer has social/profile fields or a manual ref_code ──
    await page.goto('/affiliate/register');

    await expect(page.getByLabel('Jméno / název *')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('E-mail *')).toBeVisible();
    await expect(page.getByLabel('Heslo *', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Heslo znovu *', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Telefon')).toBeVisible();
    await expect(page.getByText('Influencer — přivádím zákazníky', { exact: true })).toBeVisible();
    await expect(page.getByText('Obchodník — přivádím firmy / e-shopy', { exact: true })).toBeVisible();

    await expect(page.getByLabel('Hlavní kanál / web / profil')).toHaveCount(0);
    await expect(page.getByLabel('Instagram')).toHaveCount(0);
    await expect(page.getByLabel('TikTok')).toHaveCount(0);
    await expect(page.getByLabel('YouTube')).toHaveCount(0);
    await expect(page.getByLabel('Facebook')).toHaveCount(0);
    await expect(page.getByLabel('Velikost publika / dosah')).toHaveCount(0);
    await expect(page.getByLabel('Kategorie obsahu')).toHaveCount(0);
    await expect(page.getByLabel(/Doporučovací kód/)).toHaveCount(0);
    await expect(page.locator('#refCode')).toHaveCount(0);

    // Fill and confirm the short form actually works end-to-end in the UI
    // (values round-trip through React state) — matches what handleSubmit sends.
    await page.getByLabel('Jméno / název *').fill(TEST_NAME);
    await page.getByLabel('E-mail *').fill(TEST_EMAIL);
    await page.getByLabel('Heslo *', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Heslo znovu *', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Telefon').fill(TEST_PHONE);
    await page.getByText('Obchodník — přivádím firmy / e-shopy', { exact: true }).click();

    await expect(page.getByLabel('Jméno / název *')).toHaveValue(TEST_NAME);
    await expect(page.getByLabel('Telefon')).toHaveValue(TEST_PHONE);
    await expect(page.locator('body')).not.toContainText(TEST_PASSWORD);

    // ── 2 + 3. Short registration creates the account; server auto-generates ref_code ──
    // Mirrors exactly what the simplified handleSubmit now sends: p_ref_code
    // and all profile/social params are null.
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { affiliate_registration: true, name: TEST_NAME },
    });
    expect(createUserError, 'temporary affiliate auth user must be created without sending signup email').toBeNull();
    authUserId = createdUser.user?.id ?? null;
    expect(authUserId, 'temporary affiliate auth user id must exist').toBeTruthy();

    const affiliateClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInError } = await affiliateClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(signInError, 'temporary affiliate user must sign in for auth.uid()-bound registration RPC').toBeNull();

    const { data: rpcData, error: rpcError } = await (affiliateClient as any).rpc('register_affiliate_account', {
      p_name: TEST_NAME,
      p_email: TEST_EMAIL,
      p_phone: TEST_PHONE,
      p_modes: ['influencer', 'sales_rep'],
      p_ref_code: null,
      p_website_url: null,
      p_instagram_url: null,
      p_tiktok_url: null,
      p_youtube_url: null,
      p_facebook_url: null,
      p_audience_size: null,
      p_content_categories: null,
    });
    expect(rpcError, 'register_affiliate_account must still succeed with null profile fields').toBeNull();
    expect((rpcData as any)?.status).toBe('registered');
    const autoRefCode = (rpcData as any)?.ref_code as string | undefined;
    expect(autoRefCode, 'server must auto-generate a ref_code when none is supplied').toBeTruthy();
    expect(autoRefCode!.length).toBeGreaterThan(0);

    let saved: any = null;
    for (let i = 0; i < 20; i += 1) {
      const { data } = await (admin as any)
        .from('affiliate_accounts')
        .select('id, auth_user_id, name, email, phone, ref_code, modes, status, website_url, instagram_url, tiktok_url, youtube_url, facebook_url, audience_size, content_categories')
        .eq('email', TEST_EMAIL)
        .maybeSingle();
      if (data) {
        saved = data;
        break;
      }
      await page.waitForTimeout(500);
    }

    expect(saved, 'affiliate_accounts row must be created by the short registration').toBeTruthy();
    affiliateId = saved.id;
    authUserId = saved.auth_user_id;
    expect(saved.name).toBe(TEST_NAME);
    expect(saved.phone).toBe(TEST_PHONE);
    expect(saved.modes).toEqual(expect.arrayContaining(['influencer', 'sales_rep']));
    // Server-generated ref_code — never supplied by the (now removed) manual field.
    expect(saved.ref_code).toBe(autoRefCode);
    expect(saved.ref_code).toBeTruthy();
    // Profile/social fields must be empty right after registration — they are
    // filled in later, exclusively in Affiliate dashboard -> Profil.
    expect(saved.website_url).toBeNull();
    expect(saved.instagram_url).toBeNull();
    expect(saved.tiktok_url).toBeNull();
    expect(saved.youtube_url).toBeNull();
    expect(saved.facebook_url).toBeNull();
    expect(saved.audience_size).toBeNull();
    expect(saved.content_categories).toBeNull();

    await (admin as any)
      .from('affiliate_accounts')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', affiliateId);

    // ── 4. After approval + login, fill the profile fields in the dashboard ──
    await loginAffiliateViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
    await page.getByTestId('mode-btn-profile').click();

    await expect(page.getByText('Sociální sítě a dosah', { exact: true })).toBeVisible({ timeout: 10_000 });
    // Freshly registered — profile inputs start empty.
    await expect(page.getByTestId('affiliate-profile-website')).toHaveValue('');
    await expect(page.getByTestId('affiliate-profile-instagram')).toHaveValue('');
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText('Influencer');
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText('Obchodník');
    await expect(page.getByTestId('affiliate-profile-ref-code')).toContainText(autoRefCode!);
    await expect(page.locator('body')).not.toContainText(TEST_PASSWORD);

    await page.getByTestId('affiliate-profile-website').fill(TEST_WEBSITE);
    await page.getByTestId('affiliate-profile-instagram').fill(TEST_INSTAGRAM);
    await page.getByTestId('affiliate-profile-tiktok').fill(TEST_TIKTOK);
    await page.getByTestId('affiliate-profile-youtube').fill(TEST_YOUTUBE);
    await page.getByTestId('affiliate-profile-facebook').fill(TEST_FACEBOOK);
    await page.getByTestId('affiliate-profile-audience').fill(TEST_AUDIENCE);
    await page.getByTestId('affiliate-profile-categories').fill(TEST_CATEGORIES);

    const saveBtn = page.getByRole('button', { name: 'Uložit změny' }).first();
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'úspěšně uložen' }).first())
      .toBeVisible({ timeout: 10_000 });

    // DB readback — confirm the dashboard-entered profile fields persisted.
    let filled: any = null;
    for (let i = 0; i < 20; i += 1) {
      const { data } = await (admin as any)
        .from('affiliate_accounts')
        .select('instagram_url, audience_size, tiktok_url, youtube_url, facebook_url, website_url, content_categories')
        .eq('id', affiliateId)
        .maybeSingle();
      if (data?.instagram_url === TEST_INSTAGRAM) {
        filled = data;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(filled, 'profile fields filled in the dashboard must persist via update_affiliate_own_profile').toBeTruthy();
    expect(filled.website_url).toBe(TEST_WEBSITE);
    expect(filled.instagram_url).toBe(TEST_INSTAGRAM);
    expect(filled.tiktok_url).toBe(TEST_TIKTOK);
    expect(filled.youtube_url).toBe(TEST_YOUTUBE);
    expect(filled.facebook_url).toBe(TEST_FACEBOOK);
    expect(filled.audience_size).toBe(TEST_AUDIENCE);
    expect(filled.content_categories).toBe(TEST_CATEGORIES);

    // ── 5. Saved values survive a full page reload ──
    await page.reload();
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
    await page.getByTestId('mode-btn-profile').click();
    await expect(page.getByText('Sociální sítě a dosah', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('affiliate-profile-website')).toHaveValue(TEST_WEBSITE);
    await expect(page.getByTestId('affiliate-profile-instagram')).toHaveValue(TEST_INSTAGRAM);
    await expect(page.getByTestId('affiliate-profile-tiktok')).toHaveValue(TEST_TIKTOK);
    await expect(page.getByTestId('affiliate-profile-youtube')).toHaveValue(TEST_YOUTUBE);
    await expect(page.getByTestId('affiliate-profile-facebook')).toHaveValue(TEST_FACEBOOK);
    await expect(page.getByTestId('affiliate-profile-audience')).toHaveValue(TEST_AUDIENCE);
    await expect(page.getByTestId('affiliate-profile-categories')).toHaveValue(TEST_CATEGORIES);
  });
});
