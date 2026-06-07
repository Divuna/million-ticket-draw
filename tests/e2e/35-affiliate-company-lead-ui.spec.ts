/**
 * Spec 35 — Affiliate dashboard: Přidat firmu UI (Phase 2B)
 *
 * Self-contained staging-only test.
 * Creates temporary test users via service role key, injects their session into
 * the browser, and navigates directly to /affiliate/dashboard.
 * No fixed password secrets required — only the existing service role secret.
 *
 * Required env vars (all already present in playwright-staging.yml):
 *   VITE_SUPABASE_URL               — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *
 * Invariants verified:
 *   35a) Approved sales_rep sees "Žádosti o registraci firem" section + "+ Přidat firmu"
 *   35b) Dialog opens with all 8 form fields; Zrušit closes it
 *   35c) Influencer-only account does NOT see the lead section
 *        (condition: account.modes.includes('sales_rep') must be false)
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF    = 'dxmowysntemfqfnanxua';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL              ?? '';
const SUPABASE_ANON  = process.env.VITE_SUPABASE_ANON_KEY         ?? '';
const SERVICE_ROLE   = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY  ?? '';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

function skipIfNotStaging() {
  if (
    !SUPABASE_URL.includes(STAGING_REF) ||
    !SUPABASE_ANON ||
    !SERVICE_ROLE
  ) {
    test.skip(
      true,
      'staging-only — requires VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY',
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CreatedUser = { authUserId: string; affiliateId: string };

async function createTestUser(
  admin: SupabaseClient,
  opts: { email: string; password: string; modes: string[]; refCode: string },
): Promise<CreatedUser> {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser: ${uErr.message}`);
  const authUserId = u.user.id;

  const { data: aff, error: aErr } = await (admin as any)
    .from('affiliate_accounts')
    .insert({
      auth_user_id: authUserId,
      name: `E2E Spec35 ${opts.refCode}`,
      email: opts.email,
      ref_code: opts.refCode,
      status: 'approved',
      modes: opts.modes,
      approved_at: new Date().toISOString(),
      notes: 'spec35 staging e2e temporary',
    })
    .select('id')
    .single();
  if (aErr) throw new Error(`affiliate insert: ${aErr.message}`);

  return { authUserId, affiliateId: aff.id as string };
}

async function getSession(email: string, password: string) {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn: ${error?.message ?? 'no session'}`);
  return data.session;
}

async function cleanup(
  admin: SupabaseClient,
  opts: { authUserId?: string | null; affiliateId?: string | null },
) {
  if (opts.affiliateId) {
    await (admin as any)
      .from('affiliate_company_leads')
      .delete()
      .eq('affiliate_id', opts.affiliateId);
    await (admin as any)
      .from('affiliate_accounts')
      .delete()
      .eq('id', opts.affiliateId);
  }
  if (opts.authUserId) {
    await admin.auth.admin.deleteUser(opts.authUserId);
  }
}

/**
 * Inject Supabase session into the browser's localStorage before first navigation.
 * addInitScript runs on every navigation in this page — the session stays fresh.
 */
async function injectSessionAndNavigate(
  page: import('@playwright/test').Page,
  session: object,
) {
  // Extract project ref from the Supabase URL hostname
  let ref = STAGING_REF;
  try { ref = new URL(SUPABASE_URL).hostname.split('.')[0]; } catch { /* keep default */ }

  const storageKey = `sb-${ref}-auth-token`;

  await page.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({
          essential: true,
          analytics: false,
          marketing: false,
          timestamp: new Date().toISOString(),
        }),
      );
      localStorage.removeItem('affiliate_active_mode');
    },
    { key: storageKey, data: session },
  );

  await page.goto('/affiliate/dashboard');
  await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
}

