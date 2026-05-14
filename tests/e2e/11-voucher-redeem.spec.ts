/**
 * STAGING ONLY - Purchased voucher redeem/detail modal
 *
 * This test relies on the staging workflow seed step creating one purchased
 * "E2E Spec11 Voucher" for the E2E test user. It must not run in production.
 * Production Smoke hard-codes only specs 01 + 02, and this spec also skips
 * when E2E_CONTEST_ID is absent.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Provided only by STAGING_E2E_CONTEST_ID secret; absent on production CI.
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

test.describe('Voucher Redeem - Purchased Voucher Detail', () => {
  test('opens purchased voucher redeem modal and shows a valid voucher code', async ({ page }) => {
    test.setTimeout(45_000);

    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set - skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(
        true,
        'E2E_CONTEST_ID not set - staging-only test; production CI intentionally leaves this empty',
      );
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
    }, 'Expected "E2E Spec11 Voucher" purchased card or empty-state heading to appear').toPass({
      timeout: 20_000,
    });

    if (await emptyHeading.isVisible()) {
      throw new Error(
        'No purchased vouchers on staging. "E2E Spec11 Voucher" was not found - check the workflow seed step.',
      );
    }

    await expect(spec11Card, 'Dedicated spec11 purchased voucher card must be visible').toBeVisible();

    const cardCode = spec11Card.locator('text=/^OMV-[A-Z0-9]{8}$/').first();
    await expect(cardCode, 'Purchased voucher card must show generated OMV code').toBeVisible();
    const cardCodeText = (await cardCode.textContent())?.trim() ?? '';
    expect(cardCodeText, `Voucher code "${cardCodeText}" must match OMV-XXXXXXXX format`).toMatch(
      /^OMV-[A-Z0-9]{8}$/,
    );

    const redeemButton = spec11Card.getByRole('button', { name: 'Uplatnit voucher' });
    await expect(redeemButton).toBeVisible();
    await redeemButton.click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Uplatnit voucher' });
    await expect(dialog, 'Redeem/detail modal must open').toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText('E2E Spec11 Voucher');

    const modalCode = dialog.locator('text=/^OMV-[A-Z0-9]{8}$/').first();
    await expect(modalCode, 'Redeem modal must show the same generated voucher code').toBeVisible();
    const modalCodeText = (await modalCode.textContent())?.trim() ?? '';
    expect(modalCodeText).toBe(cardCodeText);

    const copyButton = dialog.getByRole('button', { name: 'Zkopírovat kód' });
    await expect(copyButton, 'Copy button must be visible in redeem modal').toBeVisible();
    await copyButton.click({ trial: true });
  });
});
