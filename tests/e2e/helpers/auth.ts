import { Page } from '@playwright/test';

export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  // Wait until navigated away from /login (auth redirect)
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });
}

/**
 * Affiliate accounts use the dedicated /affiliate/login entrance (the game
 * /login no longer auto-routes affiliate/partner accounts into their dashboards).
 */
export async function loginAffiliateViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/affiliate/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 20_000 });
}
