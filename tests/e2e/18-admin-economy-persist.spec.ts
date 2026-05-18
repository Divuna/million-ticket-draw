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
 * ║                                                                            ║
 * ║  Row location strategy: the admin table renders each contest row with      ║
 * ║  "ID: <uuid>" visible text, so SPEC18_CONTEST_ID is used as a unique       ║
 * ║  locator — avoids false matches when multiple old E2E18 contests exist.    ║
 * ║                                                                            ║
 * ║  Seed requirements (enforced in playwright-staging.yml):                  ║
 * ║    status: "draft"  → appears in "Archiv test" tab (fewer rows, stable)   ║
 * ║    main_image set   → satisfies graphics validation so save btn is enabled ║
 * ║                                                                            ║
 * ║  Skipped cleanly when any required env var is absent.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect, Locator } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL       = process.env.E2E_ADMIN_EMAIL       ?? '';
const ADMIN_PASSWORD    = process.env.E2E_ADMIN_PASSWORD    ?? '';
const SPEC18_CONTEST_ID = process.env.E2E_SPEC18_CONTEST_ID ?? '';

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
    test.setTimeout(180_000);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SPEC18_CONTEST_ID) {
      test.skip(
        true,
        'Admin credentials or spec-18 contest ID not set — staging-only test'
      );
    }

    // Pre-seed cookie consent so the CookieConsentBanner (fixed bottom-0 z-[100])
    // never appears and never intercepts pointer events on table-row buttons.
    // The banner reads localStorage key 'cookie_consent' on mount; if present,
    // it stays hidden. addInitScript runs before every page load in this context.
    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });

    // ── Step 1: Login as admin ───────────────────────────────────────────────
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?tab=management');
    await page.waitForLoadState('networkidle');

    // ── Step 2: Switch to "Archiv test" tab ──────────────────────────────────
    // The seeded contest always has status="draft" so it lives in "Archiv test".
    // The admin tabs are <button> elements (not ARIA role="tab"), so we use
    // getByRole('button') rather than getByRole('tab').
    await page.getByRole('button', { name: /Archiv test/i }).click();
    await page.waitForTimeout(500);

    // ── Step 3: Find the spec-18 contest row and open edit modal ─────────────
    // Locate by SPEC18_CONTEST_ID — the admin table renders "ID: <uuid>" in
    // every row, making the UUID a unique, run-specific locator that avoids
    // collisions with old E2E18 contests from previous staging runs.
    const contestRow = page.locator('tr', { hasText: SPEC18_CONTEST_ID });
    await expect(contestRow).toBeVisible({ timeout: 15_000 });
    await contestRow.getByRole('button', { name: /Upravit/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Navigate to Ekonomika tab and set distinctive economy values ──
    await dialog.getByRole('tab', { name: 'Ekonomika' }).click();
    const econPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await expect(econPanel.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();

    // Fill non-default values that are easy to assert on reload.
    await inputByLabel(dialog, 'Náklad na hlavní výhru').fill('4242');
    await inputByLabel(dialog, 'Náklad na MioCoin bonusy').fill('777');
    await inputByLabel(dialog, 'Jednorázový').fill('8888');
    await inputByLabel(dialog, 'Cílová marže').fill('33');

    // ── Step 5: Navigate to the summary tab, then save ──────────────────────
    // The save button ("Uložit změny") lives exclusively inside
    // TabsContent value="create" (the "Vytvořit soutěž" summary tab).
    // It is not rendered when any other tab is active — so we must switch
    // to that tab before asserting or clicking the button.
    await dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click();

    // Save button is enabled because the seeded contest has main_image set.
    const saveBtn = dialog.getByRole('button', { name: /Uložit změny|Vytvořit soutěž/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for the success toast.
    // Use the full title string so the locator resolves to exactly one element
    // (toast title only) and avoids a strict-mode violation when the short word
    // also appears elsewhere on the page.
    await expect(
      page.getByText(/Soutěž (aktualizována|vytvořena)/i)
    ).toBeVisible({ timeout: 20_000 });

    // Modal auto-closes after successful save (onSaved → setIsModalOpen(false))
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // ── Step 6: Reopen the same contest ──────────────────────────────────────
    // Admin list reloads after save; switch back to "Archiv test" tab.
    await page.getByRole('button', { name: /Archiv test/i }).click();
    await page.waitForTimeout(500);

    const contestRowAfter = page.locator('tr', { hasText: SPEC18_CONTEST_ID });
    await expect(contestRowAfter).toBeVisible({ timeout: 15_000 });
    await contestRowAfter.getByRole('button', { name: /Upravit/i }).click();

    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible({ timeout: 10_000 });

    // ── Step 7: Verify economy values persisted ───────────────────────────────
    await dialog2.getByRole('tab', { name: 'Ekonomika' }).click();
    const econPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    await expect(econPanel2.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();

    await expect(inputByLabel(dialog2, 'Náklad na hlavní výhru')).toHaveValue('4242', { timeout: 8_000 });
    await expect(inputByLabel(dialog2, 'Náklad na MioCoin bonusy')).toHaveValue('777');
    await expect(inputByLabel(dialog2, 'Jednorázový')).toHaveValue('8888');
    await expect(inputByLabel(dialog2, 'Cílová marže')).toHaveValue('33');

    // Close modal — both steps are best-effort cleanup; failures are non-fatal.
    await dialog2.locator('[aria-label="Close"], button[data-dialog-close]').click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  });
});
