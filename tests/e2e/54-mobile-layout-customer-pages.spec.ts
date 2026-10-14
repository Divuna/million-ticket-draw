/**
 * Spec 54 — C19: Mobilní layout zákaznických stránek
 *
 * Ověřuje, že klíčové zákaznické stránky:
 *   - se načtou bez JS uncaught errors na mobile viewportu (375×812)
 *   - zobrazí bottom navigation
 *   - nemají horizontální přetékání obsahu (overflow)
 *
 * Staging-only (vyžaduje E2E_TEST_EMAIL / E2E_TEST_PASSWORD).
 * Read-only — žádné mutace dat, žádný Supabase write.
 * Používá iPhone SE viewport (375×812).
 *
 * Stránky: / · /games · /wins · /vouchers · /top-up · /profile · /messages
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

const isStaging = !!TEST_EMAIL && !!TEST_PASSWORD;

/** iPhone SE viewport */
const MOBILE = { width: 375, height: 812 };

/** Stránky k otestování (route → popis pro chybové zprávy) */
const PAGES: Array<{ route: string; label: string }> = [
  { route: '/',          label: 'Homepage' },
  { route: '/games',     label: 'Games' },
  { route: '/wins',      label: 'Wins' },
  { route: '/vouchers',  label: 'Vouchers' },
  { route: '/top-up',    label: 'TopUp' },
  { route: '/profile',   label: 'Profile' },
  { route: '/messages',  label: 'Messages' },
];

test.describe('54 — C19: Mobile layout zákaznických stránek (375px)', () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    if (!isStaging) test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
  });

  for (const { route, label } of PAGES) {
    test(`54-${label.toLowerCase()} — ${label} načte na mobilu bez JS chyb`, async ({ page }) => {
      test.setTimeout(60_000);

      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await page.goto(route, { waitUntil: 'domcontentloaded' });

      // Počkej na stabilizaci (max 10 s) — stačí domcontentloaded + síťový klid
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
        /* timeout OK — stránka může mít polling */
      });

      // 1) Žádné uncaught JS errors
      expect(
        jsErrors,
        `${label}: uncaught JS error(s): ${jsErrors.join(' | ')}`,
      ).toHaveLength(0);

      // 2) Bottom navigation je viditelná
      const nav = page.getByRole('navigation', { name: 'Hlavní menu' });
      await expect(
        nav,
        `${label}: bottom navigation musí být viditelná na mobile`,
      ).toBeVisible({ timeout: 8_000 });

      // 3) Žádný horizontální overflow — document width ≤ viewport width
      const scrollWidth: number = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(
        scrollWidth,
        `${label}: stránka nesmí přetékat horizontálně (scrollWidth=${scrollWidth}px > viewport=${MOBILE.width}px)`,
      ).toBeLessThanOrEqual(MOBILE.width);
    });
  }
});
