/**
 * Login gating by account type (spec 33)
 *
 * - /affiliate/login: only users WITH an affiliate_accounts record get in;
 *   others are signed out with the affiliate message.
 * - /partner/login: only users WITH a partners record get in; others see the
 *   partner message (a pure affiliate is NOT redirected into affiliate dash).
 *
 * /login (customer) is intentionally NOT gated here — there is no reliable
 * "competitor account" signal in the DB (every partner/affiliate also has a
 * wallet). See the change notes / proposal.
 *
 * STAGING-ONLY. Skips when env vars are missing. Seeds a pure affiliate
 * (affiliate_accounts, no partners row) and uses the customer E2E account.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL              ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD           ?? '';
const ADMIN_EMAIL   = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL)            ?? '';
const ADMIN_PASSWORD= (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD)         ?? '';
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL          ?? '';
const SERVICE_KEY   = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const unique = Date.now().toString(36).toLowerCase();
const AFF_EMAIL = `spec33-aff-${unique}@onemil.cz`;
const AFF_PASSWORD = `Spec33${unique}!`;
const AFF_REF = `SPEC33${unique}`.slice(0, 12);

async function fillLogin(page: any, email: string, password: string) {
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
}

test.describe('Login gating by account type (spec 33)', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !SERVICE_KEY,
    'Missing required env vars — skipping spec 33',
  );

  let affUid: string | null = null;
  let affId: string | null = null;

  test.beforeAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin.auth.admin.createUser({
      email: AFF_EMAIL, password: AFF_PASSWORD, email_confirm: true,
      user_metadata: { name: 'Spec33 Pure Affiliate' },
    });
    if (error) throw new Error(`affiliate user seed failed: ${error.message}`);
    affUid = data.user?.id ?? null;
    if (!affUid) throw new Error('affiliate uid missing');
    const { data: aff, error: aErr } = await (admin as any)
      .from('affiliate_accounts')
      .insert({
        auth_user_id: affUid, name: 'Spec33 Pure Affiliate', email: AFF_EMAIL,
        ref_code: AFF_REF, modes: ['influencer'], status: 'approved',
        commission_rate_customer: 5, commission_rate_company: 5,
      })
      .select('id').single();
    if (aErr) throw new Error(`affiliate_accounts seed failed: ${aErr.message}`);
    affId = aff.id;
  });

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (affId) await (admin as any).from('affiliate_accounts').delete().eq('id', affId);
    if (affUid) await admin.auth.admin.deleteUser(affUid);
  });

  test('affiliate via /affiliate/login passes to dashboard', async ({ page }) => {
    await page.goto('/affiliate/login');
    await fillLogin(page, AFF_EMAIL, AFF_PASSWORD);
    await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
    expect(page.url()).toContain('/affiliate/dashboard');
  });

  test('affiliate via /partner/login is blocked with partner message', async ({ page }) => {
    await page.goto('/partner/login');
    await fillLogin(page, AFF_EMAIL, AFF_PASSWORD);
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'nemáte firemní Partner účet' }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/partner\/login/);
  });

  test('customer via /affiliate/login is blocked with affiliate message', async ({ page }) => {
    await page.goto('/affiliate/login');
    await fillLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'nemáte Affiliate účet' }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/affiliate\/login/);
  });

  test('affiliate via game /login is blocked, stays on /login (not bounced to dashboard)', async ({ page }) => {
    await page.goto('/login');
    await fillLogin(page, AFF_EMAIL, AFF_PASSWORD);
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'není registrovaný jako soutěžící' }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('customer via game /login passes', async ({ page }) => {
    await page.goto('/login');
    await fillLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });
    expect(page.url()).not.toContain('/affiliate/dashboard');
  });

  test('admin via game /login goes to /admin', async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin creds not set');
    await page.goto('/login');
    await fillLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin/, { timeout: 20_000 });
    expect(page.url()).toContain('/admin');
  });
});
