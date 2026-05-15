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
 *   1. /influencer — Affiliate landing page renders with correct "Affiliate" wording.
 *      CTA buttons link to /influencer/register and /influencer/how-to-earn.
 *   2. /influencer/how-to-earn — How-to page renders with "Affiliate" wording,
 *      step headings, back link, and bottom CTA.
 *   3. /influencer/register — Registration form renders with correct title and
 *      all required input fields. Form is NOT submitted.
 *
 * Regressions caught:
 *   - "Influencer" wording accidentally restored after Influencer → Affiliate rename.
 *   - CTA buttons / links breaking (wrong href, removed Link wrapper).
 *   - Registration form fields removed or renamed.
 *   - Pages accidentally put behind an auth guard.
 *   - H1 / CardTitle text changed without updating copy review.
 */

import { test, expect } from '@playwright/test';

test.describe('Affiliate Program — Public Pages', () => {

  // ── 1. Landing page ─────────────────────────────────────────────────────────
  test('landing page renders Affiliate wording and CTA links', async ({ page }) => {
    await page.goto('/influencer');

    // Badge / chip
    await expect(
      page.getByText('Affiliate program OneMil', { exact: true }),
      '"Affiliate program OneMil" chip must be visible on the landing page',
    ).toBeVisible({ timeout: 10_000 });

    // H1 heading
    await expect(
      page.getByRole('heading', { name: 'Staňte se Affiliate partnerem OneMil', exact: true }),
      'H1 heading must read "Staňte se Affiliate partnerem OneMil"',
    ).toBeVisible({ timeout: 5_000 });

    // Primary CTA: registration button — pick the first occurrence (hero CTA)
    const registerCta = page
      .getByRole('link', { name: /Registrovat se jako Affiliate partner/i })
      .first();
    await expect(
      registerCta,
      '"Registrovat se jako Affiliate partner" CTA must be visible',
    ).toBeVisible({ timeout: 5_000 });

    // CTA must point to /influencer/register
    const registerHref = await registerCta.getAttribute('href');
    expect(
      registerHref,
      'Registration CTA href must contain /influencer/register',
    ).toMatch(/\/influencer\/register/);

    // Secondary CTA: how-to link
    const howToLink = page.getByRole('link', { name: /Jak to funguje/i }).first();
    await expect(
      howToLink,
      '"Jak to funguje" link must be visible',
    ).toBeVisible({ timeout: 5_000 });

    // Link must point to /influencer/how-to-earn
    const howToHref = await howToLink.getAttribute('href');
    expect(
      howToHref,
      '"Jak to funguje" link href must contain /influencer/how-to-earn',
    ).toMatch(/\/influencer\/how-to-earn/);
  });

  // ── 2. How-to-earn page ──────────────────────────────────────────────────────
  test('how-to-earn page renders Affiliate wording, steps, and back link', async ({ page }) => {
    await page.goto('/influencer/how-to-earn');

    // H1
    await expect(
      page.getByRole('heading', { name: 'Jak vydělávat s OneMil', exact: true }),
      'H1 must read "Jak vydělávat s OneMil"',
    ).toBeVisible({ timeout: 10_000 });

    // Step 1 heading — confirms "Affiliate odkaz" wording present
    await expect(
      page.getByRole('heading', { name: /Sdílejte Affiliate odkaz/i }),
      'Step 1 heading must reference "Affiliate odkaz"',
    ).toBeVisible({ timeout: 5_000 });

    // Back link to /influencer
    const backLink = page.getByRole('link', { name: /Zpět na Affiliate program/i });
    await expect(
      backLink,
      '"Zpět na Affiliate program" back link must be visible',
    ).toBeVisible({ timeout: 5_000 });

    const backHref = await backLink.getAttribute('href');
    expect(
      backHref,
      '"Zpět na Affiliate program" must link to /influencer',
    ).toMatch(/\/influencer$/);

    // Bottom CTA
    await expect(
      page.getByRole('link', { name: /Registrovat se jako Affiliate partner/i }).last(),
      'Bottom "Registrovat se jako Affiliate partner" CTA must be visible',
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 3. Registration form ─────────────────────────────────────────────────────
  test('registration form renders correct title and required fields — form NOT submitted', async ({ page }) => {
    await page.goto('/influencer/register');

    // Card title
    await expect(
      page.getByText('Registrace Affiliate partnera', { exact: true }),
      'Card title must read "Registrace Affiliate partnera"',
    ).toBeVisible({ timeout: 10_000 });

    // Name field
    await expect(
      page.locator('input[name="name"]'),
      'Name input (name="name") must be present',
    ).toBeVisible({ timeout: 5_000 });

    // Email field
    await expect(
      page.locator('input[name="email"][type="email"]'),
      'Email input (name="email", type="email") must be present',
    ).toBeVisible({ timeout: 5_000 });

    // Password field
    await expect(
      page.locator('input[name="password"][type="password"]'),
      'Password input (name="password", type="password") must be present',
    ).toBeVisible({ timeout: 5_000 });

    // Main platform URL field
    await expect(
      page.locator('input[name="mainPlatformUrl"]'),
      'Main platform URL input (name="mainPlatformUrl") must be present',
    ).toBeVisible({ timeout: 5_000 });

    // Back link to /influencer
    const backLink = page.getByRole('link', { name: /Zpět na Affiliate program/i });
    await expect(
      backLink,
      '"Zpět na Affiliate program" link must be present on register page',
    ).toBeVisible({ timeout: 5_000 });

    // ── Guard: form NOT submitted ─────────────────────────────────────────────
    // We deliberately do NOT click the submit button.
    // URL must remain on /influencer/register — confirms no accidental navigation.
    await expect(page).toHaveURL(/\/influencer\/register/);
  });
});
