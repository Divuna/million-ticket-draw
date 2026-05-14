/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  STAGING ONLY — Wallet Balance Decrease After Voucher Purchase             ║
 * ║                                                                            ║
 * ║  This test MUTATES staging data (deducts MioCoins via voucher purchase).  ║
 * ║  It MUST NOT run against production.                                       ║
 * ║                                                                            ║
 * ║  Production smoke hard-codes only 01 + 02 spec files — this file          ║
 * ║  will never be picked up by production smoke.                              ║
 * ║                                                                            ║
 * ║  Staging Full E2E runs `playwright test` (all files) but:                 ║
 * ║    - E2E_CONTEST_ID is set only via STAGING_E2E_CONTEST_ID secret         ║
 * ║    - Wallet is reset to 5 000 MC before each run                          ║
 * ║    - Environment is confirmed staging by STAGING_VITE_SUPABASE_URL        ║
 * ║                                                                            ║
 * ║  Guard: test.skip when E2E_CONTEST_ID is absent (production CI has it     ║
 * ║  empty), so it is doubly protected against accidental production run.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * What this test verifies:
 *   1. Wallet balance is readable from /contest/:id UI before purchase.
 *   2. An available voucher exists on /vouchers and has a parseable MC price.
 *   3. After buying one voucher, the balance decreases by exactly voucher_price.
 *   4. The purchased voucher appears in the Zakoupené tab (buy_voucher_atomic
 *      created the user_vouchers row with redeemed=true).
 *   5. The balance decrease is reflected on /contest/:id after navigation
 *      (ContestDetail calls loadUserBalance on mount).
 *
 * Assertions that would catch regressions:
 *   - buy_voucher_atomic wallet debit stopped working.
 *   - buy_voucher_atomic stopped inserting user_vouchers row (redeemed=true).
 *   - UI Zakoupené tab stopped rendering purchased vouchers.
 *   - ContestDetail stopped refreshing balance on mount (loadUserBalance removed).
 *   - Voucher price changed without updating wallet deduction.
 *   - Balance display formatting broken (Czech locale parseInt would throw).
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Provided only by STAGING_E2E_CONTEST_ID secret — absent on production CI.
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

/**
 * Parse a Czech-locale formatted integer string into a JS number.
 *
 * Czech locale uses a non-breaking space (U+00A0) or regular space as the
 * thousands separator. Examples:
 *   "5 000"   → 5000
 *   "4 995"   → 4995
 *   "5"       → 5
 *
 * Throws if the result is NaN so callers get an actionable failure message.
 */
function parseCzechInt(raw: string): number {
  const digits = raw.replace(/[\s    ]+/g, '');
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) {
    throw new Error(`parseCzechInt: could not parse "${raw}" (after strip: "${digits}")`);
  }
  return n;
}

