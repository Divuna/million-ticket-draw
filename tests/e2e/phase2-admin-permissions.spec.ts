/**
 * Phase 2 targeted staging smoke for granular admin permissions.
 *
 * Staging only. Uses the staging service-role key in CI to temporarily give
 * admin-e2e@onemil.cz exactly vouchers.manage, then restores the original
 * admin_permissions rows in afterAll. No production project, Edge Functions,
 * ticket/voucher purchases, or unrelated data writes.
 *
 * Required CI env (already mapped by playwright-staging.yml):
 *   VITE_SUPABASE_URL                  -> staging URL, must contain dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL                    -> admin-e2e@onemil.cz
 *   E2E_ADMIN_PASSWORD
 *
 * Optional CI env for the browser superadmin smoke:
 *   E2E_SUPERADMIN_EMAIL               -> divispavel2@gmail.com
 *   E2E_SUPERADMIN_PASSWORD
 */

import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

const SCOPED_ADMIN_EMAIL = 'admin-e2e@onemil.cz';
const SUPERADMIN_EMAIL =
  process.env.E2E_SUPERADMIN_EMAIL ??
  process.env.STAGING_E2E_SUPERADMIN_EMAIL ??
  '';
const SUPERADMIN_PASSWORD =
  process.env.E2E_SUPERADMIN_PASSWORD ??
  process.env.STAGING_E2E_SUPERADMIN_PASSWORD ??
  '';
const EXPECTED_SUPERADMIN_EMAIL = 'divispavel2@gmail.com';

const FALLBACK_TEXT =
  'Tato část je dostupná pouze superadminovi nebo administrátorovi s oprávněním.';
// RequireSuperadmin (Phase 3) renders this distinct in-place fallback (note the
// trailing period after "superadminovi", absent in the RequirePermission text).
const SUPERADMIN_ONLY_FALLBACK_TEXT = 'Tato část je dostupná pouze superadminovi.';

const SAFE_PERMISSION_KEYS = [
  'vouchers.manage',
  'content.manage',
  'banners.manage',
  'notifications.manage',
] as const;

const DENIED_SAFE_ROUTES = [
  '/admin/content',
  '/admin/banners',
  '/admin/notifications',
] as const;

const SENSITIVE_OR_UNSCOPED_LINKS = [
  '/admin/statistics',
  '/admin/users',
  '/admin/admins',
  '/admin/payments',
  '/admin/winners',
  '/admin/prize-delivery',
  '/admin/audit-logs',
  '/admin/invoices',
  '/admin/affiliate-commissions',
  '/admin/affiliate-payouts',
] as const;

