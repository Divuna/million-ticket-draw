/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Mobile Messages Layout — Regression Guard                                 ║
 * ║                                                                            ║
 * ║  READ-ONLY — does NOT send messages, mutate data, or touch Supabase.      ║
 * ║  Safe to run against any environment (production or staging).              ║
 * ║                                                                            ║
 * ║  Skipped automatically when E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * What this test verifies:
 *   1. Bottom navigation is visible on the Messages page at mobile viewport.
 *   2. Bottom navigation is anchored to the bottom of the viewport (position:fixed).
 *   3. Composer input is fully visible above the bottom navigation (not hidden behind it).
 *   4. After scrolling the messages list, the bottom navigation Y position does not move.
 *   5. After scrolling, the composer input remains fully visible above the nav.
 *
 * Regressions caught:
 *   - PR #17 regression: removing min-h-screen caused customer-layout to be shorter
 *     than the viewport, enabling iOS rubber-band scroll to move the fixed nav.
 *     (fixed in PR #18 by adding min-height: 100dvh to .customer-layout)
 *   - Any future CSS change that makes the nav non-fixed or scrollable.
 *   - Any future CSS change that pushes the composer behind the nav.
 *   - Any change to .customer-layout padding or .messages-mobile-fixed-shell sizing
 *     that breaks the nav-composer relationship.
 *
 * Scope:
 *   - Uses iPhone 14-equivalent viewport (390×844).
 *   - Scrolls the messages inner container programmatically — no click on Send.
 *   - No data mutations. No Supabase writes.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

/** Tolerance in pixels for layout position comparisons. */
const PX_TOLERANCE = 2;

test.describe('Mobile Messages Layout — Regression Guard', () => {
  // Override viewport to iPhone 14 equivalent for all tests in this describe block.
  test.use({ viewport: { width: 390, height: 844 } });

  test('bottom nav stays fixed and composer remains visible above it during scroll', async ({ page }) => {
    // Allow extra time: login + page load + scroll + assertions
    test.setTimeout(60_000);

    // ── Guards ────────────────────────────────────────────────────────────────
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — skipping');
    }

    // ── Login ─────────────────────────────────────────────────────────────────
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    // ── Navigate to /messages ─────────────────────────────────────────────────
    await page.goto('/messages');

    // ── 1. Bottom nav must be visible ─────────────────────────────────────────
    // BottomNavigation renders: <div role="navigation" aria-label="Hlavní menu" ...>
    const nav = page.getByRole('navigation', { name: 'Hlavní menu' });
    await expect(nav, 'Bottom navigation must be visible on /messages').toBeVisible({
      timeout: 15_000,
    });

    // ── 2. Composer input must be visible ─────────────────────────────────────
    // Messages.tsx composer: <input placeholder="Napište zprávu..." ...>
    const composer = page.locator('input[placeholder="Napište zprávu..."]');
    await expect(composer, 'Composer input must be visible on /messages').toBeVisible({
      timeout: 10_000,
    });

    // ── 3. Read bounding boxes BEFORE scroll ──────────────────────────────────
    const navBoxBefore    = await nav.boundingBox();
    const composerBoxBefore = await composer.boundingBox();

    expect(navBoxBefore,     'Bottom nav must have a layout bounding box').not.toBeNull();
    expect(composerBoxBefore,'Composer must have a layout bounding box').not.toBeNull();

    // ── 4. Nav must be anchored at the viewport bottom ────────────────────────
    // Nav has position:fixed; bottom:0. Its bottom edge must reach the viewport bottom.
    // In headless Chromium env(safe-area-inset-bottom) = 0, so nav fills to 844px.
    const viewportHeight = page.viewportSize()!.height;
    const navBottomEdge  = navBoxBefore!.y + navBoxBefore!.height;

    expect(
      navBottomEdge,
      `Nav bottom edge (${navBottomEdge}px) must reach the viewport bottom (${viewportHeight}px). ` +
      'If this fails, position:fixed on the nav is broken.',
    ).toBeGreaterThanOrEqual(viewportHeight - 10);

    // ── 5. Composer bottom edge must be above nav top edge ────────────────────
    // If composer bottom > nav top the input is hidden behind the nav.
    const composerBottom = composerBoxBefore!.y + composerBoxBefore!.height;
    const navTop         = navBoxBefore!.y;

    expect(
      composerBottom,
      `Composer bottom edge (${composerBottom}px) must be ≤ nav top (${navTop}px). ` +
      'If this fails, the composer is obscured by the bottom navigation.',
    ).toBeLessThanOrEqual(navTop + PX_TOLERANCE);

    // ── 6. Scroll the messages list ───────────────────────────────────────────
    // Scroll the inner overflow-y-auto container inside .messages-mobile-fixed-shell
    // to its bottom, then back to the top. Simulates a user reading messages.
    await page.evaluate(() => {
      const shell     = document.querySelector('.messages-mobile-fixed-shell');
      const scrollEl  = shell?.querySelector('.overflow-y-auto') as HTMLElement | null;
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    });
    // Brief pause — let any scroll-triggered layout reflow or animation settle.
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const shell    = document.querySelector('.messages-mobile-fixed-shell');
      const scrollEl = shell?.querySelector('.overflow-y-auto') as HTMLElement | null;
      if (scrollEl) {
        scrollEl.scrollTop = 0;
      }
    });
    await page.waitForTimeout(300);

    // ── 7. Nav Y position must not have changed ───────────────────────────────
    // position:fixed nav must be viewport-anchored regardless of scroll activity.
    // If this fails, the nav is scrolling with the page content (the PR #17/18 regression).
    const navBoxAfter = await nav.boundingBox();
    expect(navBoxAfter, 'Bottom nav must still be visible after scroll').not.toBeNull();

    expect(
      Math.abs(navBoxAfter!.y - navBoxBefore!.y),
      `Bottom nav Y must not move during scroll. ` +
      `Before: ${navBoxBefore!.y}px, After: ${navBoxAfter!.y}px. ` +
      'If this fails, iOS rubber-band or non-fixed positioning is causing nav movement. ' +
      'Check min-height: 100dvh on .customer-layout (PR #18 fix).',
    ).toBeLessThanOrEqual(PX_TOLERANCE);

    // ── 8. Composer must remain visible above nav after scroll ────────────────
    const composerBoxAfter = await composer.boundingBox();
    expect(composerBoxAfter, 'Composer must still be visible after scroll').not.toBeNull();

    expect(
      composerBoxAfter!.y + composerBoxAfter!.height,
      `Composer bottom edge (${composerBoxAfter!.y + composerBoxAfter!.height}px) must remain ` +
      `≤ nav top (${navBoxAfter!.y}px) after scroll. ` +
      'If this fails, scroll has caused the composer to be pushed behind the nav.',
    ).toBeLessThanOrEqual(navBoxAfter!.y + PX_TOLERANCE);
  });
});
