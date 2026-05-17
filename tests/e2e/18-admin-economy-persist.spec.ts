/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Economy Persist Test                                              ║
 * ║                                                                            ║
 * ║  Verifies Phase 4: economy assumptions saved via the admin contest modal   ║
 * ║  are persisted to `contest_economy` and reload correctly when the admin    ║
 * ║  reopens the same contest edit modal.                                      ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. The test mutates (saves) a dedicated draft contest that is  ║
 * ║  seeded fresh by the staging CI workflow for each run. It never touches    ║
 * ║  the general E2E contest or win-flow contest.                              ║
 * ║                                                                            ║
 * ║  Requires staging CI env vars:                                             ║
 * ║    E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD                                    ║
 * ║    E2E_SPEC18_CONTEST_ID  (seeded fresh by workflow each run)              ║
 * ║    VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY                              ║
 * ║                                                                            ║
 * ║  Skipped cleanly when any required env var is absent.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect, Locator } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL       = process.env.E2E_ADMIN_EMAIL       ?? '';
const ADMIN_PASSWORD    = process.env.E2E_ADMIN_PASSWORD    ?? '';
const SPEC18_CONTEST_ID = process.env.E2E_SPEC18_CONTEST_ID ?? '';
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL     ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Locate an <input> by the visible <label> text that precedes it.
 * Mirrors the same helper used in spec 16.
 */
function inputByLabel(dialog: Locator, labelText: string): Locator {
  return dialog
    .locator('label', { hasText: labelText })
    .locator('..')
    .locator('input');
}

test.describe('Admin — Economy Persist', () => {
  test('economy assumptions save and reload when contest is reopened', async ({ page }) => {
    test.setTimeout(120_000);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SPEC18_CONTEST_ID) {
      test.skip(
        true,
        'Admin credentials or spec-18 contest ID not set — staging-only test'
      );
    }

    // ── Step 1: Resolve contest title via public API ─────────────────────────
    // We need the title to locate the row in the admin contest table.
    const titleRes = await page.request.get(
      `${SUPABASE_URL}/rest/v1/contests?id=eq.${SPEC18_CONTEST_ID}&select=title,status`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    const titleJson = await titleRes.json();
    const contestTitle  = (titleJson[0]?.title  as string | undefined) ?? '';
    const contestStatus = (titleJson[0]?.status as string | undefined) ?? '';

    if (!contestTitle) {
      test.skip(true, 'Could not fetch spec-18 contest title from staging API');
    }

    // ── Step 2: Login as admin ───────────────────────────────────────────────
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/contests');
    await page.waitForLoadState('networkidle');

    // ── Step 3: Switch to the correct tab based on contest status ────────────
    // draft → "Archiv test" tab; pending/active/paused → "Aktivní soutěže" tab
    if (contestStatus === 'draft') {
      await page.getByRole('tab', { name: /Archiv test/i }).click();
      await page.waitForTimeout(500);
    }

    // ── Step 4: Find the spec-18 contest row and open edit modal ─────────────
    const contestRow = page.locator('tr', { hasText: contestTitle });
    await expect(contestRow).toBeVisible({ timeout: 15_000 });
    await contestRow.getByRole('button', { name: /Upravit/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ── Step 5: Navigate to Ekonomika tab and set distinctive economy values ──
    await dialog.getByRole('tab', { name: 'Ekonomika' }).click();
    const econPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await expect(econPanel.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();

    // Fill non-default values that are easy to assert on reload.
    await inputByLabel(dialog, 'Náklad na hlavní výhru').fill('4242');
    await inputByLabel(dialog, 'Náklad na MioCoin bonusy').fill('777');
    await inputByLabel(dialog, 'Jednorázový').fill('8888');
    await inputByLabel(dialog, 'Cílová marže').fill('33');

    // ── Step 6: Save the contest ─────────────────────────────────────────────
    const saveBtn = dialog.getByRole('button', { name: /Uložit|Vytvořit/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for the success toast
    await expect(
      page.getByText(/aktualizována|vytvořena/i)
    ).toBeVisible({ timeout: 20_000 });

    // Modal auto-closes after successful save (onSaved → setIsModalOpen(false))
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // ── Step 7: Reopen the same contest ──────────────────────────────────────
    // Admin list reloads after save; switch tab again if needed.
    if (contestStatus === 'draft') {
      await page.getByRole('tab', { name: /Archiv test/i }).click();
      await page.waitForTimeout(500);
    }

    const contestRowAfter = page.locator('tr', { hasText: contestTitle });
    await expect(contestRowAfter).toBeVisible({ timeout: 15_000 });
    await contestRowAfter.getByRole('button', { name: /Upravit/i }).click();

    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible({ timeout: 10_000 });

    // ── Step 8: Verify economy values persisted ───────────────────────────────
    await dialog2.getByRole('tab', { name: 'Ekonomika' }).click();
    const econPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    await expect(econPanel2.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();

    await expect(inputByLabel(dialog2, 'Náklad na hlavní výhru')).toHaveValue('4242', { timeout: 8_000 });
    await expect(inputByLabel(dialog2, 'Náklad na MioCoin bonusy')).toHaveValue('777');
    await expect(inputByLabel(dialog2, 'Jednorázový')).toHaveValue('8888');
    await expect(inputByLabel(dialog2, 'Cílová marže')).toHaveValue('33');

    // Close modal
    await dialog2.locator('[aria-label="Close"], button[data-dialog-close]').click().catch(() => {
      // If dedicated close button not found, press Escape
    });
    await page.keyboard.press('Escape');
  });
});
