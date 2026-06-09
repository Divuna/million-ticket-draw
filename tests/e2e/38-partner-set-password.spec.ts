/**
 * Spec 38 — Partner set-password page (/partner/set-password)
 *
 * Tests the onboarding flow for newly approved company partners.
 * After admin approval, the company receives an email with a one-time
 * Supabase recovery link. Clicking it should land them on /partner/set-password
 * so they can set their own password.
 *
 * Invariants tested:
 *   38a) /partner/set-password without a valid session → shows error state (invalid link)
 *   38b) With a valid session (simulated via admin generateLink + navigate) → shows
 *        the set-password form with all required fields
 *   38c) Password mismatch → shows Czech error toast, does not submit
 *   38d) Password too short → shows Czech error toast, does not submit
 *   38e) Valid password → updateUser succeeds, toast shown, redirect to /partner/dashboard
 *
 * Staging-only (requires E2E_SUPABASE_SERVICE_ROLE_KEY).
 * Self-contained: creates and cleans up a temporary test user.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL              ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY        ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY  ?? '';

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

async function createTestPartnerUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  return data.user.id;
}

/**
 * Vytvoří minimální NON-influencer partnerský záznam pro test uživatele.
 * Bez něj useUserRole vrátí isPartnerAccount=false, role guard v App.tsx
 * pak na /partner/set-password překresluje stránku (roleLoading spinner
 * + případný redirect), takže submit tlačítko není stabilní/akceschopné.
 *
 * notes ZÁMĚRNĚ neobsahuje "influencer" — jinak by se aktivoval influencer
 * guard a přesměroval na /affiliate/dashboard. status='approved'.
 * Vrací partner.id pro úklid.
 */
