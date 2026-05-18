/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Physical Bonus Prize Economy Persist Test                         ║
 * ║                                                                            ║
 * ║  Verifies Phase 4: physical bonus prize economy metadata entered in the    ║
 * ║  admin contest modal (Bonusy – věcné tab) is persisted to the              ║
 * ║  bonus_prizes table and reloads correctly when the admin reopens the same  ║
 * ║  contest edit modal.                                                       ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Reuses the same draft contest seeded by the staging CI      ║
 * ║  workflow for spec 18 (E2E_SPEC18_CONTEST_ID). Spec 18 runs first and      ║
 * ║  always saves the contest with zero physical prizes, leaving bonus_prizes  ║
 * ║  empty for this contest — giving spec 19 a clean slate.                   ║
 * ║                                                                            ║
 * ║  Note: the physical prize form currently shows a UI notice                ║
 * ║  "Do Supabase se v této fázi neukládají." — this is a stale message.      ║
 * ║  The save code does write supplier_name, unit_cost_czk, vat_rate_percent, ║
 * ║  and handling_override_czk to bonus_prizes after the RPC. This test        ║
 * ║  verifies that persistence works end-to-end.                              ║
 * ║                                                                            ║
 * ║  Requires staging CI env vars:                                             ║
 * ║    E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD                                    ║
 * ║    E2E_SPEC18_CONTEST_ID  (seeded fresh by workflow each run)              ║
 * ║                                                                            ║
 * ║  Row location strategy: the admin table renders each contest row with      ║
 * ║  "ID: <uuid>" visible text, so SPEC18_CONTEST_ID is used as a unique       ║
 * ║  locator — avoids false matches when multiple old E2E18 contests exist.    ║
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
 * Locate an <input> by the visible <label> text within a given container.
 *
 * Scoped to `container` (not the full dialog) to avoid strict-mode violations
 * when the same label substring exists in another tab panel. For example:
 *   "DPH v %"  — physical prize form  (active panel)
 *   "Sazba DPH v %" — Ekonomika tab  (inactive panel, still in DOM)
 * Inactive Shadcn TabsContent panels remain mounted with data-state="inactive";
 * scoping to the active panel prevents false matches.
 */
function inputByLabel(container: Locator, labelText: string): Locator {
  return container
    .locator('label', { hasText: labelText })
    .locator('..')
    .locator('input');
}

test.describe('Admin — Physical Prize Economy Persist', () => {
  test('physical prize economy fields save and reload when contest is reopened', async ({ page }) => {
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
    // persistent WebSocket that prevents networkidle from ever resolving.
    await expect(page.getByRole('button', { name: /Archiv test/i })).toBeVisible({ timeout: 15_000 });

    // ── Step 2: Switch to "Archiv test" tab ──────────────────────────────────
    await page.getByRole('button', { name: /Archiv test/i }).click();
    await page.waitForTimeout(500);

    // ── Step 3: Find the spec-18 contest row and open edit modal ─────────────
    const contestRow = page.locator('tr', { hasText: SPEC18_CONTEST_ID });
    await expect(contestRow).toBeVisible({ timeout: 15_000 });
    await contestRow.getByRole('button', { name: /Upravit/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Navigate to "Bonusy – věcné" tab ─────────────────────────────
    // Tab trigger text uses en-dash (U+2013): "Bonusy – věcné"
    await dialog.getByRole('tab', { name: 'Bonusy – věcné' }).click();

    // Scope all form interactions to the active tab panel.
    // This avoids label collisions with inactive panels that remain in the DOM.
    const physicalPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await expect(physicalPanel.getByText('Věcné bonusové výhry')).toBeVisible({ timeout: 5_000 });

    // ── Step 5: Fill physical prize form ─────────────────────────────────────
    await inputByLabel(physicalPanel, 'Popis výhry').fill('E2E Věcná výhra');
    await inputByLabel(physicalPanel, 'Pozice tiketu').fill('42');
    await inputByLabel(physicalPanel, 'Dodavatel').fill('E2E Dodavatel s.r.o.');
    await inputByLabel(physicalPanel, 'Nákupní cena bez DPH v Kč').fill('1000');
    // "DPH v %" is unique within the active panel; the Ekonomika tab has
    // "Sazba DPH v %" in an inactive panel — scoping prevents a collision.
    await inputByLabel(physicalPanel, 'DPH v %').fill('15');
    // handling_override_czk: empty string → null; number → override value.
    await inputByLabel(physicalPanel, 'Balné / pošta / práce').fill('88');

    // ── Step 6: Add the prize ─────────────────────────────────────────────────
    await physicalPanel.getByRole('button', { name: /Přidat věcnou výhru/i }).click();

    // Description appears in the prize list — confirms the prize was accepted.
    await expect(physicalPanel.getByText('E2E Věcná výhra')).toBeVisible({ timeout: 5_000 });

    // ── Step 7: Navigate to summary tab and save ──────────────────────────────
    // The save button lives exclusively in TabsContent value="create".
    await dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click();

    const saveBtn = dialog.getByRole('button', { name: /Uložit změny|Vytvořit soutěž/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Dialog closing is the authoritative save-success signal: onSaved() fires
    // only after a successful RPC response, which then closes the modal.
    await expect(dialog).not.toBeVisible({ timeout: 20_000 });

    // ── Step 8: Reopen the same contest ──────────────────────────────────────
    await page.getByRole('button', { name: /Archiv test/i }).click();
    await page.waitForTimeout(500);

    const contestRowAfter = page.locator('tr', { hasText: SPEC18_CONTEST_ID });
    await expect(contestRowAfter).toBeVisible({ timeout: 15_000 });
    await contestRowAfter.getByRole('button', { name: /Upravit/i }).click();

    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible({ timeout: 10_000 });

    // ── Step 9: Verify physical prize economy fields persisted ────────────────
    await dialog2.getByRole('tab', { name: 'Bonusy – věcné' }).click();
    const physicalPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');

    // Prize row must exist — description is the primary identifier.
    await expect(physicalPanel2.getByText('E2E Věcná výhra')).toBeVisible({ timeout: 8_000 });

    // Economy metadata is rendered inline in the prize list row as:
    //   "Dodavatel: <supplier> · Nákupní cena bez DPH: <cost> · DPH: <vat> % · ... · Balné: <handling> (override)"
    // Use toContainText() on the panel to avoid strict-mode issues with mixed
    // inline text nodes. Use regex for the numeric value to tolerate Czech
    // locale number formatting (e.g. "1 000 Kč" with non-breaking space).
    await expect(physicalPanel2).toContainText('E2E Dodavatel s.r.o.');
    await expect(physicalPanel2).toContainText(/1[^\d]000/);   // "1 000 Kč" (Czech thousands sep)
    await expect(physicalPanel2).toContainText(/DPH:.*15/);    // "DPH: 15 %"
    await expect(physicalPanel2).toContainText(/Balné:.*88/);  // "Balné: 88 Kč"
    await expect(physicalPanel2).toContainText('(override)');  // handling override tag

    // Close modal — best-effort cleanup; failures are non-fatal.
    // { timeout: 1000 } ensures the action throws quickly if the selector
    // doesn't match so .catch() can handle it and Escape closes any residual dialog.
    await dialog2.locator('[aria-label="Close"], button[data-dialog-close]').click({ timeout: 1000 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  });
});
