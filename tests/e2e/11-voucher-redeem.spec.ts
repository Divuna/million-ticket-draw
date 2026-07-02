import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

test.describe('Voucher Code - Purchased Voucher Detail', () => {
  test('opens purchased voucher code modal', async ({ page }) => {
    test.setTimeout(45_000);

    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set - skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(true, 'E2E_CONTEST_ID not set - staging-only test');
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/vouchers?tab=purchased');
    await expect(page.getByRole('heading', { name: 'Vouchery' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: /Zakoupené|Zak\./i })).toBeVisible();

    const spec11Card = page
      .locator('.voucher-card-glow')
      .filter({ hasText: 'E2E Spec11 Voucher' })
      .first();

    const emptyHeading = page.getByRole('heading', { name: 'Zatím nemáte žádné zakoupené vouchery' });

    await expect(async () => {
      const hasSpec11 = (await page
        .locator('.voucher-card-glow')
        .filter({ hasText: 'E2E Spec11 Voucher' })
        .count()) > 0;
      const hasEmpty = await emptyHeading.isVisible();
      if (!hasSpec11 && !hasEmpty) {
        throw new Error('Neither spec11 purchased voucher nor empty-state visible yet');
      }
    }).toPass({ timeout: 20_000 });

    if (await emptyHeading.isVisible()) {
      throw new Error('No purchased vouchers on staging. Check the workflow seed step.');
    }

    await expect(spec11Card).toBeVisible();

    const codeButton = spec11Card.getByRole('button', { name: 'Zobrazit kód' });
    await expect(codeButton).toBeVisible();
    await codeButton.click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Zobrazit kód' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText('E2E Spec11 Voucher');

    const missingCodeMessage = dialog.getByText('Kód zatím není dostupný');
    const copyButton = dialog.getByRole('button', { name: 'Zkopírovat kód' });

    if (await missingCodeMessage.isVisible()) {
      test.skip(true, 'Seeded purchased voucher has no voucher_code_id; modal shows missing-code state correctly.');
    }

    await expect(copyButton).toBeVisible();
    await expect(copyButton).toBeEnabled();
    await copyButton.click({ trial: true });
  });
});
