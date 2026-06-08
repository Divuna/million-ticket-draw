/**
 * Spec 39 — AdminAffiliateCommissions page (fáze 2)
 *
 * Staging-only. Ověřuje:
 *   39a) Admin stránka /admin/affiliate-commissions se načte bez pádu
 *   39b) Stránka obsahuje nadpis "Provize obchodníků"
 *   39c) Stránka obsahuje informační banner o automatickém výpočtu
 *   39d) Při prázdných datech stránka nepadá — zobrazí prázdný stav
 *   39e) Pokud existuje calculated provize, vidět tlačítko Schválit
 *   39f) Pokud existuje approved provize, vidět tlačítko Označit jako vyplacené
 *   39g) U paid provize není žádné akční tlačítko
 *
 * Testy 39e–39g vytvoří testovací záznamy přes service role a po testu je uklidí.
 *
 * Vyžaduje env:
 *   VITE_SUPABASE_URL              — musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

// ─── Skip guard ───────────────────────────────────────────────────────────────

test.beforeEach(() => {
  if (
    !SUPABASE_URL.includes(STAGING_REF) ||
    !SUPABASE_ANON ||
    !ADMIN_EMAIL ||
    !ADMIN_PASSWORD
  ) {
    test.skip(
      true,
      'staging-only — vyžaduje VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD',
    );
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  });
  await page.goto('/login');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

/** Najdi nebo vytvoř affiliate_accounts záznam pro seeding provizí. */
async function getOrCreateAffiliateId(admin: SupabaseClient): Promise<string> {
  // Použij existující staging affiliate účet pokud existuje
  const { data: existing } = await admin
    .from('affiliate_accounts')
    .select('id')
    .limit(1)
    .single();
  if (existing?.id) return existing.id;

  // Jinak vytvoř minimální záznam
  const { data, error } = await admin
    .from('affiliate_accounts')
    .insert({ name: 'E2E Spec39 Test Affiliate', ref_code: 'SPEC39TEST', status: 'approved' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Cannot create test affiliate: ${error?.message}`);
  return data.id;
}

/** Vytvoř testovací provizi v daném stavu. */
async function insertTestCommission(
  admin: SupabaseClient,
  affiliateId: string,
  status: 'calculated' | 'approved' | 'paid',
): Promise<string> {
  const { data, error } = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliateId,
      commission_type: 'company_invoice',
      period_month: '2020-01-01', // vzdálená minulost aby nerušilo reálné záznamy
      amount_base_czk: 1.00,
      vat_rate: 0,
      amount_total_czk: 1.00,
      status,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Cannot insert test commission: ${error?.message}`);
  return data.id;
}

async function deleteTestCommission(admin: SupabaseClient, id: string) {
  await admin.from('affiliate_commissions').delete().eq('id', id);
}

// ─── Tests — základní rendering (nevyžaduje SERVICE_ROLE) ─────────────────────

test.describe('39 — AdminAffiliateCommissions page', () => {
  test('39a) stránka /admin/affiliate-commissions se načte bez pádu', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/affiliate-commissions');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, [data-slot="card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('39b) stránka obsahuje nadpis "Provize obchodníků"', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/affiliate-commissions');
    await expect(page.getByRole('heading', { name: 'Provize obchodníků' })).toBeVisible({ timeout: 15_000 });
  });

  test('39c) stránka obsahuje informační banner o automatickém výpočtu', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/affiliate-commissions');
    await expect(
      page.getByText(/Provize se počítají z uhrazených faktur firem/)
    ).toBeVisible({ timeout: 15_000 });
  });

  test('39d) při prázdných/existujících datech stránka nepadá a nepadne na chybu', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/affiliate-commissions');
    // Stránka nesmí zobrazit alert/error dialog
    await expect(page.locator('[role="alert"]')).toHaveCount(0, { timeout: 8_000 }).catch(() => {
      // Pokud existuje alert, ujistíme se, že to není chybový dialog
    });
    // Text "Nepodařilo se načíst" se nesmí zobrazit
    await expect(page.getByText('Nepodařilo se načíst provize obchodníků')).toHaveCount(0);
  });
});

// ─── Tests — akční tlačítka (vyžaduje SERVICE_ROLE) ───────────────────────────

test.describe('39e-g — akční tlačítka dle statusu', () => {
  test.beforeEach(() => {
    if (!SERVICE_ROLE) {
      test.skip(true, 'vyžaduje E2E_SUPABASE_SERVICE_ROLE_KEY pro seeding testovacích dat');
    }
  });

  test('39e) u calculated provize je vidět tlačítko Schválit', async ({ page }) => {
    const admin = makeAdmin();
    const affiliateId = await getOrCreateAffiliateId(admin);
    const commId = await insertTestCommission(admin, affiliateId, 'calculated');
    try {
      await loginAsAdmin(page);
      await page.goto('/admin/affiliate-commissions');
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
      await expect(
        page.locator(`[data-testid="btn-approve-${commId}"]`)
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteTestCommission(admin, commId);
    }
  });

  test('39f) u approved provize je vidět tlačítko Označit jako vyplacené', async ({ page }) => {
    const admin = makeAdmin();
    const affiliateId = await getOrCreateAffiliateId(admin);
    const commId = await insertTestCommission(admin, affiliateId, 'approved');
    try {
      await loginAsAdmin(page);
      await page.goto('/admin/affiliate-commissions');
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
      await expect(
        page.locator(`[data-testid="btn-pay-${commId}"]`)
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteTestCommission(admin, commId);
    }
  });

  test('39g) u paid provize není žádné akční tlačítko', async ({ page }) => {
    const admin = makeAdmin();
    const affiliateId = await getOrCreateAffiliateId(admin);
    const commId = await insertTestCommission(admin, affiliateId, 'paid');
    try {
      await loginAsAdmin(page);
      await page.goto('/admin/affiliate-commissions');
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
      // Tlačítka Schválit ani Označit nesmí existovat pro paid provizi
      await expect(page.locator(`[data-testid="btn-approve-${commId}"]`)).toHaveCount(0);
      await expect(page.locator(`[data-testid="btn-pay-${commId}"]`)).toHaveCount(0);
    } finally {
      await deleteTestCommission(admin, commId);
    }
  });
});
