/**
 * Spec 39 — AdminAffiliateCommissions read-only page (fáze 1)
 *
 * Staging-only. Ověřuje:
 *   39a) Admin vidí stránku /admin/affiliate-commissions bez pádu
 *   39b) Stránka obsahuje nadpis "Provize obchodníků"
 *   39c) Stránka obsahuje informační banner o automatickém výpočtu
 *
 * Nevytváří testovací data — pouze načte stránku a ověří základní rendering.
 *
 * Vyžaduje env:
 *   VITE_SUPABASE_URL — musí obsahovat staging ref dxmowysntemfqfnanxua
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */
import { test, expect, type Page } from '@playwright/test';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

// ─── Skip guard ───────────────────────────────────────────────────────────────

test.beforeEach(() => {
  if (!SUPABASE_URL.includes(STAGING_REF) || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    test.skip(true, 'staging-only — vyžaduje VITE_SUPABASE_URL (staging), E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD');
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('39 — AdminAffiliateCommissions read-only page', () => {
  test('39a) admin stránka /admin/affiliate-commissions se načte bez pádu', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/affiliate-commissions');
    // Stránka nesmí zobrazit chybovou stránku ani spadnout
    await expect(page).not.toHaveURL(/\/login/);
    // Počkáme na jakýkoliv obsah (heading nebo skeleton)
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
});
