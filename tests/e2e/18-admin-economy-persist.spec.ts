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

const ADMIN_EMAIL       = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL)       ?? '';
const ADMIN_PASSWORD    = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD)    ?? '';
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
    // Do NOT use waitForLoadState('networkidle') — Supabase Realtime holds a
    // persistent WebSocket that prevents networkidle from ever resolving,
    // causing an indefinite hang that consumes the full 180s test budget.
    // Instead wait for a concrete element that proves the admin UI is ready.
    await expect(page.getByRole('button', { name: /Archiv test/i })).toBeVisible({ timeout: 15_000 });

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

    // ── Step 4a: Set "Náklad na hlavní výhru" in Basic tab ──────────────────
    // PR #57 moved this field from the Ekonomika tab to the Základní (Basic) tab,
    // next to "Hlavní výhra". Fill it there before switching to Ekonomika.
    await dialog.getByRole('tab', { name: /Vytvořit soutěž|Základní/i }).click().catch(async () => {
      // Tab label may vary — try the first tab (basic info)
      await dialog.getByRole('tab').first().click();
    });
    // Navigate explicitly to the Basic tab (value="basic")
    await dialog.locator('[role="tab"][data-value="basic"], [role="tab"]:has-text("Základní")').click().catch(async () => {
      // Fallback: click the tab whose panel contains "Hlavní výhra"
      await dialog.getByRole('tab').nth(0).click();
    });
    const basicPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await expect(basicPanel.getByText('Hlavní výhra', { exact: true })).toBeVisible({ timeout: 5_000 });
    await inputByLabel(basicPanel, 'Náklad na hlavní výhru').fill('4242');

    // ── Step 4b: Navigate to Ekonomika tab and set remaining economy values ──
    await dialog.getByRole('tab', { name: 'Ekonomika' }).click();
    const econPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await expect(econPanel.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();

    // Fill non-default values that are easy to assert on reload.
    // Note: "Náklad na MioCoin bonusy" is now always read-only (auto-derived from
    // MioCoin bonus setup in PR #56/#57) — it cannot be filled manually.
    await inputByLabel(econPanel, 'Jednorázový').fill('8888');
    await inputByLabel(econPanel, 'Cílová marže').fill('33');

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

    // Do not assert the toast text — Shadcn/Radix Toast duplicates content in a
    // hidden aria-live region; .first() can pick the invisible node and stall.
    // The dialog closing is the authoritative success signal: onSaved() only
    // fires after a successful RPC response, which closes the modal.
    await expect(dialog).not.toBeVisible({ timeout: 20_000 });

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
    // "Náklad na hlavní výhru" lives in the Basic tab since PR #57 — verify there.
    await dialog2.locator('[role="tab"][data-value="basic"], [role="tab"]:has-text("Základní")').click().catch(async () => {
      await dialog2.getByRole('tab').nth(0).click();
    });
    const basicPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    await expect(basicPanel2.getByText('Hlavní výhra', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(inputByLabel(basicPanel2, 'Náklad na hlavní výhru')).toHaveValue('4242', { timeout: 8_000 });

    // Remaining economy fields are in the Ekonomika tab.
    // "Náklad na MioCoin bonusy" is read-only (auto-derived) — not asserted here.
    await dialog2.getByRole('tab', { name: 'Ekonomika' }).click();
    const econPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    await expect(econPanel2.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();

    await expect(inputByLabel(econPanel2, 'Jednorázový')).toHaveValue('8888');
    await expect(inputByLabel(econPanel2, 'Cílová marže')).toHaveValue('33');

    // Close modal — best-effort cleanup; failures are non-fatal.
    // Use { timeout: 1000 } so the action throws quickly if the selector doesn't match
    // (the Shadcn close button has accessible name "Zavřít"/"Close", not aria-label="Close");
    // .catch(() => {}) then handles the timeout throw and Escape closes any residual dialog.
    await dialog2.locator('[aria-label="Close"], button[data-dialog-close]').click({ timeout: 1000 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  });
});
