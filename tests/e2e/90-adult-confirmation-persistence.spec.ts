/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Potvrzení věku 18+ — bezpečné a prokazatelné uložení  (spec 90)           ║
 * ║                                                                            ║
 * ║  Potvrzení se ukládá do EXISTUJÍCÍHO mechanismu souhlasů                   ║
 * ║  `user_legal_acceptances` (slug 'adult-confirmation'):                     ║
 * ║    adult_confirmed = existence řádku · čas = accepted_at ·                 ║
 * ║    verze textu = document_version                                          ║
 * ║                                                                            ║
 * ║  ⛔ BLOCKER (90a, 90e): živá DB odmítá klientský INSERT do                 ║
 * ║     user_legal_acceptances chybou 42501 i pro VLASTNÍ řádek —              ║
 * ║     chybí INSERT policy, kterou migrace v gitu deklaruje (drift).          ║
 * ║     Připravena migrace                                                     ║
 * ║     supabase/migrations/20260721090000_user_legal_acceptances_insert_own   ║
 * ║     — NEAPLIKOVÁNO. Po aplikaci na staging převést oba testy zpět          ║
 * ║     z test.fixme na test.                                                  ║
 * ║                                                                            ║
 * ║  STAGING-ONLY, self-contained (vlastní throwaway uživatelé + cleanup).    ║
 * ║  Required env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,                  ║
 * ║                E2E_SUPABASE_SERVICE_ROLE_KEY                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const SLUG = 'adult-confirmation';
const VERSION = '1.0';
const PENDING_KEY = 'onemil_adult_confirmation_pending';
const PASSWORD = 'AdultConfirm123!';

const stamp = Date.now();
const USER_A_EMAIL = `spec90-a-${stamp}@onemil.cz`;
const USER_B_EMAIL = `spec90-b-${stamp}@onemil.cz`;
const USER_C_EMAIL = `spec90-c-${stamp}@onemil.cz`;
const USER_D_EMAIL = `spec90-d-${stamp}@onemil.cz`;

const makeAdmin = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ctx: { a?: string; b?: string; c?: string; d?: string } = {};

async function createUser(email: string): Promise<string> {
  const admin = makeAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user!.id;
}

/** Počet/obsah řádků potvrzení 18+ pro daného uživatele (čteno service rolí). */
async function confirmationRows(userId: string) {
  const admin = makeAdmin();
  const { data } = await admin
    .from('user_legal_acceptances')
    .select('id, user_id, document_slug, document_version, accepted_at')
    .eq('user_id', userId)
    .eq('document_slug', SLUG);
  return data ?? [];
}

/** Přihlášený anon klient konkrétního uživatele (respektuje RLS). */
async function signedInClient(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

/** Předvyplní cookie souhlas — banner jinak překrývá prvky. */
async function seedCookieConsent(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
    );
  });
}

