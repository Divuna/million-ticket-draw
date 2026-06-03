/**
 * Admin /influencers detail shows affiliate_accounts social links (spec 30)
 *
 * Root cause locked here: /admin/influencers (AdminInfluencers) read social
 * links from the legacy partners.notes.social_networks, but affiliates now edit
 * them in /affiliate/dashboard which writes to affiliate_accounts. So the admin
 * detail showed "—" while the affiliate's real links lived in affiliate_accounts.
 *
 * Fix: the detail now prefers affiliate_accounts (matched by auth_user_id),
 * falling back to partners.notes. This spec seeds a partner + a linked affiliate
 * account whose notes.social_networks are empty, and asserts the admin detail
 * shows the affiliate_accounts values.
 *
 * STAGING-ONLY. Skips cleanly when required env vars are missing.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL              ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD           ?? '';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL            ?? '';
const SERVICE_KEY    = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const unique = Date.now().toString(36).toLowerCase();
const EMAIL   = `spec30-aff-${unique}@onemil.cz`;
const PASSWORD = `Spec30${unique}!`;
const NAME    = `Spec30 Affiliate ${unique}`;
const REF_CODE = `SPEC30${unique}`.slice(0, 12);

const AFF_INSTAGRAM = `https://instagram.com/spec30_${unique}`;
const AFF_YOUTUBE   = `https://youtube.com/@spec30_${unique}`;
const AFF_WEBSITE   = `https://spec30-${unique}.onemil.test`;
const AFF_AUDIENCE  = '12k-30k';
const AFF_CATEGORY  = 'spec30 fitness';
const LEGACY_WEBSITE = 'https://legacy-partner.onemil.test';

test.describe('Admin /influencers detail shows affiliate social (spec 30)', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_URL || !SERVICE_KEY,
    'Missing required env vars — skipping spec 30',
  );

  let authUserId: string | null = null;
  let partnerId: string | null = null;
  let affiliateId: string | null = null;

  test.beforeAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { name: NAME },
    });
    if (userErr) throw new Error(`auth user seed failed: ${userErr.message}`);
    authUserId = created.user?.id ?? null;
    if (!authUserId) throw new Error('auth user id missing');

    // Legacy partner row — notes.social_networks intentionally empty (the bug source)
    const { data: partner, error: pErr } = await (admin as any)
      .from('partners')
      .insert({
        name: NAME, logo_url: '', website_url: LEGACY_WEBSITE,
        contact_email: EMAIL, status: 'approved', auth_user_id: authUserId,
        // notes must contain "influencer" — the list query filters .ilike(notes, %influencer%)
        notes: JSON.stringify({ account_type: 'influencer', social_networks: { instagram: null, tiktok: null, youtube: null, facebook: null } }),
      })
      .select('id').single();
    if (pErr) throw new Error(`partner seed failed: ${pErr.message}`);
    partnerId = partner.id;

    // Affiliate v2 self-profile — the source of truth with real links
    const { data: aff, error: aErr } = await (admin as any)
      .from('affiliate_accounts')
      .insert({
        auth_user_id: authUserId, name: NAME, email: EMAIL, ref_code: REF_CODE,
        modes: ['influencer'], status: 'approved',
        commission_rate_customer: 5, commission_rate_company: 5,
        instagram_url: AFF_INSTAGRAM, youtube_url: AFF_YOUTUBE, website_url: AFF_WEBSITE,
        audience_size: AFF_AUDIENCE, content_categories: AFF_CATEGORY,
      })
      .select('id').single();
    if (aErr) throw new Error(`affiliate seed failed: ${aErr.message}`);
    affiliateId = aff.id;
  });

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (affiliateId) await (admin as any).from('affiliate_accounts').delete().eq('id', affiliateId);
    if (partnerId)   await (admin as any).from('partners').delete().eq('id', partnerId);
    if (authUserId)  await admin.auth.admin.deleteUser(authUserId);
  });

  test('admin detail shows affiliate_accounts social links, not empty notes', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/influencers');
    await expect(page.getByRole('heading', { name: 'Affiliate partneři', exact: true }))
      .toBeVisible({ timeout: 15_000 });

    const detailBtn = page.getByTestId(`open-influencer-detail-${partnerId}`);
    await expect(detailBtn).toBeVisible({ timeout: 15_000 });
    await detailBtn.click();

    // Social links come from affiliate_accounts (not the empty partners.notes)
    await expect(page.getByTestId('admin-influencer-social-instagram')).toHaveText(AFF_INSTAGRAM, { timeout: 10_000 });
    await expect(page.getByTestId('admin-influencer-social-youtube')).toHaveText(AFF_YOUTUBE);
    // website prefers affiliate_accounts.website_url over legacy partners.website_url
    await expect(page.getByTestId('admin-influencer-social-website')).toHaveText(AFF_WEBSITE);
    await expect(page.getByTestId('admin-influencer-social-website')).not.toHaveText(LEGACY_WEBSITE);

    // Affiliate profile (audience / category) also prefers affiliate_accounts
    await expect(page.getByText(AFF_AUDIENCE, { exact: false })).toBeVisible();
    await expect(page.getByText(AFF_CATEGORY, { exact: false })).toBeVisible();
  });
});
