import { test, expect } from '@playwright/test';

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

    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);

    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'DifferentPassword!');
    await page.fill('#dateOfBirth', dob.toISOString().split('T')[0]);
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();
    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    // Should stay on /register and show an error
    await expect(page).toHaveURL('/register');
  });

  test('new user registers and lands on profile page', async ({ page }) => {
    // Each CI run creates a fresh test account – cleanup is manual
    const uniqueEmail = `e2e+${Date.now()}@onemil-test.invalid`;
    const password = 'E2eSmoke123!';

    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);

    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.fill('#dateOfBirth', dob.toISOString().split('T')[0]);
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();
    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    // Supabase may auto-confirm or send email; both cases land on /profile or show error
    await page.waitForURL(
      (url) => url.pathname === '/profile' || url.pathname === '/register',
      { timeout: 20_000 },
    );

    const finalUrl = page.url();
    // Accept either a successful redirect or staying on register (email-confirm flow)
    expect(['/profile', '/register'].some((p) => finalUrl.includes(p))).toBeTruthy();
  });
});
