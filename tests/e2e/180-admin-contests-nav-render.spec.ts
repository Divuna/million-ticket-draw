/**
 * Spec 180 — regression: `/admin` must not crash with React error #130 for a
 * plain admin who holds the `contests.create` Phase 2 permission.
 *
 * Root cause (found and fixed alongside this spec): `AdminPrimaryNav.tsx` has
 * its own local `SUBADMIN_NAV_ICON` icon-lookup map, separate from
 * `SUBADMIN_ENTRY_ROUTES` in `useAdminPermissions.ts`. When `contests.create`
 * was added to `SUBADMIN_ENTRY_ROUTES` (spec 179 / commit 5ad3bec6), no
 * matching entry was added to `SUBADMIN_NAV_ICON`. `AdminPrimaryNav` renders
 * unconditionally inside `AdminLayout` on every `/admin/*` page (superadmin
 * and plain admin alike), so `<Icon .../>` with `Icon === undefined` throws
 * "Element type is invalid ... got: undefined" (React error #130) the moment
 * any admin holding `contests.create` loads any `/admin/*` URL. The app's
 * single top-level `<ErrorBoundary>` (src/App.tsx) then renders its Czech/EN
 * fallback ("Something went wrong").
 *
 * Unlike spec 179 (a static/contract test), this spec actually logs in as a
 * real staging admin account, grants/revokes the real `admin_permissions` row,
 * and renders the real pages in a real browser — a source-text assertion
 * cannot catch an `undefined` value flowing into JSX at runtime.
 *
 * Staging only. Uses the staging service-role key to temporarily scope
 * admin-e2e@onemil.cz's admin_permissions, then restores the original rows in
 * afterAll. No production project, no ticket/wallet/payment/contest data
 * writes — only `public.admin_permissions` rows for the scoped test admin.
 *
 * Required CI env (already mapped by playwright-staging.yml for the full
 * suite, same variables spec 39 / phase2-admin-permissions.spec.ts use):
 *   VITE_SUPABASE_URL          -> staging URL, must contain dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL             -> admin-e2e@onemil.cz
 *   E2E_ADMIN_PASSWORD
 * Optional (superadmin browser check):
 *   E2E_SUPERADMIN_EMAIL
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
const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const SCOPED_ADMIN_EMAIL = 'admin-e2e@onemil.cz';

// React error #130 ("Element type is invalid ... got: undefined") is caught by
// the app's single top-level <ErrorBoundary>, which renders this fallback.
const CRASH_HEADING = 'Something went wrong';
const CRASH_BODY = 'An unexpected error occurred. Please try refreshing the page.';
const ERROR_BOUNDARY_CONSOLE_MARKER = 'ErrorBoundary caught an error';

// RequirePermission's Czech fallback for a held-route without the permission.
const PERMISSION_FALLBACK_TEXT =
  'Tato část je dostupná pouze superadminovi nebo administrátorovi s oprávněním.';
// RequireSuperadminOrRedirect's fallback when a subadmin holds no safe route at all.
const NO_PERMISSION_AT_ALL_TEXT = 'Nemáte přiřazené žádné oprávnění administrace.';

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
  if (insertError) throw new Error(`admin_permissions grant failed: ${insertError.message}`);
}

/** Attaches pageerror + console listeners and returns collectors + an assertion helper. */
function watchForCrash(page: Page) {
  const pageErrors: string[] = [];
  const errorBoundaryConsoleHits: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes(ERROR_BOUNDARY_CONSOLE_MARKER)) {
      errorBoundaryConsoleHits.push(msg.text());
    }
  });
  return {
    async assertNoCrash() {
      // Primary signal: the ErrorBoundary fallback DOM must never be present —
      // this is what actually fires for a caught React #130, independent of
      // whether the browser also raises a top-level pageerror event.
      await expect(page.getByText(CRASH_HEADING, { exact: true }), 'ErrorBoundary fallback heading must not appear').toHaveCount(0);
      await expect(page.getByText(CRASH_BODY), 'ErrorBoundary fallback body must not appear').toHaveCount(0);
      expect(errorBoundaryConsoleHits, `console logged: ${errorBoundaryConsoleHits.join(' | ')}`).toEqual([]);
      expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    },
  };
}

test.describe.serial('180 — /admin does not crash with React #130 for contests.create admin', () => {
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
    // superadminId is only used as the `granted_by` audit value; fall back to
    // the scoped admin itself if no superadmin lookup email is configured.
    try {
      superadminId = SUPERADMIN_EMAIL
        ? await getUserIdByEmail(admin, SUPERADMIN_EMAIL)
        : scopedAdminId;
    } catch {
      superadminId = scopedAdminId;
    }
    originalScopedPermissions = await readPermissions(admin, scopedAdminId);
    mutatedScopedPermissions = true;
  });

  test.afterAll(async () => {
    if (!hasRequiredStagingEnv || !scopedAdminId || !mutatedScopedPermissions) return;
    const cleanupClient = admin ?? makeAdmin();
    await replacePermissions(cleanupClient, scopedAdminId, originalScopedPermissions, superadminId || scopedAdminId);
  });

  test('baseline: admin with NO permissions renders /admin without crashing', async ({ page }) => {
    test.setTimeout(90_000);
    await replacePermissions(admin, scopedAdminId, [], superadminId || scopedAdminId);

    const watcher = watchForCrash(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Expected non-crash outcome for zero permissions: the "no permission at
    // all" fallback — not the ErrorBoundary.
    await expect(page.getByText(NO_PERMISSION_AT_ALL_TEXT)).toBeVisible({ timeout: 20_000 });
    await watcher.assertNoCrash();
  });

  test('regression: admin WITH contests.create renders /admin without crashing (the actual bug)', async ({ page }) => {
    test.setTimeout(90_000);
    await replacePermissions(admin, scopedAdminId, ['contests.create'], superadminId || scopedAdminId);

    const watcher = watchForCrash(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // RequireSuperadminOrRedirect sends a contests.create-only admin straight
    // to /admin/contests (their only held safe entry route), and the contest
    // management page must actually mount there.
    await expect(page).toHaveURL(/\/admin\/contests$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Správa soutěží' })).toBeVisible({ timeout: 20_000 });
    await watcher.assertNoCrash();
  });

  test('/admin/contests renders for an admin holding contests.create', async ({ page }) => {
    test.setTimeout(90_000);
    await replacePermissions(admin, scopedAdminId, ['contests.create'], superadminId || scopedAdminId);

    const watcher = watchForCrash(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/contests');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page.getByRole('heading', { name: 'Správa soutěží' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PERMISSION_FALLBACK_TEXT)).toHaveCount(0);
    await watcher.assertNoCrash();
  });

  test('/admin/contests shows the permission fallback (not a crash) for an admin WITHOUT contests.create', async ({ page }) => {
    test.setTimeout(90_000);
    await replacePermissions(admin, scopedAdminId, [], superadminId || scopedAdminId);

    const watcher = watchForCrash(page);
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/contests');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page.getByText(PERMISSION_FALLBACK_TEXT)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Správa soutěží' })).toHaveCount(0);
    await watcher.assertNoCrash();
  });

  test('superadmin /admin still renders correctly (no regression)', async ({ page }) => {
    test.skip(!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD, 'no dedicated staging superadmin browser credentials present');
    test.setTimeout(90_000);

    const watcher = watchForCrash(page);
    await loginViaUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Správa soutěží' })).toBeVisible({ timeout: 20_000 });
    await watcher.assertNoCrash();
  });
});
