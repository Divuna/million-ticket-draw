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

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

function summaryValue(dialog: Locator, label: string): Locator {
  return dialog.locator('div').filter({
    has: dialog.getByText(label, { exact: true }),
  }).locator('div').last();
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

    await dialog.getByLabel('Název soutěže').fill('E2E economy preview draft');
    await dialog.getByLabel('Hlavní výhra').fill('E2E preview prize');
    await dialog.getByLabel('Počet tiketů').fill('1000');
    await dialog.getByLabel('Cena tiketu (MioCoins)').fill('20');

    await dialog.getByRole('tab', { name: 'Bonusy – věcné', exact: true }).click();

    await dialog.getByLabel('Popis výhry').fill('E2E testovací věcná výhra');
    await dialog.getByLabel('Dodavatel').fill('E2E Dodavatel');
    await dialog.getByLabel('Nákupní cena bez DPH v Kč').fill('1000');
    await dialog.getByLabel('DPH v %').first().fill('21');
    await dialog.getByLabel('Balné / pošta / práce (override v Kč)').fill('150');
    await dialog.getByLabel('Pozice tiketu').fill('55');

    await dialog.getByRole('button', { name: /Přidat věcnou výhru/i }).click();

    await expect(dialog.getByText('E2E testovací věcná výhra', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Náklad včetně DPH:\s*1\s*210 Kč/)).toBeVisible();

    await expect(summaryValue(dialog, 'Počet ticketů')).toContainText(/1\s*000/);
    await expect(summaryValue(dialog, 'Celkové odhadované náklady')).toContainText(/11\s*360 Kč/);
    await expect(summaryValue(dialog, 'Doporučená cena ticketu')).toContainText(/17,18 Kč/);
    await expect(summaryValue(dialog, 'Odhadovaný čistý zisk')).toContainText(/5\s*169 Kč/);
    await expect(summaryValue(dialog, 'Marže')).toContainText(/31,3 %/);

    await dialog.getByRole('tab', { name: 'Ekonomika', exact: true }).click();

    await expect(dialog.getByText('Ekonomika soutěže', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Odhad nákladů na věcné bonusové výhry/)).toBeVisible();
    await expect(dialog.getByText(/1\s*210 Kč/)).toBeVisible();
    await expect(dialog.getByText(/Balné \/ pošta \/ práce/)).toBeVisible();
    await expect(dialog.getByText(/150 Kč/)).toBeVisible();
    await expect(dialog.getByText(/Celkové odhadované náklady/)).toBeVisible();
    await expect(dialog.getByText(/11\s*360 Kč/)).toBeVisible();
  });
});
