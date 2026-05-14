/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  STAGING ONLY — Wallet Balance Decrease After Ticket Purchase              ║
 * ║                                                                            ║
 * ║  This test MUTATES staging data (deducts MioCoins via ticket purchase).   ║
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
 *   2. After buying one ticket, the balance decreases by exactly ticket_price.
 *   3. The balance decrease is reflected in the same page UI without reload.
 *
 * Assertions that would catch regressions:
 *   - Wallet debit stopped working (buy_ticket_atomic bug).
 *   - UI stopped refreshing balance after purchase (loadUserBalance removed).
 *   - Ticket price changed without updating wallet deduction.
 *   - Balance display formatting broken (parseInt would throw / assert fails).
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Provided only by STAGING_E2E_CONTEST_ID secret — absent on production CI.
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

/**
 * Parse a Czech-locale formatted integer string into a JS number.
 *
 * Czech locale uses a non-breaking space (U+00A0) or regular space as the
 * thousands separator. Examples:
 *   "5 000"        → 5000
 *   "5 000"   → 5000
 *   "4 990"   → 4990
 *   "10"           → 10
 *
 * Throws if the result is NaN so callers get an actionable failure message.
 */
function parseCzechInt(raw: string): number {
  // Strip all Unicode whitespace / thin-space variants used as thousand separators
  const digits = raw.replace(/[\s   ]+/g, '');
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) {
    throw new Error(`parseCzechInt: could not parse "${raw}" (after strip: "${digits}")`);
  }
  return n;
}

test.describe('Wallet Balance — Post-Purchase Decrease', () => {
  test('balance decreases by ticket price after a single ticket purchase', async ({ page }) => {
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
    await page.goto(`/contest/${TEST_CONTEST_ID}`);

    // ── 1. Wait for wallet section to fully render ────────────────────────────
    // ContestDetail renders: <p class="text-xs text-gray-400">Tvůj stav MioCoinů</p>
    //                        <p class="text-4xl ...">5 000</p>   ← balance number
    const balanceLabel = page.getByText('Tvůj stav MioCoinů', { exact: true });
    await expect(balanceLabel).toBeVisible({ timeout: 15_000 });

    // ── 2. Read balance before purchase ───────────────────────────────────────
    // The balance <p> is the immediate following sibling of the label <p>.
    // XPath following-sibling is the most precise selector here — avoids
    // fragile class names and does not require data-testid.
    const balanceParagraph = page
      .getByText('Tvůj stav MioCoinů', { exact: true })
      .locator('xpath=following-sibling::p[1]');
    await expect(balanceParagraph).toBeVisible({ timeout: 5_000 });

    const balanceBeforeRaw = (await balanceParagraph.textContent())?.trim() ?? '';
    const balanceBefore = parseCzechInt(balanceBeforeRaw);

    // ── 3. Locate buy button and read ticket price ────────────────────────────
    const buyButton = page.getByRole('button', { name: /Uplatnit.*MioCoin/i });
    const topUpButton = page.getByRole('button', { name: /Dobít MioCoiny/i });

    // If only top-up button appears, staging wallet balance is insufficient.
    // The staging workflow resets wallet to 5 000 MC before every run — if we
    // reach this branch the reset step must have failed.
    await expect(
      buyButton.or(topUpButton),
      'Expected buy button or top-up button to be visible',
    ).toBeVisible({ timeout: 15_000 });

    const onlyTopUp = !(await buyButton.isVisible()) && (await topUpButton.isVisible());
    if (onlyTopUp) {
      throw new Error(
        `Staging wallet has insufficient MioCoins for ticket purchase. ` +
        `Balance before: ${balanceBefore} MC. ` +
        `The staging wallet reset step should have set balance to 5 000 MC. ` +
        `Check the "Reset test user wallet" step in the staging workflow.`,
      );
    }
    await expect(buyButton).toBeVisible({ timeout: 5_000 });

    // Parse ticket price from button label: "Uplatnit 10 MioCoinů" → 10
    const buttonText = (await buyButton.textContent()) ?? '';
    const priceMatch = buttonText.match(/Uplatnit\s+([\d\s  ]+)\s+MioCoin/i);
    if (!priceMatch) {
      throw new Error(`Could not parse ticket price from buy button text: "${buttonText}"`);
    }
    const ticketPrice = parseCzechInt(priceMatch[1]);

    // Sanity check: ticket price must be a positive integer
    expect(ticketPrice, `Ticket price parsed as ${ticketPrice} — must be > 0`).toBeGreaterThan(0);
    expect(
      balanceBefore,
      `Balance before (${balanceBefore} MC) must exceed ticket price (${ticketPrice} MC)`,
    ).toBeGreaterThan(ticketPrice);

    // ── 4. Arm wallet-refresh interceptor before clicking ─────────────────────
    // ContestDetail calls loadUserBalance(userId) immediately after a successful
    // buy_ticket_atomic (ContestDetail.tsx ~line 359). This fires a GET to
    // /rest/v1/wallets. We wait for that response to confirm the DB deduction
    // has been read back before we assert the UI value.
    const walletRefreshResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/wallets') &&
        res.request().method() === 'GET',
      { timeout: 15_000 },
    );

    // ── 5. Purchase one ticket ────────────────────────────────────────────────
    await buyButton.click();

    // ── 6. Wait for result modal (TicketResultModal) ──────────────────────────
    // Scoped to the dialog that contains the "Zavřít" close button, which is
    // unique to TicketResultModal — avoids strict-mode conflict with the
    // CookieConsentBanner (also role="dialog").
    const resultDialog = page.locator('[role="dialog"]:has(button[aria-label="Zavřít"])');
    await expect(resultDialog, 'TicketResultModal must appear after ticket purchase').toBeVisible({
      timeout: 20_000,
    });

    // ── 7. Wait for wallet refresh round-trip ─────────────────────────────────
    await walletRefreshResponse;

    // ── 8. Close modal ────────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await expect(resultDialog).not.toBeVisible({ timeout: 5_000 });

    // ── 9. Wait for balance UI to reflect the new (lower) value ──────────────
    // The balance was already set via setBalance() in loadUserBalance after
    // purchase. We poll until the element's text no longer matches the
    // pre-purchase value — catches both immediate and delayed renders.
    await expect(balanceParagraph).not.toContainText(balanceBeforeRaw, { timeout: 8_000 });

    // ── 10. Assert exact decrease ─────────────────────────────────────────────
    const balanceAfterRaw = (await balanceParagraph.textContent())?.trim() ?? '';
    const balanceAfter = parseCzechInt(balanceAfterRaw);
    const expectedBalance = balanceBefore - ticketPrice;

    expect(
      balanceAfter,
      `Wallet balance should have decreased by exactly ${ticketPrice} MC. ` +
      `Before: ${balanceBefore} MC, After: ${balanceAfter} MC, Expected: ${expectedBalance} MC.`,
    ).toBe(expectedBalance);
  });
});
