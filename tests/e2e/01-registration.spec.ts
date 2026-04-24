import { test, expect, Page } from '@playwright/test';

/**
 * Fill a React-controlled <input type="date"> reliably.
 * Playwright's fill() triggers native input events, but React's synthetic
 * onChange can miss them in some builds. This helper sets the value via the
 * native setter and fires both input and change so React picks it up.
 */
async function fillDateInput(page: Page, selector: string, isoDate: string): Promise<void> {
  const input = page.locator(selector);
  await input.focus();
  await input.fill(isoDate);
  // Re-dispatch if React's controlled value didn't update
  await input.evaluate((el: HTMLInputElement, val: string) => {
    if (el.value !== val) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, isoDate);
  await expect(input).toHaveValue(isoDate);
}

function dobString(yearsAgo: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo);
  return d.toISOString().split('T')[0];
}

test.describe('User Registration', () => {
  test('registration form renders all required fields', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('#dateOfBirth')).toBeVisible();
    await expect(page.locator('#terms')).toBeVisible();
    await expect(page.locator('#gdpr')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zaregistrovat se' })).toBeVisible();
  });

  test('registration fails when passwords do not match', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'mismatch@example.com');
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'DifferentPassword!');
    await fillDateInput(page, '#dateOfBirth', dobString(25));
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();
    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    // Should stay on /register — DOB mismatch never navigates away
    await expect(page).toHaveURL('/register');
  });

  test('new user registers and is redirected away from /register', async ({ page }) => {
    const uniqueEmail = `e2e+${Date.now()}@example.com`;
    const password = 'E2eSmoke123!';
    const dob = dobString(25);

    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await fillDateInput(page, '#dateOfBirth', dob);

    // Confirm DOB was accepted before proceeding
    await expect(page.locator('#dateOfBirth')).toHaveValue(dob);

    await page.locator('#terms').click();
    await page.locator('#gdpr').click();

    // Submit and wait for the Supabase auth API response concurrently
    const [authResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/auth/v1/signup'),
        { timeout: 20_000 },
      ),
      page.getByRole('button', { name: 'Zaregistrovat se' }).click(),
    ]);

    // A 4xx/5xx here means Supabase rejected the signup itself
    expect(
      authResponse.status(),
      `Supabase signup returned HTTP ${authResponse.status()}`,
    ).toBeLessThan(400);

    // Wait for React to process and navigate away from /register.
    // Register.tsx always calls navigate('/profile') on success, even when
    // email confirmation is required. The DateOfBirthGuard may then show the
    // email-confirmation notice at /profile, but the URL still changes.
    await page.waitForURL(
      (url) => url.pathname !== '/register',
      { timeout: 20_000 },
    );

    const finalPath = new URL(page.url()).pathname;

    // Accept: /profile (auto-confirm or email-confirm), /onboarding/* (DOB guard)
    const validDestinations = ['/profile', '/onboarding'];
    expect(
      validDestinations.some((p) => finalPath.startsWith(p)),
      `Unexpected post-registration path: ${finalPath}`,
    ).toBeTruthy();
  });
});
