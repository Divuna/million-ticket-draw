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

/**
 * Verify a Supabase session was written to localStorage.
 * The app configures storageKey: 'onemil-auth' in the Supabase client.
 */
async function expectSessionExists(page: Page): Promise<void> {
  const isLoggedIn = await page.evaluate(() =>
    localStorage.getItem('onemil-auth') !== null,
  );
  expect(isLoggedIn, 'Expected Supabase session in localStorage (onemil-auth) but none found').toBe(true);
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

    await expect(page).toHaveURL('/register');
  });

  test('new user registers and is authenticated', async ({ page }) => {
    const uniqueEmail = `e2e+${Date.now()}@example.com`;
    const password = 'E2eSmoke123!';
    const dob = dobString(25);

    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await fillDateInput(page, '#dateOfBirth', dob);

    // Confirm DOB was accepted before submitting
    await expect(page.locator('#dateOfBirth')).toHaveValue(dob);

    await page.locator('#terms').click();
    await page.locator('#gdpr').click();

    // Submit and wait for Supabase auth response concurrently
    const [authResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/auth/v1/signup'),
        { timeout: 20_000 },
      ),
      page.getByRole('button', { name: 'Zaregistrovat se' }).click(),
    ]);

    // Supabase must accept the signup before we check anything else
    expect(
      authResponse.status(),
      `Supabase /auth/v1/signup returned HTTP ${authResponse.status()}`,
    ).toBeLessThan(400);

    // Register.tsx always calls navigate('/profile') on success — wait to leave /register
    await expect(page).not.toHaveURL(/\/register/, { timeout: 15_000 });

    // Allow 3 s for Supabase to write the session token and React to settle
    await page.waitForTimeout(3_000);

    // Primary auth check: Supabase session must be in localStorage (storageKey: 'onemil-auth')
    await expectSessionExists(page);

    // Visual confirmation: one of two screens is expected after registration —
    //   email auto-confirmed → app renders and the bottom nav is visible
    //   email confirmation required → DateOfBirthGuard shows the confirm-email notice
    const bottomNav = page.getByRole('navigation', { name: 'Hlavní menu' });
    const emailConfirmScreen = page.getByText('Potvrďte svůj e-mail', { exact: false });
    await expect(
      bottomNav.or(emailConfirmScreen),
      'Expected to see either the app navigation or the email confirmation notice',
    ).toBeVisible({ timeout: 5_000 });
  });
});
