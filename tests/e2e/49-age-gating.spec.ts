import { test, expect, Page } from '@playwright/test';

/**
 * L08 — 18+ věkový gate
 *
 * Ověřuje, že:
 * - registrační formulář (/register) odmítne věk < 18 a zobrazí chybový text,
 * - registrační formulář přijme věk >= 18 (age error se nezobrazí),
 * - onboarding stránka (/onboarding/date-of-birth) odmítne věk < 18,
 * - onboarding stránka přijme věk >= 18 (age error se nezobrazí).
 *
 * Testy jsou čistě frontendové — žádný Supabase signup se neprovede.
 * /onboarding/date-of-birth je veřejná routa (bez auth guardu), takže
 * test odmítnutí věku < 18 funguje i bez aktivní session.
 */

/**
 * Vrátí ISO datum (YYYY-MM-DD) pro narozeniny přesně `years` let zpět od dnešního dne.
 * Leap-year edge case (29. 2.): pokud výsledný rok nemá 29. 2., použije se 28. 2.
 */
function dobYearsAgo(years: number): string {
  const today = new Date();
  const targetYear = today.getFullYear() - years;
  const month = today.getMonth();
  const day = today.getDate();
  const candidate = new Date(targetYear, month, day);
  // Pokud den přetekl (29.2. → 1.3. v nepřestupném roce), vrátíme se na poslední den měsíce
  if (candidate.getMonth() !== month) {
    candidate.setDate(0);
  }
  return candidate.toISOString().split('T')[0];
}

/**
 * Spolehlivě vyplní React-controlled <input type="date">.
 * Stejný helper jako spec 01 — zajišťuje, že React zachytí změnu i při
 * synthetickém fill().
 */
async function fillDateInput(page: Page, selector: string, isoDate: string): Promise<void> {
  const input = page.locator(selector);
  await input.focus();
  await input.fill(isoDate);
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

const AGE_ERROR = 'Pro registraci musíte mít alespoň 18 let.';

test.describe('L08 — 18+ věkový gate', () => {

  // ── Registrační formulář (/register) ──────────────────────────────────────

  test('49a) registrace — odmítne věk 17 let', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'underage17@onemil-test.invalid');
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    await fillDateInput(page, '#dateOfBirth', dobYearsAgo(17));
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    // Chyba věku musí být viditelná
    await expect(page.getByText(AGE_ERROR)).toBeVisible({ timeout: 5_000 });
    // Zůstáváme na /register — žádný signup request nebyl odeslán
    await expect(page).toHaveURL('/register');
  });

  test('49b) registrace — odmítne věk 0 let (narozeni dnes)', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'newborn@onemil-test.invalid');
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    await fillDateInput(page, '#dateOfBirth', dobYearsAgo(0));
    await page.locator('#terms').click();
    await page.locator('#gdpr').click();

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    await expect(page.getByText(AGE_ERROR)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL('/register');
  });

  test('49c) registrace — přijme věk přesně 18 let (žádná chyba věku)', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'exact18@onemil-test.invalid');
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    await fillDateInput(page, '#dateOfBirth', dobYearsAgo(18));
    // Záměrně NEPŘIJÍMÁME podmínky — formulář se zastaví na podmínkách (toast),
    // nikoli na chybě věku. Tím ověříme, že age validace prošla, aniž bychom
    // odeslali skutečný signup request.

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    // Chyba věku nesmí být viditelná
    await expect(page.getByText(AGE_ERROR)).not.toBeVisible({ timeout: 3_000 });
    // Stále na /register (zastaveno u podmínek)
    await expect(page).toHaveURL('/register');
  });

  test('49d) registrace — přijme věk 25 let (žádná chyba věku)', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#email', 'adult25@onemil-test.invalid');
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    await fillDateInput(page, '#dateOfBirth', dobYearsAgo(25));

    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

    await expect(page.getByText(AGE_ERROR)).not.toBeVisible({ timeout: 3_000 });
    await expect(page).toHaveURL('/register');
  });

  // ── Onboarding stránka (/onboarding/date-of-birth) ────────────────────────
  // Tato routa je veřejná (žádný auth guard v App.tsx).
  // Validace věku proběhne ještě před kontrolou přihlášení uživatele,
  // takže odmítnutí věku < 18 funguje i bez aktivní session.

  test('49e) onboarding — odmítne věk 17 let', async ({ page }) => {
    await page.goto('/onboarding/date-of-birth');

    await fillDateInput(page, '#dateOfBirth', dobYearsAgo(17));
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    await expect(page.getByText(AGE_ERROR)).toBeVisible({ timeout: 5_000 });
    // Zůstáváme na onboarding stránce
    await expect(page).toHaveURL('/onboarding/date-of-birth');
  });

  test('49f) onboarding — přijme věk přesně 18 (žádná chyba věku; bez session)', async ({ page }) => {
    await page.goto('/onboarding/date-of-birth');

    await fillDateInput(page, '#dateOfBirth', dobYearsAgo(18));
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    // Chyba věku nesmí být viditelná — age validace prošla
    await expect(page.getByText(AGE_ERROR)).not.toBeVisible({ timeout: 3_000 });
    // Bez session handleSubmit zobrazí "Uživatel není přihlášen." — potvrzuje,
    // že age check proběhl úspěšně a dospěl k auth check.
    await expect(page.getByText('Uživatel není přihlášen.')).toBeVisible({ timeout: 5_000 });
  });

});
