/**
 * Spec 51 — C21: Smazání účtu / delete-account flow
 *
 * Staging-only. Ověřuje stránku `/delete-account`:
 *
 *   51a) Stránka se načte bez chyby pro nepřihlášeného návštěvníka.
 *   51b) Stránka zobrazuje správný obsah (nadpis, instrukce, e-mail,
 *        GDPR zmínka). Ověřuje, že GDPR flow existuje: zákazník buď
 *        (a) může projít in-app cestou přes Profil → Nastavení účtu,
 *        nebo (b) má k dispozici e-mailovou cestu na podpora@onemil.cz.
 *   51c) Přihlášený zákazník vidí stránku bez auth guardu (stránka je
 *        veřejná — neredirectuje na /login).
 *
 * POZNÁMKA: `/delete-account` je v současné implementaci informační
 * stránka. Skutečné smazání probíhá buď přes in-app Profile → Smazat účet
 * (pokud je implementováno), nebo e-mailovou žádostí na podpora@onemil.cz.
 * Tento spec ověřuje existenci a správnost GDPR delete-account flow,
 * nikoli faktické smazání dat v DB.
 *
 * Vyžaduje (volitelné — bez nich testy 51c skočí):
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('51 — C21: Delete account / smazání účtu stránka', () => {

  test('51a) /delete-account se načte bez chyby (veřejný přístup)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/delete-account');

    // Stránka musí být dostupná (neměla by redirectovat na /login)
    expect(page.url()).not.toMatch(/\/login/);

    // Žádná nekritická chyba v konzoli
    expect(errors.filter((e) => !e.includes('ResizeObserver')), 'Uncaught JS errors').toHaveLength(0);
  });

  test('51b) stránka zobrazuje nadpis, instrukce a e-mailový kontakt', async ({ page }) => {
    await page.goto('/delete-account');

    // Nadpis stránky
    await expect(
      page.getByRole('heading', { name: 'Smazání účtu' }),
    ).toBeVisible({ timeout: 10_000 });

    // Instrukce pro smazání v aplikaci
    await expect(
      page.getByText('Smazání přímo v aplikaci'),
    ).toBeVisible({ timeout: 5_000 });

    // E-mailová cesta — must contain support email
    await expect(
      page.getByText('podpora@onemil.cz'),
    ).toBeVisible({ timeout: 5_000 });

    // GDPR zmínka
    await expect(
      page.getByText(/GDPR|osobní\s+údaj/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Upozornění o nevratnosti smazání
    await expect(
      page.getByText(/nevratn|30\s*dn/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('51c) přihlášený zákazník vidí stránku bez redirekt (není vyžadován login)', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');
    }
    test.setTimeout(40_000);

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    // Přejít na delete-account jako přihlášený uživatel
    await page.goto('/delete-account');

    // Nesmí redirectovat na /login (stránka je veřejná)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 8_000 });

    // Nadpis musí být viditelný
    await expect(
      page.getByRole('heading', { name: 'Smazání účtu' }),
    ).toBeVisible({ timeout: 10_000 });

    // E-mailový odkaz musí být klikatelný (obsahuje mailto:)
    const mailtoLink = page.locator('a[href*="mailto:podpora@onemil.cz"]');
    await expect(mailtoLink).toBeVisible({ timeout: 5_000 });
    const href = await mailtoLink.getAttribute('href');
    expect(href).toContain('subject=');
  });
});
