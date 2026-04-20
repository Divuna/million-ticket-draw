import { Page } from '@playwright/test';

export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
  // Wait until navigated away from /login (auth redirect)
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });
}
