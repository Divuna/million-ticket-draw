import { test, expect } from '@playwright/test';

/**
 * L08 — potvrzení 18+ při registraci
 *
 * Registrace už nesbírá ani neukládá datum narození. Místo toho je povinné
 * zaškrtávací pole „Potvrzuji, že mi bylo 18 let.". Tento test ověřuje:
 * - registrační formulář obsahuje povinné potvrzení 18+ (#ageConfirm),
 * - bez potvrzení registrace neprojde a zobrazí srozumitelnou chybu,
 * - datum narození už není ve formuláři vyžadováno (#dateOfBirth neexistuje),
 * - po potvrzení 18+ se chyba věku nezobrazí (flow pokračuje k podmínkám),
 * - stará onboarding routa /onboarding/date-of-birth nikoho neblokuje a
 *   přesměruje na domovskou stránku (OAuth ani přihlášený uživatel bez data
 *   narození není blokován).
 *
 * Testy jsou čistě frontendové — žádný Supabase signup se neprovede.
 */

const AGE_CONFIRM_ERROR = 'Pro registraci musíte potvrdit, že vám bylo 18 let.';

test.describe('L08 — potvrzení 18+ při registraci', () => {
  test('49a) registrace obsahuje povinné potvrzení 18+', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('#ageConfirm')).toBeVisible();
    await expect(page.getByText('Potvrzuji, že mi bylo 18 let.')).toBeVisible();
  });

  test('49b) datum narození už není ve formuláři vyžadováno', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('#dateOfBirth')).toHaveCount(0);
    await expect(page.getByText('Datum narození')).toHaveCount(0);
  });

  test('49c) bez potvrzení 18+ registrace neprojde a zobrazí chybu', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'noage@onemil-test.invalid');
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    // #ageConfirm záměrně NEZAŠKRTÁVÁME
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    await expect(page.getByText(AGE_CONFIRM_ERROR)).toBeVisible({ timeout: 5_000 });
    // Zůstáváme na /register — žádný signup request nebyl odeslán
    await expect(page).toHaveURL('/register');
  });

  test('49d) po potvrzení 18+ se chyba věku nezobrazí', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'adult@onemil-test.invalid');
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    await page.locator('#ageConfirm').click();
    // Záměrně NEPŘIJÍMÁME podmínky — flow se zastaví na podmínkách (toast),
    // nikoli na chybě věku. Tím ověříme, že potvrzení 18+ prošlo.

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    await expect(page.getByText(AGE_CONFIRM_ERROR)).not.toBeVisible({ timeout: 3_000 });
    await expect(page).toHaveURL('/register');
  });

  test('49e) stará onboarding routa přesměruje na domovskou stránku (neblokuje)', async ({ page }) => {
    await page.goto('/onboarding/date-of-birth');

    // Přesměrování pryč z onboardingu — žádný formulář data narození se nezobrazí
    await expect(page).not.toHaveURL(/\/onboarding\/date-of-birth/, { timeout: 5_000 });
    await expect(page.locator('#dateOfBirth')).toHaveCount(0);
    await expect(page.getByText('Pro pokračování potřebujeme znát vaše datum narození.')).toHaveCount(0);
  });
});
