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

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
    await expect(page.getByText('Registrace odeslána', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(TEST_PASSWORD);

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

    await expect(page.getByText('Registrační údaje', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('affiliate-profile-website')).toContainText(TEST_WEBSITE);
    await expect(page.getByTestId('affiliate-profile-instagram')).toContainText(TEST_INSTAGRAM);
    await expect(page.getByTestId('affiliate-profile-tiktok')).toContainText(TEST_TIKTOK);
    await expect(page.getByTestId('affiliate-profile-youtube')).toContainText(TEST_YOUTUBE);
    await expect(page.getByTestId('affiliate-profile-facebook')).toContainText(TEST_FACEBOOK);
    await expect(page.getByTestId('affiliate-profile-audience')).toContainText(TEST_AUDIENCE);
    await expect(page.getByTestId('affiliate-profile-categories')).toContainText(TEST_CATEGORIES);
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText('Influencer');
    await expect(page.getByTestId('affiliate-profile-modes')).toContainText('Obchodník');
    await expect(page.getByTestId('affiliate-profile-ref-code')).toContainText(TEST_REF_CODE);
    await expect(page.locator('body')).not.toContainText(TEST_PASSWORD);
  });
});
