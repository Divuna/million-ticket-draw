/**
 * Spec 47 — Approved partner dashboard smoke (business-text + navigation lock)
 *
 * Staging-only, self-contained. Service role is used ONLY for setup/cleanup of a
 * single throwaway approved partner + auth user. No real PDF, no email, no
 * invoice, no production data.
 *
 * Required env vars (all present in playwright-staging.yml):
 *   VITE_SUPABASE_URL               — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *
 * Verifies (locks the live partner-dashboard business-text updates):
 *   47a) Approved partner can open /partner/dashboard.
 *   47b) Section "Nastavení konverze MioCoinů" is visible.
 *   47c) Conversion helper text is visible (exact copy).
 *   47d) Card "Fakturace MioCoinů" is visible.
 *   47e) "Moje faktury" navigates to /partner/invoices.
 *   47f) Logout works (best-effort — only if a logout control is exposed).
 *
 * Cleanup: deletes the partner and auth user in afterAll, even on failure.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF   = 'dxmowysntemfqfnanxua';
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE  = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN_ID = Date.now();
const PARTNER_EMAIL = `spec47-partner-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec47!${RUN_ID}x`;

const HELPER_TEXT =
  'Příklad: při nastavení 100 Kč = 1 MioCoin dostane zákazník za objednávku 500 Kč celkem 5 MioCoinů.';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SUPABASE_ANON && !!SERVICE_ROLE;

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ctx: { authUserId?: string; partnerId?: string } = {};

async function setupData(): Promise<void> {
  const admin = makeAdmin();
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: PARTNER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser: ${uErr.message}`);
  ctx.authUserId = u.user.id;

  const { data: p, error: pErr } = await (admin as any)
    .from('partners')
    .insert({
      name: `E2E Spec47 Partner ${RUN_ID}`,
      company_name: `E2E Spec47 Partner ${RUN_ID} s.r.o.`,
      logo_url: 'https://example.invalid/spec47-logo.png',
      website_url: 'https://example.invalid/spec47',
      contact_email: PARTNER_EMAIL,
      auth_user_id: u.user.id,
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);
  ctx.partnerId = p.id as string;
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();
  if (ctx.partnerId) {
    await (admin as any).from('partners').delete().eq('id', ctx.partnerId);
  }
  if (ctx.authUserId) {
    await admin.auth.admin.deleteUser(ctx.authUserId).catch(() => undefined);
  }
}

async function loginAsPartner(page: Page): Promise<void> {
  await page.goto('/partner/login');
  await page.locator('input[type="email"]').fill(PARTNER_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /Přihlásit se/i }).click();
  await page.waitForURL(/\/partner\/dashboard/, { timeout: 20_000 });
}

test.describe.serial('47 — Approved partner dashboard smoke', () => {
  test.skip(
    !isStaging,
    'staging-only — requires VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY',
  );

  test.beforeAll(async () => {
    await setupData();
  });

  test.afterAll(async () => {
    await cleanupData();
  });

  test('47a–47d: dashboard, conversion section, helper text, invoicing card', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsPartner(page);

    // 47a: dashboard reachable
    await expect(page).toHaveURL(/\/partner\/dashboard/);

    // 47b: conversion section heading
    await expect(
      page.getByText('Nastavení konverze MioCoinů', { exact: true }),
      'Section "Nastavení konverze MioCoinů" must be visible',
    ).toBeVisible({ timeout: 15_000 });

    // 47c: conversion helper text (exact live copy)
    await expect(
      page.getByText(HELPER_TEXT),
      'Conversion helper example text must be visible',
    ).toBeVisible();

    // 47d: invoicing explainer card
    await expect(
      page.getByText('Fakturace MioCoinů', { exact: true }),
      'Card "Fakturace MioCoinů" must be visible',
    ).toBeVisible();
  });

  test('47e: "Moje faktury" navigates to /partner/invoices', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsPartner(page);

    await page.getByRole('button', { name: 'Moje faktury' }).click();
    await page.waitForURL(/\/partner\/invoices/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Moje faktury' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('47f: logout via partner top-nav redirects to /partner/login', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsPartner(page);

    // The partner top navigation (PartnerHeader) exposes an "Odhlásit se" button
    // (visible at the default desktop viewport). handleLogout signs out and
    // navigates to /partner/login.
    await page.getByRole('button', { name: /Odhlásit se/i }).click();

    await page.waitForURL(/\/partner\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/partner\/login/);
  });
});
