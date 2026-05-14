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
    // This test does: login → goto contest → read balance → goto vouchers →
    // find specific card → buy voucher → check Zakoupené tab → goto contest →
    // verify balance decrease. Budget: ~15s for setup, ~5s for purchase flow,
    // ~20s for Zakoupené assertion, ~15s for balance re-check = ~55s minimum.
    // Default Playwright timeout is 30 s — override to 60 s for this test only.
    test.setTimeout(60_000);

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
    await page.goto('/vouchers');
    await expect(
      page.getByRole('heading', { name: 'Vouchery' }),
    ).toBeVisible({ timeout: 10_000 });

    // ── 3. Find the dedicated spec 10 voucher card ────────────────────────────
    // The staging workflow seeds a voucher named "E2E Spec10 Voucher" before
    // each run. By targeting the buy button WITHIN that specific card (scoped
    // by card class + hasText filter), we avoid two sources of flakiness:
    //
    //   a) Race: useHomepageVouchers resolves before useUserVouchers, so
    //      truelyAvailableVouchers may include a voucher spec 03 already bought.
    //      Scoping to a unique name means we never accidentally pick spec 03's
    //      voucher regardless of loading order.
    //
    //   b) Naming conflict: both specs use /KOUPIT ZA/i + .first(); without
    //      scoping they target the same voucher; buy_voucher_atomic then returns
    //      "Voucher již zakoupen" when spec 10 runs second.
    //
    // voucher-card-glow is the CSS class on every voucher Card in the Dostupné tab.
    // Multiple "E2E Spec10 Voucher" cards may exist (one seeded per run accumulates);
    // use .first() so the locator is always single-element (no strict-mode violation).
    const spec10Card = page
      .locator('.voucher-card-glow')
      .filter({ hasText: 'E2E Spec10 Voucher' })
      .first();

    // Wait until either the spec10 card OR the empty-state heading is present.
    // Poll spec10Card.count() > 0 rather than using .or() to avoid strict-mode
    // issues when the ".or" locator itself would match 2+ elements.
    const emptyHeading = page.getByRole('heading', { name: 'Žádné dostupné vouchery' });

    await expect(async () => {
      const hasSpec10 = (await page.locator('.voucher-card-glow').filter({ hasText: 'E2E Spec10 Voucher' }).count()) > 0;
      const hasEmpty  = await emptyHeading.isVisible();
      if (!hasSpec10 && !hasEmpty) throw new Error('Neither spec10 card nor empty-state visible yet');
    }, 'Expected "E2E Spec10 Voucher" card or empty-state heading to appear').toPass({ timeout: 15_000 });

    if (await emptyHeading.isVisible()) {
      throw new Error(
        'No available vouchers on staging. ' +
        'The "Seed E2E Spec10 voucher" workflow step must create "E2E Spec10 Voucher". ' +
        'Check the staging seed step logs.',
      );
    }

    if ((await page.locator('.voucher-card-glow').filter({ hasText: 'E2E Spec10 Voucher' }).count()) === 0) {
      throw new Error(
        '"E2E Spec10 Voucher" card not found in Dostupné tab. ' +
        'Either the seed step failed, the voucher is already purchased (Reset test user ' +
        'vouchers step should have deleted it), or the UI filter hid it. ' +
        'Check staging workflow logs.',
      );
    }

    // ── 4. Parse voucher price from buy button label ───────────────────────────
    // Buy button is scoped to the spec 10 card to avoid picking spec 03's voucher.
    const buyButton = spec10Card.getByRole('button', { name: /KOUPIT ZA/i });
    await expect(buyButton).toBeVisible({ timeout: 5_000 });

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
    // Navigate fresh to /vouchers?tab=purchased (full page reload, not a SPA pushState).
    //
    // Why a fresh navigation instead of clicking the in-page tab:
    //   handleVoucherPurchase fires toast.success() BEFORE awaiting refetchUserVouchers().
    //   When the test clicks the in-page tab, Radix Tabs switches content but
    //   fetchUserVouchers() may still be loading (setLoading=true → skeletons shown).
    //   The concurrent realtime subscription can also reset loading=true after the
    //   first refetch finishes, keeping skeletons alive indefinitely.
    //
    //   A fresh page.goto('/vouchers?tab=purchased') causes a full browser navigation:
    //   - React mounts from scratch (no stale state)
    //   - Tabs defaultValue="purchased" activates the Zakoupené tab immediately
    //   - fetchUserVouchers() fires on mount once auth is restored
    //   - By then the purchase is committed → row returns in the GET response
    //
    // Why no waitForResponse:
    //   Arming the interceptor before page.goto can accidentally catch the old-page's
    //   in-flight refetch (from handleVoucherPurchase), which completes during the
    //   navigation before the new page even loads. This causes waitForResponse to
    //   resolve early while the new page is still initialising.
    //
    // Instead: use toBeVisible(20s) to poll, which covers:
    //   full page load (~2s) + auth session restore (~2s) + network GET (~1s) +
    //   React re-render (~0.1s) with ≥14 s headroom.
    await page.goto('/vouchers?tab=purchased');

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
