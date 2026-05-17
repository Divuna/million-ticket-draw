/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Economy Preview Smoke Test                                        ║
 * ║                                                                            ║
 * ║  STAGING-ONLY and READ-ONLY with respect to saved contest data.            ║
 * ║  The test opens the contest create modal, fills preview inputs, and        ║
 * ║  verifies the live economy preview updates without clicking final save.    ║
 * ║                                                                            ║
 * ║  Requires two staging CI secrets:                                          ║
 * ║    STAGING_E2E_ADMIN_EMAIL                                                 ║
 * ║    STAGING_E2E_ADMIN_PASSWORD                                              ║
 * ║                                                                            ║
 * ║  Test is skipped cleanly when either secret is absent.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect, Locator } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

/**
 * Locate the value element next to a top economy summary bar metric.
 *
 * DOM structure (economy summary bar, one grid cell):
 *   <div>
 *     <div class="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
 *     <div class="mt-1 text-sm font-semibold text-foreground">{value}</div>  ← target
 *   </div>
 *
 * We select the label div by its 'uppercase' + 'opacity-70' Tailwind classes
 * (unique to summary bar labels) and then take its first following-sibling div
 * (the value). This is precise: never resolves to a wrapper or unrelated div.
 */
function summaryValue(dialog: Locator, label: string): Locator {
  return dialog
    .locator('div.uppercase.opacity-70', { hasText: label })
    .locator('xpath=following-sibling::div[1]');
}

/**
 * Locate an <input> by the visible <label> text that precedes it.
 *
 * The admin modal uses unstyled shadcn <Label> (no htmlFor) paired with
 * <Input> (no id), both wrapped in a plain <div>. getByLabel() is not
 * reliable here because there is no for/id wiring.
 *
 * Pattern:
 *   <div>
 *     <label>{labelText}</label>
 *     <input />
 *   </div>
 *
 * We find the <label> by text, navigate to its parent <div> via '..', then
 * locate the <input> inside that same wrapper — always exactly one per field.
 */
function inputByLabel(dialog: Locator, labelText: string): Locator {
  return dialog
    .locator('label', { hasText: labelText })
    .locator('..')
    .locator('input');
}

test.describe('Admin — Economy Preview Smoke', () => {
  test('physical prize preview updates top economy bar and Ekonomika tab without saving', async ({ page }) => {
    test.setTimeout(90_000);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(
        true,
        'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — staging-only test; add STAGING_E2E_ADMIN_EMAIL and STAGING_E2E_ADMIN_PASSWORD secrets to enable.',
      );
    }

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?tab=management');

    await page.getByRole('button', { name: /Nová soutěž/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Vytvořit novou soutěž', { exact: true })).toBeVisible({ timeout: 15_000 });

    // ── Basic tab — fill contest parameters ──────────────────────────────────
    // inputByLabel navigates label → parent div → input. No htmlFor/id needed.
    await inputByLabel(dialog, 'Název soutěže').fill('E2E economy preview draft');
    await inputByLabel(dialog, 'Hlavní výhra').fill('E2E preview prize');
    await inputByLabel(dialog, 'Počet tiketů').fill('1000');
    await inputByLabel(dialog, 'Cena tiketu (MioCoins)').fill('20');

    // ── Bonusy – věcné tab — fill physical prize cost preview ────────────────
    await dialog.getByRole('tab', { name: 'Bonusy – věcné', exact: true }).click();

    // Each label is the unique text of its wrapper div — no .first() needed.
    // 'Balné / pošta / práce' is a substring of the full label; uniquely matches.
    await inputByLabel(dialog, 'Popis výhry').fill('E2E testovací věcná výhra');
    await inputByLabel(dialog, 'Dodavatel').fill('E2E Dodavatel');
    await inputByLabel(dialog, 'Nákupní cena bez DPH v Kč').fill('1000');
    await inputByLabel(dialog, 'DPH v %').fill('21');
    await inputByLabel(dialog, 'Balné / pošta / práce').fill('150');
    await inputByLabel(dialog, 'Pozice tiketu').fill('55');

    await dialog.getByRole('button', { name: /Přidat věcnou výhru/i }).click();

    await expect(dialog.getByText('E2E testovací věcná výhra', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Náklad včetně DPH:\s*1\s*210 Kč/)).toBeVisible();

    // ── Top economy summary bar ───────────────────────────────────────────────
    // summaryValue() targets the label div by 'uppercase opacity-70' class
    // (unique to summary bar labels) then selects its first following-sibling
    // div (the value). Never resolves to a wrapper or unrelated container.
    await expect(summaryValue(dialog, 'Počet ticketů')).toContainText(/1\s*000/);
    await expect(summaryValue(dialog, 'Celkové odhadované náklady')).toContainText(/11\s*360 Kč/);
    await expect(summaryValue(dialog, 'Doporučená cena ticketu')).toContainText(/17,18 Kč/);
    await expect(summaryValue(dialog, 'Odhadovaný čistý zisk')).toContainText(/5\s*169 Kč/);
    await expect(summaryValue(dialog, 'Marže')).toContainText(/31,3 %/);

    // ── Ekonomika tab — verify cost breakdown reflects the added prize ────────
    await dialog.getByRole('tab', { name: 'Ekonomika', exact: true }).click();

    await expect(dialog.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Odhad nákladů na věcné bonusové výhry/)).toBeVisible();
    await expect(dialog.getByText(/1\s*210 Kč/)).toBeVisible();
    await expect(dialog.getByText('Balné / pošta / práce', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/150 Kč/)).toBeVisible();
    await expect(dialog.getByText(/Celkové odhadované náklady/)).toBeVisible();
    await expect(dialog.getByText(/11\s*360 Kč/)).toBeVisible();
  });
});
