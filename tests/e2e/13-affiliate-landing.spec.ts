/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Affiliate Program — Public Pages Regression Guard                         ║
 * ║                                                                            ║
 * ║  READ-ONLY — no login, no form submission, no data mutations.              ║
 * ║  Safe to run against any environment (production or staging).              ║
 * ║  No E2E_TEST_EMAIL / E2E_TEST_PASSWORD required.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * What this test verifies:
 *   1. /influencer — modern Affiliate v2 landing page. Explains both current
 *      modes (Influencer / Obchodník). CTA buttons link to the CANONICAL
 *      /affiliate/register and /affiliate/login — not the retired legacy
 *      /influencer/register form.
 *   2. /influencer/how-to-earn — how-to page renders with "Affiliate" wording,
 *      step headings, back link to /influencer, and bottom CTA to
 *      /affiliate/register.
 *   3. /influencer/register — legacy URL kept ONLY for backward compatibility.
 *      It no longer renders its own duplicate registration form (which used
 *      to insert directly into `partners`, bypassing Affiliate v2). It must
 *      redirect to /affiliate/register, preserving any query string.
 *
 * Regressions caught:
 *   - Public pages reverting to the old dark theme / legacy wording.
 *   - CTA buttons pointing back at the retired /influencer/register form.
 *   - The /influencer/register legacy redirect breaking or losing query params.
 *   - Pages accidentally put behind an auth guard.
 */

import { test, expect } from '@playwright/test';

test.describe('Affiliate Program — Public Pages', () => {

  // ── 1. Landing page ─────────────────────────────────────────────────────────
  test('landing page renders current Affiliate v2 wording and CTA links', async ({ page }) => {
    await page.goto('/influencer');

    // Badge / eyebrow
    await expect(
      page.getByText('Affiliate program OneMil', { exact: true }).first(),
      '"Affiliate program OneMil" eyebrow must be visible on the landing page',
    ).toBeVisible({ timeout: 10_000 });

    // H1 heading — current canonical copy
    await expect(
      page.getByRole('heading', { name: 'Doporučujte OneMil a vydělávejte', exact: true }),
      'H1 heading must read "Doporučujte OneMil a vydělávejte"',
    ).toBeVisible({ timeout: 5_000 });

    // Both current modes must be explained — Influencer (customers) and
    // Obchodník (companies) — these are the two real register_affiliate_account modes.
    await expect(
      page.getByRole('heading', { name: 'Influencer', exact: true }),
      'Influencer mode heading must be visible',
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('heading', { name: 'Obchodník', exact: true }),
      'Obchodník mode heading must be visible',
    ).toBeVisible({ timeout: 5_000 });

    // Primary CTA: registration button — must point to the CANONICAL
    // /affiliate/register, not the retired legacy /influencer/register form.
    const registerCta = page
      .getByRole('link', { name: /Zaregistrovat se do Affiliate programu/i })
      .first();
    await expect(registerCta, 'Primary registration CTA must be visible').toBeVisible({ timeout: 5_000 });
    const registerHref = await registerCta.getAttribute('href');
    expect(
      registerHref,
      'Registration CTA href must point to canonical /affiliate/register',
    ).toBe('/affiliate/register');

    // Secondary CTA: how-to link
    const howToLink = page.getByRole('link', { name: /Jak to funguje/i }).first();
    await expect(howToLink, '"Jak to funguje" link must be visible').toBeVisible({ timeout: 5_000 });
    const howToHref = await howToLink.getAttribute('href');
    expect(
      howToHref,
      '"Jak to funguje" link href must contain /influencer/how-to-earn',
    ).toMatch(/\/influencer\/how-to-earn/);

    // Existing-account link must point to the approved canonical login.
    const loginLink = page.getByRole('link', { name: /^Přihlaste se$/i });
    await expect(loginLink).toBeVisible({ timeout: 5_000 });
    expect(await loginLink.getAttribute('href')).toBe('/affiliate/login');
  });

  // ── 2. How-to-earn page ──────────────────────────────────────────────────────
  test('how-to-earn page renders Affiliate wording, steps, and back link', async ({ page }) => {
    await page.goto('/influencer/how-to-earn');

    // H1
    await expect(
      page.getByRole('heading', { name: 'Jak vydělávat s OneMil', exact: true }),
      'H1 must read "Jak vydělávat s OneMil"',
    ).toBeVisible({ timeout: 10_000 });

    // Step 1 heading — confirms current "zvolte režim" wording present
    await expect(
      page.getByRole('heading', { name: /Zaregistrujte se a zvolte režim/i }),
      'Step 1 heading must reference choosing a mode (Influencer/Obchodník)',
    ).toBeVisible({ timeout: 5_000 });

    // Back link to /influencer
    const backLink = page.getByRole('link', { name: /Zpět na Affiliate program/i });
    await expect(backLink, '"Zpět na Affiliate program" back link must be visible').toBeVisible({ timeout: 5_000 });
    const backHref = await backLink.getAttribute('href');
    expect(backHref, '"Zpět na Affiliate program" must link to /influencer').toBe('/influencer');

    // Bottom CTA — must point to the canonical /affiliate/register, not the
    // retired legacy form.
    const bottomCta = page.getByRole('link', { name: /Registrovat se jako Affiliate partner/i }).last();
    await expect(bottomCta, 'Bottom registration CTA must be visible').toBeVisible({ timeout: 5_000 });
    expect(await bottomCta.getAttribute('href')).toBe('/affiliate/register');
  });

  // ── 3. Legacy /influencer/register redirect ──────────────────────────────────
  test('legacy /influencer/register redirects to canonical /affiliate/register', async ({ page }) => {
    await page.goto('/influencer/register');

    // No duplicate registration form must render anymore — the route is now
    // a pure client-side redirect to Affiliate v2's own registration page.
    await expect(page).toHaveURL(/\/affiliate\/register$/, { timeout: 10_000 });

    // The canonical Affiliate v2 form must be the one that renders (it has
    // its own "Jméno / název" field, distinct from the retired form's
    // "mainPlatformUrl" field).
    await expect(page.locator('#name')).toBeVisible({ timeout: 5_000 });
  });

  test('legacy /influencer/register preserves query string on redirect', async ({ page }) => {
    await page.goto('/influencer/register?ref=TESTCODE123');
    await expect(page).toHaveURL(/\/affiliate\/register\?ref=TESTCODE123$/, { timeout: 10_000 });
  });
});