test.describe('Voucher Purchase — Wallet Balance Decrease', () => {
  test('balance decreases by voucher price after a single voucher purchase', async ({ page }) => {
    // ── Guards ────────────────────────────────────────────────────────────────
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(
        true,
        'E2E_CONTEST_ID not set — staging-only test; production CI intentionally leaves this empty',
      );
    }

    // ── Setup ─────────────────────────────────────────────────────────────────
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    // ── 1. Navigate to ContestDetail to read balance before purchase ──────────
    // /vouchers does not display wallet balance — ContestDetail is the reliable
    // UI surface that shows it via loadUserBalance() on mount.
    await page.goto(`/contest/${TEST_CONTEST_ID}`);
    const balanceLabel = page.getByText('Tvůj stav MioCoinů', { exact: true });
    await expect(balanceLabel).toBeVisible({ timeout: 15_000 });

    const balanceParagraph = balanceLabel.locator('xpath=following-sibling::p[1]');
    await expect(balanceParagraph).toBeVisible({ timeout: 5_000 });

    const balanceBeforeRaw = (await balanceParagraph.textContent())?.trim() ?? '';
    const balanceBefore = parseCzechInt(balanceBeforeRaw);

    // ── 2. Navigate to /vouchers ──────────────────────────────────────────────
    // Arm the user_vouchers interceptor BEFORE navigation so we catch the
    // mount-time GET from useUserVouchers. The page renders truelyAvailableVouchers
    // = availableVouchers.filter(v => !isInUserVouchers(v.id)).
    // useHomepageVouchers (public vouchers) typically resolves BEFORE
    // useUserVouchers (owned vouchers). If we look for a buy button before
    // useUserVouchers completes, we may see a voucher spec 03 already bought
    // (still shown because the owned-voucher filter hasn't landed yet) and
    // buy_voucher_atomic returns "Voucher již zakoupen".
    // Waiting for the user_vouchers GET response guarantees the filter is up-to-date.
    const userVouchersPageLoad = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/user_vouchers') &&
        res.request().method() === 'GET',
      { timeout: 15_000 },
    );

    await page.goto('/vouchers');
    await expect(
      page.getByRole('heading', { name: 'Vouchery' }),
    ).toBeVisible({ timeout: 10_000 });
    await userVouchersPageLoad;

    // ── 3. Wait for available vouchers to render ──────────────────────────────
    // Default tab is "Dostupné". useUserVouchers has completed (interceptor
    // resolved above), so truelyAvailableVouchers correctly excludes vouchers
    // spec 03 already bought. Wait for either a buy button or the empty-state
    // heading as confirmation that useHomepageVouchers has also settled.
    const buyButton   = page.getByRole('button', { name: /KOUPIT ZA/i }).first();
    const emptyHeading = page.getByRole('heading', { name: 'Žádné dostupné vouchery' });

    await expect(
      buyButton.or(emptyHeading),
      'Expected voucher buy button or empty-state heading to be visible',
    ).toBeVisible({ timeout: 15_000 });

    if (await emptyHeading.isVisible()) {
      throw new Error(
        'No available vouchers on staging. ' +
        'Staging DB must have at least one voucher with remaining_count > 0. ' +
        'Check the staging voucher seed data.',
      );
    }

    // ── 4. Parse voucher price from buy button label ───────────────────────────
    // Button label: "KOUPIT ZA 5 MC"
    const buttonText = (await buyButton.textContent()) ?? '';
    const priceMatch = buttonText.match(/KOUPIT ZA\s+([\d\s ]+)\s*MC/i);
    if (!priceMatch) {
      throw new Error(`Could not parse voucher price from buy button text: "${buttonText}"`);
    }
    const voucherPrice = parseCzechInt(priceMatch[1]);

    expect(voucherPrice, `Voucher price parsed as ${voucherPrice} — must be > 0`).toBeGreaterThan(0);
    expect(
      balanceBefore,
      `Balance before (${balanceBefore} MC) must exceed voucher price (${voucherPrice} MC). ` +
      `Check the staging wallet reset step — wallet should start at 5 000 MC.`,
    ).toBeGreaterThan(voucherPrice);

    // ── 5. Purchase the voucher ────────────────────────────────────────────────
    await buyButton.click();

    // ── 6. Assert success toast ────────────────────────────────────────────────
    // Success: "Voucher úspěšně zakoupen za 5 MioCoinů!"
    // Business errors from buy_voucher_atomic (all must NOT match successToast):
    //   "Voucher již zakoupen"  — regex /zakoupen/i would falsely match this!
    //   "Nedostatek MioCoinů"
    //   "Voucher není dostupný"
    //   "Nepodařilo se zakoupit voucher"  — frontend fallback
    //
    // Use /úspěšně zakoupen/i so it matches ONLY the actual success message and
    // cannot be confused with the "Voucher již zakoupen" business error.
    const successToast = page.locator('[data-sonner-toast]').filter({ hasText: /úspěšně zakoupen/i });
    const errorToast   = page.locator('[data-sonner-toast]').filter({
      hasText: /Nepodařilo se zakoupit|již zakoupen|Nedostatek MioCoin|není dostupný/i,
    });

    await expect(
      successToast.or(errorToast).first(),
      'Expected success or error Sonner toast after voucher purchase click',
    ).toBeVisible({ timeout: 10_000 });

    if (await errorToast.isVisible()) {
      const toastText = (await errorToast.first().textContent()) ?? '(empty)';
      throw new Error(
        `Voucher purchase returned an error toast on staging: "${toastText}". ` +
        `Balance before: ${balanceBefore} MC, voucher price: ${voucherPrice} MC. ` +
        `Check buy_voucher_atomic RPC logs and staging wallet state.`,
      );
    }

    // ── 7. Verify purchased voucher appears in Zakoupené tab ──────────────────
    // After buy_voucher_atomic succeeds, handleVoucherPurchase() calls:
    //   1. optimisticRemoveByVoucherId() — removes from favorites state immediately
    //   2. toast.success() — toast appears
    //   3. await refetchUserVouchers() — fires GET /rest/v1/user_vouchers
    //   4. await refetchAvailable()
    // Also the realtime subscription on user_vouchers fires fetchUserVouchers()
    // when the INSERT lands. Both paths update React state before the Zakoupené
    // tab shows the new entry. A 20 s timeout covers both the slow-network and
    // the realtime race comfortably; no separate waitForResponse needed.
    const zakoupeneTab = page.getByRole('tab', { name: /Zakoupené|Zak\./i });
    await zakoupeneTab.click();

    const uplatnitButton = page.getByRole('button', { name: 'Uplatnit voucher' }).first();
    await expect(
      uplatnitButton,
      'Purchased voucher must appear in Zakoupené tab with "Uplatnit voucher" button',
    ).toBeVisible({ timeout: 20_000 });

    // ── 10. Navigate back to ContestDetail to read refreshed balance ──────────
    // ContestDetail calls loadUserBalance(userId) on mount, which fires a GET
    // to /rest/v1/wallets. Arm the interceptor before navigating so we wait for
    // the fresh DB read before asserting the balance value.
    const walletRefreshResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/wallets') &&
        res.request().method() === 'GET',
      { timeout: 15_000 },
    );

    await page.goto(`/contest/${TEST_CONTEST_ID}`);
    await walletRefreshResponse;

    const balanceLabelAfter = page.getByText('Tvůj stav MioCoinů', { exact: true });
    await expect(balanceLabelAfter).toBeVisible({ timeout: 15_000 });
    const balanceParagraphAfter = balanceLabelAfter.locator('xpath=following-sibling::p[1]');

    // Poll until the UI reflects the post-purchase value (React state update).
    await expect(balanceParagraphAfter).not.toContainText(balanceBeforeRaw, { timeout: 8_000 });

    // ── 11. Assert exact balance decrease ─────────────────────────────────────
    const balanceAfterRaw = (await balanceParagraphAfter.textContent())?.trim() ?? '';
    const balanceAfter    = parseCzechInt(balanceAfterRaw);
    const expectedBalance = balanceBefore - voucherPrice;

    expect(
      balanceAfter,
      `Wallet balance should have decreased by exactly ${voucherPrice} MC. ` +
      `Before: ${balanceBefore} MC, After: ${balanceAfter} MC, Expected: ${expectedBalance} MC.`,
    ).toBe(expectedBalance);
  });
});