test.describe.serial('90 — potvrzení 18+ se bezpečně ukládá', () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY || !SERVICE_KEY,
    'Missing required env vars — skipping spec 90',
  );

  test.beforeAll(async () => {
    ctx.a = await createUser(USER_A_EMAIL);
    ctx.b = await createUser(USER_B_EMAIL);
    ctx.c = await createUser(USER_C_EMAIL);
    ctx.d = await createUser(USER_D_EMAIL);

    // Referenční potvrzení uživatele A zakládáme service rolí, aby izolační
    // testy (90c/90d) nezávisely na blokované klientské INSERT policy.
    const admin = makeAdmin();
    const { error } = await admin.from('user_legal_acceptances').insert({
      user_id: ctx.a,
      document_slug: SLUG,
      document_version: VERSION,
    });
    if (error) throw new Error(`seed confirmation: ${error.message}`);
  });

  test.afterAll(async () => {
    const admin = makeAdmin();
    for (const id of [ctx.a, ctx.b, ctx.c, ctx.d]) {
      if (!id) continue;
      await admin.from('user_legal_acceptances').delete().eq('user_id', id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test('90a) uložené potvrzení nese správného uživatele, čas i verzi textu', async () => {
    const rows = await confirmationRows(ctx.a!);
    expect(rows.length).toBe(1);
    expect(rows[0].user_id, 'potvrzení musí patřit správnému uživateli').toBe(ctx.a);
    expect(rows[0].document_slug).toBe(SLUG);
    expect(rows[0].document_version, 'verze potvrzovaného textu').toBe(VERSION);
    expect(rows[0].accepted_at, 'čas potvrzení').toBeTruthy();

    // Nikomu jinému se nic nezapsalo
    expect((await confirmationRows(ctx.b!)).length).toBe(0);
  });

  // ⛔ BLOCKER: živá DB nemá INSERT policy pro vlastní souhlasy (42501).
  // Odblokuje migrace 20260721090000_user_legal_acceptances_insert_own.sql.
  test.fixme('90b) přihlášený uživatel smí zapsat vlastní potvrzení', async () => {
    const clientB = await signedInClient(USER_B_EMAIL);
    const { error } = await clientB.from('user_legal_acceptances').insert({
      user_id: ctx.b!,
      document_slug: SLUG,
      document_version: VERSION,
    });
    expect(error, 'vlastní potvrzení musí jít zapsat').toBeNull();

    const rows = await confirmationRows(ctx.b!);
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(ctx.b);
  });

  // ⛔ BLOCKER: stejná chybějící INSERT policy — hook zápis provede, ale DB ho odmítne.
  test.fixme('90c) návrat z OAuth uloží potvrzení přihlášenému uživateli', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await seedCookieConsent(page);
    await page.addInitScript(
      ([key, version]) => localStorage.setItem(key as string, version as string),
      [PENDING_KEY, VERSION],
    );

    await loginViaUI(page, USER_D_EMAIL, PASSWORD);

    await expect
      .poll(async () => (await confirmationRows(ctx.d!)).length, { timeout: 25_000 })
      .toBe(1);

    const [row] = await confirmationRows(ctx.d!);
    expect(row.user_id).toBe(ctx.d);
    expect(row.document_version).toBe(VERSION);
    expect(row.accepted_at).toBeTruthy();
    expect(
      consoleErrors.filter((e) => e.includes('AdultConfirmation')),
      'zápis potvrzení nesmí hlásit chybu',
    ).toEqual([]);
  });

  test('90d) bez potvrzení se žádný záznam nevytvoří', async ({ page }) => {
    // Uživatel C se přihlásí BEZ markeru — potvrzení se nesmí vyfabrikovat.
    await seedCookieConsent(page);
    await loginViaUI(page, USER_C_EMAIL, PASSWORD);
    await page.waitForTimeout(3_000);

    expect((await confirmationRows(ctx.c!)).length).toBe(0);
  });

  test('90e) jiný uživatel nemůže potvrzení vytvořit za někoho jiného (RLS)', async () => {
    const clientB = await signedInClient(USER_B_EMAIL);

    const { error } = await clientB.from('user_legal_acceptances').insert({
      user_id: ctx.a!, // cizí uživatel
      document_slug: SLUG,
      document_version: 'podvrzeno',
    });

    expect(error, 'INSERT za jiného uživatele musí RLS odmítnout').not.toBeNull();

    const rows = await confirmationRows(ctx.a!);
    expect(rows.length).toBe(1);
    expect(rows[0].document_version).toBe(VERSION);
  });

  test('90f) jiný uživatel nemůže cizí potvrzení přepsat ani smazat (RLS)', async () => {
    const clientB = await signedInClient(USER_B_EMAIL);
    const before = (await confirmationRows(ctx.a!))[0];

    // UPDATE — tabulka nemá žádnou UPDATE policy → 0 dotčených řádků
    await clientB
      .from('user_legal_acceptances')
      .update({ document_version: 'prepsano' })
      .eq('user_id', ctx.a!)
      .eq('document_slug', SLUG);

    // DELETE — rovněž bez policy → 0 dotčených řádků
    await clientB
      .from('user_legal_acceptances')
      .delete()
      .eq('user_id', ctx.a!)
      .eq('document_slug', SLUG);

    const after = await confirmationRows(ctx.a!);
    expect(after.length, 'potvrzení nesmí být smazáno').toBe(1);
    expect(after[0].document_version, 'potvrzení nesmí být přepsáno').toBe(before.document_version);
    expect(after[0].accepted_at).toBe(before.accepted_at);
  });
});