const hasRequiredStagingEnv =
  SUPABASE_URL.includes(STAGING_REF) &&
  Boolean(SUPABASE_ANON) &&
  Boolean(SERVICE_ROLE) &&
  Boolean(ADMIN_EMAIL) &&
  Boolean(ADMIN_PASSWORD);

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getUserIdByEmail(admin: SupabaseClient, email: string): Promise<string> {
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed for ${email}: ${error.message}`);

    const user = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (user) return user.id;

    if (data.users.length < 1000) break;
  }

  throw new Error(`Expected staging auth user not found: ${email}`);
}

async function readUserRoles(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await (admin as any)
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error) throw new Error(`read user_roles failed: ${error.message}`);
  return ((data ?? []) as { role: string }[]).map((row) => row.role).sort();
}

async function readPermissions(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await (admin as any)
    .from('admin_permissions')
    .select('permission_key')
    .eq('user_id', userId);
  if (error) throw new Error(`read admin_permissions failed: ${error.message}`);
  return ((data ?? []) as { permission_key: string }[]).map((row) => row.permission_key).sort();
}

async function replacePermissions(
  admin: SupabaseClient,
  userId: string,
  permissionKeys: string[],
  grantedBy: string,
): Promise<void> {
  const { error: deleteError } = await (admin as any)
    .from('admin_permissions')
    .delete()
    .eq('user_id', userId);
  if (deleteError) throw new Error(`admin_permissions cleanup failed: ${deleteError.message}`);

  if (permissionKeys.length === 0) return;

  const rows = permissionKeys.map((permissionKey) => ({
    user_id: userId,
    permission_key: permissionKey,
    granted_by: grantedBy,
  }));
  const { error: insertError } = await (admin as any).from('admin_permissions').insert(rows);
  if (insertError) throw new Error(`admin_permissions restore/grant failed: ${insertError.message}`);
}

async function hasAdminPermission(
  admin: SupabaseClient,
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const { data, error } = await (admin as any).rpc('has_admin_permission', {
    check_key: permissionKey,
    check_user_id: userId,
  });
  if (error) throw new Error(`has_admin_permission(${permissionKey}) failed: ${error.message}`);
  return data === true;
}

async function expectVisibleAdminLink(page: Page, href: string): Promise<void> {
  await expect(page.locator(`a[href="${href}"]:visible`).first(), `${href} should be visible`).toBeVisible({
    timeout: 15_000,
  });
}

async function expectNoVisibleAdminLink(page: Page, href: string): Promise<void> {
  await expect(page.locator(`a[href="${href}"]:visible`), `${href} should be hidden`).toHaveCount(0);
}

test.describe.serial('Phase 2 admin permissions - staging targeted smoke', () => {
  test.skip(
    !hasRequiredStagingEnv,
    'staging-only: requires staging URL, anon key, service-role key, and admin-e2e credentials',
  );

  let admin: SupabaseClient;
  let scopedAdminId = '';
  let superadminId = '';
  let originalScopedPermissions: string[] = [];
  let mutatedScopedPermissions = false;

  test.beforeAll(async () => {
    admin = makeAdmin();

    expect(ADMIN_EMAIL.toLowerCase(), 'E2E_ADMIN_EMAIL must be the scoped staging admin').toBe(
      SCOPED_ADMIN_EMAIL,
    );

    scopedAdminId = await getUserIdByEmail(admin, SCOPED_ADMIN_EMAIL);
    superadminId = await getUserIdByEmail(admin, EXPECTED_SUPERADMIN_EMAIL);

    await expect(readUserRoles(admin, scopedAdminId)).resolves.toContain('admin');
    await expect(readUserRoles(admin, superadminId)).resolves.toContain('superadmin');

    originalScopedPermissions = await readPermissions(admin, scopedAdminId);
    await replacePermissions(admin, scopedAdminId, ['vouchers.manage'], superadminId);
    mutatedScopedPermissions = true;
  });

  test.afterAll(async () => {
    if (!hasRequiredStagingEnv || !scopedAdminId || !mutatedScopedPermissions) return;

    const cleanupClient = admin ?? makeAdmin();
    const grantedBy = superadminId || scopedAdminId;
    await replacePermissions(cleanupClient, scopedAdminId, originalScopedPermissions, grantedBy);
  });

  test('DB helper gives scoped admin only vouchers.manage and keeps superadmin implicit-all', async () => {
    await expect(readPermissions(admin, scopedAdminId)).resolves.toEqual(['vouchers.manage']);

    await expect(hasAdminPermission(admin, scopedAdminId, 'vouchers.manage')).resolves.toBe(true);
    await expect(hasAdminPermission(admin, scopedAdminId, 'content.manage')).resolves.toBe(false);
    await expect(hasAdminPermission(admin, scopedAdminId, 'banners.manage')).resolves.toBe(false);
    await expect(hasAdminPermission(admin, scopedAdminId, 'notifications.manage')).resolves.toBe(false);

    for (const key of SAFE_PERMISSION_KEYS) {
      await expect(hasAdminPermission(admin, superadminId, key), `superadmin has ${key}`).resolves.toBe(true);
    }
  });

  test('scoped admin can access vouchers only and gets Czech fallback on denied safe routes', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/admin/vouchers');
    await expect(
      page.getByRole('heading', { name: 'Přehled voucherů', exact: true }),
      '/admin/vouchers should render for vouchers.manage',
    ).toBeVisible({ timeout: 20_000 });
    await expectVisibleAdminLink(page, '/admin/vouchers');

    await expectNoVisibleAdminLink(page, '/admin/content');
    await expectNoVisibleAdminLink(page, '/admin/banners');
    await expectNoVisibleAdminLink(page, '/admin/notifications');
    for (const href of SENSITIVE_OR_UNSCOPED_LINKS) {
      await expectNoVisibleAdminLink(page, href);
    }

    for (const route of DENIED_SAFE_ROUTES) {
      await page.goto(route);
      await expect(page.getByText(FALLBACK_TEXT), `${route} should show permission fallback`).toBeVisible({
        timeout: 20_000,
      });
    }

    // Phase 3: /admin/admins is wrapped in RequireSuperadmin, which renders an
    // in-place Czech fallback (URL stays /admin/admins) rather than redirecting.
    await page.goto('/admin/admins');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(
      page.getByText(SUPERADMIN_ONLY_FALLBACK_TEXT),
      '/admin/admins should show superadmin-only fallback for scoped admin',
    ).toBeVisible({ timeout: 20_000 });
    await expectNoVisibleAdminLink(page, '/admin/admins');

    expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('superadmin browser smoke keeps full access when dedicated credentials exist', async ({ page }) => {
    test.skip(
      !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
      'No dedicated staging superadmin browser credentials present; DB helper superadmin check covers implicit-all.',
    );
    test.skip(
      SUPERADMIN_EMAIL.toLowerCase() !== EXPECTED_SUPERADMIN_EMAIL,
      'Superadmin browser smoke requires divispavel2@gmail.com credentials.',
    );

    test.setTimeout(90_000);

    await loginViaUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    await page.goto('/admin/admins');
    await expect(page).toHaveURL(/\/admin\/admins$/);
    await expect(page.getByText('Oprávnění (Phase 2)')).toBeVisible({ timeout: 20_000 });

    for (const route of ['/admin/vouchers', '/admin/content', '/admin/banners', '/admin/notifications']) {
      await page.goto(route);
      await expect(page.getByText(FALLBACK_TEXT), `${route} should not show fallback for superadmin`).toHaveCount(0);
    }
  });
});
