/**
 * Affiliate v2 — registration profile fields (spec 28)
 *
 * Verifies that /affiliate/register stores the public/social registration fields
 * and that the approved affiliate can see them in /affiliate/dashboard -> Profil.
 * STAGING-ONLY. Skips cleanly when required env vars are missing.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL                 ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY            ?? '';
const SERVICE_KEY       = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY     ?? '';

const unique = Date.now().toString(36).toUpperCase();
const TEST_EMAIL = `affiliate-reg-fields-${unique.toLowerCase()}@onemil.cz`;
const TEST_PASSWORD = `AffReg${unique}!`;
const TEST_NAME = `Spec28 Affiliate ${unique}`;
const TEST_PHONE = '+420 777 222 333';
const TEST_REF_CODE = `SPEC28${unique}`.slice(0, 12);
const TEST_WEBSITE = `https://spec28-${unique.toLowerCase()}.onemil.test`;
const TEST_INSTAGRAM = `https://instagram.com/spec28_${unique.toLowerCase()}`;
const TEST_TIKTOK = `https://tiktok.com/@spec28_${unique.toLowerCase()}`;
const TEST_YOUTUBE = `https://youtube.com/@spec28${unique.toLowerCase()}`;
const TEST_FACEBOOK = `https://facebook.com/spec28.${unique.toLowerCase()}`;
const TEST_AUDIENCE = '25 000 sledujících / 100 000 měsíční dosah';
const TEST_CATEGORIES = 'lifestyle, luxury rewards, e-commerce';

test.describe('Affiliate v2 — registration profile fields (spec 28)', () => {
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
      await (admin as any).from('affiliate_accounts').delete().eq('ref_code', TEST_REF_CODE);
    }
    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  });

  test('registration stores all public profile fields and dashboard profile shows them', async ({ page }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    await page.goto('/affiliate/register');
    await page.getByLabel('Jméno / název *').fill(TEST_NAME);
    await page.getByLabel('E-mail *').fill(TEST_EMAIL);
    await page.getByLabel('Heslo *', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Heslo znovu *', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Telefon').fill(TEST_PHONE);
    await page.getByLabel('Hlavní kanál / web / profil').fill(TEST_WEBSITE);
    await page.getByLabel('Instagram').fill(TEST_INSTAGRAM);
    await page.getByLabel('TikTok').fill(TEST_TIKTOK);
    await page.getByLabel('YouTube').fill(TEST_YOUTUBE);
    await page.getByLabel('Facebook').fill(TEST_FACEBOOK);
    await page.getByLabel('Velikost publika / dosah').fill(TEST_AUDIENCE);
    await page.getByLabel('Kategorie obsahu').fill(TEST_CATEGORIES);
    await page.getByText('Obchodník — přivádím firmy / e-shopy', { exact: true }).click();
    await page.getByLabel('Doporučovací kód (návrh)').fill(TEST_REF_CODE);

    await expect(page.getByLabel('Hlavní kanál / web / profil')).toHaveValue(TEST_WEBSITE);
    await expect(page.getByLabel('Instagram')).toHaveValue(TEST_INSTAGRAM);
    await expect(page.getByLabel('TikTok')).toHaveValue(TEST_TIKTOK);
    await expect(page.getByLabel('YouTube')).toHaveValue(TEST_YOUTUBE);
    await expect(page.getByLabel('Facebook')).toHaveValue(TEST_FACEBOOK);
    await expect(page.getByLabel('Velikost publika / dosah')).toHaveValue(TEST_AUDIENCE);
    await expect(page.getByLabel('Kategorie obsahu')).toHaveValue(TEST_CATEGORIES);
    await expect(page.locator('body')).not.toContainText(TEST_PASSWORD);

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
      p_ref_code: TEST_REF_CODE,
      p_website_url: TEST_WEBSITE,
      p_instagram_url: TEST_INSTAGRAM,
      p_tiktok_url: TEST_TIKTOK,
      p_youtube_url: TEST_YOUTUBE,
      p_facebook_url: TEST_FACEBOOK,
      p_audience_size: TEST_AUDIENCE,
      p_content_categories: TEST_CATEGORIES,
    });
    expect(rpcError, 'register_affiliate_account must store all public profile fields').toBeNull();
    expect((rpcData as any)?.status).toBe('registered');

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

    expect(saved, 'affiliate_accounts row must be created by registration').toBeTruthy();
    affiliateId = saved.id;
    authUserId = saved.auth_user_id;
    expect(saved.name).toBe(TEST_NAME);
    expect(saved.phone).toBe(TEST_PHONE);
    expect(saved.ref_code).toBe(TEST_REF_CODE);
    expect(saved.modes).toEqual(expect.arrayContaining(['influencer', 'sales_rep']));
    expect(saved.website_url).toBe(TEST_WEBSITE);
    expect(saved.instagram_url).toBe(TEST_INSTAGRAM);
    expect(saved.tiktok_url).toBe(TEST_TIKTOK);
    expect(saved.youtube_url).toBe(TEST_YOUTUBE);
    expect(saved.facebook_url).toBe(TEST_FACEBOOK);
    expect(saved.audience_size).toBe(TEST_AUDIENCE);
    expect(saved.content_categories).toBe(TEST_CATEGORIES);

    await (admin as any)
      .from('affiliate_accounts')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', affiliateId);

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
    await page.getByTestId('mode-btn-profile').click();

    await expect(page.getByText('Sociální sítě a dosah', { exact: true })).toBeVisible({ timeout: 10_000 });
    // Social/registration fields are now editable inputs prefilled with registration values
    await expect(page.getByTestId('affiliate-profile-website')).toHaveValue(TEST_WEBSITE);
    await expect(page.getByTestId('affiliate-profile-instagram')).toHaveValue(TEST_INSTAGRAM);
    await expect(page.getByTestId('affiliate-profile-tiktok')).toHaveValue(TEST_TIKTOK);
    await expect(page.getByTestId('affiliate-profile-youtube')).toHaveValue(TEST_YOUTUBE);
    await expect(page.getByTestId('affiliate-profile-facebook')).toHaveValue(TEST_FACEBOOK);
    await expect(page.getByTestId('affiliate-profile-audience')).toHaveValue(TEST_AUDIENCE);
    await expect(page.getByTestId('affiliate-profile-categories')).toHaveValue(TEST_CATEGORIES);
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText('Influencer');
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText('Obchodník');
    await expect(page.getByTestId('affiliate-profile-ref-code')).toContainText(TEST_REF_CODE);
    await expect(page.locator('body')).not.toContainText(TEST_PASSWORD);

    // Edit social fields in the dashboard and save via update_affiliate_own_profile
    const EDIT_INSTAGRAM = `https://instagram.com/spec28edit_${unique.toLowerCase()}`;
    const EDIT_AUDIENCE = '50 000 sledujících / 200 000 měsíční dosah';
    await page.getByTestId('affiliate-profile-instagram').fill(EDIT_INSTAGRAM);
    await page.getByTestId('affiliate-profile-audience').fill(EDIT_AUDIENCE);

    const saveBtn = page.getByRole('button', { name: 'Uložit změny' }).first();
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    await expect(page.locator('[data-sonner-toast]'))
      .toContainText('úspěšně uložen', { timeout: 10_000 });

    // DB readback — confirm edited social fields persisted, others untouched
    let edited: any = null;
    for (let i = 0; i < 20; i += 1) {
      const { data } = await (admin as any)
        .from('affiliate_accounts')
        .select('instagram_url, audience_size, tiktok_url, youtube_url, facebook_url, website_url, content_categories')
        .eq('id', affiliateId)
        .maybeSingle();
      if (data?.instagram_url === EDIT_INSTAGRAM) {
        edited = data;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(edited, 'edited social fields must persist via update_affiliate_own_profile').toBeTruthy();
    expect(edited.instagram_url).toBe(EDIT_INSTAGRAM);
    expect(edited.audience_size).toBe(EDIT_AUDIENCE);
    // NULL-preserving / unchanged fields stay intact
    expect(edited.tiktok_url).toBe(TEST_TIKTOK);
    expect(edited.youtube_url).toBe(TEST_YOUTUBE);
    expect(edited.facebook_url).toBe(TEST_FACEBOOK);
    expect(edited.website_url).toBe(TEST_WEBSITE);
    expect(edited.content_categories).toBe(TEST_CATEGORIES);

    // After a full page reload the Profil inputs must show the saved DB values
    // (locks the form re-sync from freshly fetched data — not stale state).
    await page.reload();
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
    await page.getByTestId('mode-btn-profile').click();
    await expect(page.getByText('Sociální sítě a dosah', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('affiliate-profile-instagram')).toHaveValue(EDIT_INSTAGRAM);
    await expect(page.getByTestId('affiliate-profile-audience')).toHaveValue(EDIT_AUDIENCE);
    await expect(page.getByTestId('affiliate-profile-youtube')).toHaveValue(TEST_YOUTUBE);
    await expect(page.getByTestId('affiliate-profile-website')).toHaveValue(TEST_WEBSITE);
  });
});