async function createTestPartnerRecord(
  admin: SupabaseClient,
  authUserId: string,
  email: string,
): Promise<string> {
  const { data, error } = await (admin as any)
    .from('partners')
    .insert({
      name: 'E2E Spec38 Test Partner',
      logo_url: '',
      website_url: '',
      contact_email: email,
      status: 'approved',
      auth_user_id: authUserId,
      notes: JSON.stringify({ account_type: 'company', e2e_spec: '38' }),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`partner record seed failed: ${error?.message}`);
  return data.id as string;
}

async function deleteTestPartnerRecord(admin: SupabaseClient, partnerId: string) {
  await (admin as any).from('partners').delete().eq('id', partnerId);
}

async function deleteTestUser(admin: SupabaseClient, userId: string) {
  await admin.auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Spec 38 — /partner/set-password onboarding', () => {

  // ── 38a: no session → error state ────────────────────────────────────────

  test('38a: /partner/set-password without session shows invalid-link state', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(30_000);

    // Navigate without any session
    await page.goto('/partner/set-password');

    // Should show invalid link error state (not the form)
    await expect(
      page.getByText('Odkaz je neplatný nebo vypršel'),
    ).toBeVisible({ timeout: 10_000 });

    // Should NOT show the password form
    await expect(page.getByTestId('psp-password')).not.toBeVisible();
    await expect(page.getByTestId('psp-submit')).not.toBeVisible();
  });

  // ── 38b: valid session → form visible ─────────────────────────────────────

  test('38b: with valid session the set-password form is shown', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts       = Date.now();
    const email    = `spec38b-${ts}@onemil.cz`;
    const password = `Sp38B_${ts}!`;
    let userId: string | null = null;
    let partnerId: string | null = null;

    try {
      userId = await createTestPartnerUser(admin, email, password);
      partnerId = await createTestPartnerRecord(admin, userId, email);

      // Sign in via the anon client to get a real session token,
      // then inject it via localStorage so the page picks it up
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: signInData, error: signInError } =
        await anonClient.auth.signInWithPassword({ email, password });
      if (signInError || !signInData.session) {
        throw new Error(`signIn failed: ${signInError?.message}`);
      }

      const session = signInData.session;

      // Inject session into the browser storage before navigating.
      // The app uses storageKey: 'onemil-auth' (see src/integrations/supabase/client.ts).
      await page.goto('/partner/set-password');
      await page.evaluate(
        ({ session }) => {
          localStorage.setItem(
            'onemil-auth',
            JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in,
              expires_at: session.expires_at,
              token_type: 'bearer',
              user: session.user,
            }),
          );
        },
        { session },
      );

      // Reload so the app picks up the injected session
      await page.reload();

      // Form should now be visible
      await expect(page.getByTestId('psp-password')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('psp-confirm')).toBeVisible();
      await expect(page.getByTestId('psp-submit')).toBeVisible();
      await expect(page.getByText('Nastavte si heslo')).toBeVisible();

    } finally {
      if (partnerId) await deleteTestPartnerRecord(admin, partnerId);
      if (userId) await deleteTestUser(admin, userId);
    }
  });

  // ── 38c: password mismatch → Czech error ──────────────────────────────────

  test('38c: mismatched passwords show Czech error toast', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts       = Date.now();
    const email    = `spec38c-${ts}@onemil.cz`;
    const password = `Sp38C_${ts}!`;
    let userId: string | null = null;
    let partnerId: string | null = null;

    try {
      userId = await createTestPartnerUser(admin, email, password);
      partnerId = await createTestPartnerRecord(admin, userId, email);

      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signInData } =
        await anonClient.auth.signInWithPassword({ email, password });
      if (!signInData.session) throw new Error('signIn failed');

      await page.goto('/partner/set-password');
      await page.evaluate(
        ({ session }) => {
          localStorage.setItem('onemil-auth', JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at,
            token_type: 'bearer',
            user: session.user,
          }));
        },
        { session: signInData.session },
      );
      await page.reload();

      await expect(page.getByTestId('psp-password')).toBeVisible({ timeout: 10_000 });
      await page.fill('[data-testid="psp-password"]', 'NewPassword123!');
      await page.fill('[data-testid="psp-confirm"]', 'DifferentPassword!');
      await page.click('[data-testid="psp-submit"]');

      // Czech mismatch error
      await expect(page.getByText('Hesla se neshodují')).toBeVisible({ timeout: 5_000 });

    } finally {
      if (partnerId) await deleteTestPartnerRecord(admin, partnerId);
      if (userId) await deleteTestUser(admin, userId);
    }
  });

  // ── 38d: password too short → Czech error ────────────────────────────────

  test('38d: password shorter than 8 chars shows Czech error toast', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts       = Date.now();
    const email    = `spec38d-${ts}@onemil.cz`;
    const password = `Sp38D_${ts}!`;
    let userId: string | null = null;
    let partnerId: string | null = null;

    try {
      userId = await createTestPartnerUser(admin, email, password);
      partnerId = await createTestPartnerRecord(admin, userId, email);

      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signInData } =
        await anonClient.auth.signInWithPassword({ email, password });
      if (!signInData.session) throw new Error('signIn failed');

      await page.goto('/partner/set-password');
      await page.evaluate(
        ({ session }) => {
          localStorage.setItem('onemil-auth', JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at,
            token_type: 'bearer',
            user: session.user,
          }));
        },
        { session: signInData.session },
      );
      await page.reload();

      await expect(page.getByTestId('psp-password')).toBeVisible({ timeout: 10_000 });
      await page.fill('[data-testid="psp-password"]', 'short');
      await page.fill('[data-testid="psp-confirm"]', 'short');
      await page.click('[data-testid="psp-submit"]');

      await expect(page.getByText('Heslo musí mít alespoň 8 znaků')).toBeVisible({ timeout: 5_000 });

    } finally {
      if (partnerId) await deleteTestPartnerRecord(admin, partnerId);
      if (userId) await deleteTestUser(admin, userId);
    }
  });

  // ── 38e: valid password → success + redirect ──────────────────────────────

  test('38e: valid password update shows success toast and redirects to /partner/dashboard', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ts         = Date.now();
    const email      = `spec38e-${ts}@onemil.cz`;
    const password   = `Sp38E_${ts}!`;
    const newPassword = `NewSp38E_${ts}!`;
    let userId: string | null = null;
    let partnerId: string | null = null;

    try {
      userId = await createTestPartnerUser(admin, email, password);
      partnerId = await createTestPartnerRecord(admin, userId, email);

      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signInData } =
        await anonClient.auth.signInWithPassword({ email, password });
      if (!signInData.session) throw new Error('signIn failed');

      await page.goto('/partner/set-password');
      await page.evaluate(
        ({ session }) => {
          localStorage.setItem('onemil-auth', JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at,
            token_type: 'bearer',
            user: session.user,
          }));
        },
        { session: signInData.session },
      );
      await page.reload();

      await expect(page.getByTestId('psp-password')).toBeVisible({ timeout: 10_000 });
      await page.fill('[data-testid="psp-password"]', newPassword);
      await page.fill('[data-testid="psp-confirm"]', newPassword);

      await Promise.all([
        page.waitForURL(/\/partner\/dashboard/, { timeout: 15_000 }),
        page.click('[data-testid="psp-submit"]'),
      ]);

      // Success toast
      await expect(page.getByText('Heslo bylo nastaveno')).toBeVisible({ timeout: 8_000 });

    } finally {
      if (partnerId) await deleteTestPartnerRecord(admin, partnerId);
      if (userId) await deleteTestUser(admin, userId);
    }
  });

});