async function switchToSalesRepMode(page: import('@playwright/test').Page) {
  const btn = page.getByTestId('mode-btn-sales_rep');
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
  // Let mode switcher animation settle and data fetch begin
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Phase 2B UI — Přidat firmu (spec 35)', () => {

  // ── 35a: sales_rep sees section and button ──────────────────────────────

  test('35a: approved sales_rep sees lead section and + Přidat firmu button', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts       = Date.now();
    const email    = `spec35a-${ts}@onemil.cz`;
    const password = `Sp35A_${ts}!`;
    const refCode  = `S35A${String(ts).slice(-6)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createTestUser(admin, {
        email, password, modes: ['sales_rep'], refCode,
      }));

      const session = await getSession(email, password);
      await injectSessionAndNavigate(page, session);
      await switchToSalesRepMode(page);

      // Lead section heading
      await expect(
        page.getByText('Žádosti o registraci firem'),
      ).toBeVisible({ timeout: 15_000 });

      // "+ Přidat firmu" button (may appear twice: header + empty state CTA)
      const addBtn = page.getByTestId('add-company-lead-btn').first();
      await expect(addBtn).toBeVisible({ timeout: 10_000 });

      // Moje firmy (schválené) is the separate section — different data source
      await expect(
        page.getByText('Moje firmy (schválené)'),
      ).toBeVisible({ timeout: 10_000 });

    } finally {
      await cleanup(admin, { authUserId, affiliateId });
    }
  });

  // ── 35b: dialog fields ──────────────────────────────────────────────────

  test('35b: dialog opens with all 8 form fields and Zrušit closes it', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts       = Date.now();
    const email    = `spec35b-${ts}@onemil.cz`;
    const password = `Sp35B_${ts}!`;
    const refCode  = `S35B${String(ts).slice(-6)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createTestUser(admin, {
        email, password, modes: ['sales_rep'], refCode,
      }));

      const session = await getSession(email, password);
      await injectSessionAndNavigate(page, session);
      await switchToSalesRepMode(page);

      const addBtn = page.getByTestId('add-company-lead-btn').first();
      await expect(addBtn).toBeVisible({ timeout: 15_000 });
      await addBtn.click();

      // Dialog title
      await expect(
        page.getByText('Pozvat firmu do OneMil'),
      ).toBeVisible({ timeout: 8_000 });

      // Required fields
      await expect(page.locator('#acl-company_name')).toBeVisible();
      await expect(page.locator('#acl-company_email')).toBeVisible();

      // Optional fields
      await expect(page.locator('#acl-ico')).toBeVisible();
      await expect(page.locator('#acl-dic')).toBeVisible();
      await expect(page.locator('#acl-website')).toBeVisible();
      await expect(page.locator('#acl-contact_person')).toBeVisible();
      await expect(page.locator('#acl-contact_phone')).toBeVisible();
      await expect(page.locator('#acl-sales_rep_note')).toBeVisible();

      // Submit button present
      await expect(page.getByTestId('acl-submit-btn')).toBeVisible();

      // Zrušit closes dialog
      await page.getByRole('button', { name: 'Zrušit' }).click();
      await expect(
        page.getByText('Pozvat firmu do OneMil'),
      ).not.toBeVisible({ timeout: 5_000 });

    } finally {
      await cleanup(admin, { authUserId, affiliateId });
    }
  });

  // ── 35c: influencer-only does NOT see lead section ──────────────────────

  test('35c: influencer-only account does not see lead section in Obchodník mode', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts       = Date.now();
    const email    = `spec35c-${ts}@onemil.cz`;
    const password = `Sp35C_${ts}!`;
    const refCode  = `S35C${String(ts).slice(-6)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createTestUser(admin, {
        email, password, modes: ['influencer'], refCode,
      }));

      const session = await getSession(email, password);
      await injectSessionAndNavigate(page, session);
      await switchToSalesRepMode(page);

      // Allow data load to settle
      await page.waitForTimeout(2_000);

      // Lead section must NOT be present for influencer-only accounts
      // (condition: activeMode === 'sales_rep' && account.modes.includes('sales_rep'))
      // modes = ['influencer'] → includes('sales_rep') = false → section absent
      await expect(
        page.getByTestId('company-lead-section'),
      ).not.toBeVisible({ timeout: 5_000 });

    } finally {
      await cleanup(admin, { authUserId, affiliateId });
    }
  });

});
