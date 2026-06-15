/**
 * Spec 52 — A02: Admin vytvoření soutěže (ticket_count validace + backend path)
 *              A11: Izolace draft soutěže (RLS)
 *
 * Staging-only, self-contained.
 *
 * 52a — A02 UI: Admin otevře create modal → save button zakázán bez povinných polí
 *               (ticket_count = 0 → validation.basic.isValid = false → disabled)
 * 52b — A02 UI: ticket_count = 10 ale chybí hlavní obrázek → základní validace OK,
 *               grafická ne → save button stále zakázán, error list ukazuje "Hlavní obrázek"
 * 52c — A02 backend: Vytvoření soutěže přes admin_manage_contest RPC (admin JWT)
 *               → contest v DB s ticket_count=100 → cleanup přes service_role
 * 52d — A11: Draft contest není viditelný anonymním uživatelům (RLS izolace)
 *
 * Vyžaduje (playwright-staging.yml secrets):
 *   VITE_SUPABASE_URL               — staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */

import { test, expect, type Locator } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!ANON_KEY && !!SERVICE_ROLE &&
  !!ADMIN_EMAIL && !!ADMIN_PASSWORD;

const RUN_ID       = Date.now();
const CONTEST_TITLE = `E2E Spec52 Test ${RUN_ID}`;

const ctx: { contestId?: string } = {};

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function inputByLabel(dialog: Locator, labelText: string): Locator {
  return dialog
    .locator('label', { hasText: labelText })
    .locator('..')
    .locator('input');
}

async function cleanupContest(): Promise<void> {
  if (!ctx.contestId) return;
  const admin = makeServiceClient();
  await (admin as any).from('bonus_prizes').delete().eq('contest_id', ctx.contestId);
  await (admin as any).from('admin_actions').delete().eq('contest_id', ctx.contestId);
  await (admin as any).from('contests').delete().eq('id', ctx.contestId);
  ctx.contestId = undefined;
}

test.describe('52 — A02/A11: Admin contest create + draft RLS izolace', () => {
  test.afterAll(async () => {
    if (!isStaging) return;
    await cleanupContest();
  });

  test('52a) A02 UI — save button zakázán bez ticket_count', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?tab=management');

    const newBtn = page.getByRole('button', { name: /Nová soutěž/i });
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
    await newBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Vytvořit novou soutěž', { exact: true })).toBeVisible({ timeout: 15_000 });

    // ticket_count defaults to 1_000_000 — vyčistit ho na 0 aby se zobrazila chyba "Počet tiketů"
    // (handleChange sets Number("0") = 0, validation.basic.errors = [..., "Počet tiketů"])
    const ticketCountInput = inputByLabel(dialog, 'Počet tiketů');
    await ticketCountInput.fill('0');

    // Přepnout na tab "Vytvořit soutěž" kde je save button + error container
    await dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click();

    // save button zakázán (ticket_count = 0 → isFormValid = false)
    const saveBtn = dialog.getByRole('button', { name: /Vytvořit soutěž/i }).last();
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 });

    // Error container je viditelný — "Chybějící povinné údaje:" se zobrazí jen při !isFormValid
    await expect(dialog.getByText('Chybějící povinné údaje:')).toBeVisible({ timeout: 3_000 });
    // "Počet tiketů" JE v error listu (ticket_count = 0 → validation.basic.errors obsahuje "Počet tiketů")
    await expect(dialog.locator('li', { hasText: 'Počet tiketů' })).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press('Escape');
  });

  test('52b) A02 UI — ticket_count OK, chybí main_image → save stále zakázán', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?tab=management');

    const newBtn = page.getByRole('button', { name: /Nová soutěž/i });
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
    await newBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Vytvořit novou soutěž', { exact: true })).toBeVisible({ timeout: 15_000 });

    // Vyplnit všechna základní pole — ticket_count validní (>= 5)
    await inputByLabel(dialog, 'Název soutěže').fill(`${CONTEST_TITLE}-ui2`);
    await inputByLabel(dialog, 'Hlavní výhra').fill('E2E UI Test Prize 2');
    await inputByLabel(dialog, 'Počet tiketů').fill('100');
    await inputByLabel(dialog, 'Cena tiketu (MioCoins)').fill('1');

    // Přepnout na tab "Vytvořit soutěž" kde je save button + error container
    await dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click();

    // validation.basic.isValid = true, ale graphics.isValid = false (chybí main_image)
    // → isFormValid = false → save button stále disabled
    const saveBtn = dialog.getByRole('button', { name: /Vytvořit soutěž/i }).last();
    await expect(saveBtn).toBeDisabled({ timeout: 3_000 });

    // Error container je stále viditelný (grafická validace selhává)
    await expect(dialog.getByText('Chybějící povinné údaje:')).toBeVisible({ timeout: 3_000 });

    // Základní validace prošla → "Počet tiketů" NENÍ v error listu
    await expect(dialog.locator('li', { hasText: 'Počet tiketů' })).not.toBeVisible({ timeout: 3_000 });

    // Grafická validace selhala → "Hlavní obrázek" JE v error listu
    await expect(dialog.locator('li', { hasText: 'Hlavní obrázek' })).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press('Escape');
  });

  test('52c) A02 backend — admin_manage_contest RPC vytvoří soutěž s ticket_count=100', async () => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(30_000);

    // Přihlásit jako admin přes anon klienta (admin JWT)
    const adminClient = makeAnonClient();
    const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    if (signInErr) throw new Error(`Admin signIn failed: ${signInErr.message}`);
    expect(signInData.user).toBeTruthy();

    // Zavolat admin_manage_contest RPC přes admin JWT
    const { data: result, error: rpcErr } = await (adminClient as any).rpc('admin_manage_contest', {
      p_title: CONTEST_TITLE,
      p_main_prize: 'E2E Spec52 Hlavní výhra',
      p_ticket_count: 100,
      p_ticket_price: 1,
      p_status: 'draft',
      p_operation: 'create',
    });

    if (rpcErr) throw new Error(`admin_manage_contest failed: ${rpcErr.message}`);

    // RPC vrátí JSON s contest_id
    const contestId: string = (result as any)?.contest_id ?? (result as any)?.id;
    expect(contestId, 'RPC musí vrátit contest_id').toBeTruthy();
    ctx.contestId = contestId;

    // Ověřit v DB přes service_role — správný ticket_count
    const admin = makeServiceClient();
    const { data: row, error: dbErr } = await (admin as any)
      .from('contests')
      .select('id, title, ticket_count, status')
      .eq('id', contestId)
      .single();

    expect(dbErr, 'Čtení z DB nesmí selhat').toBeNull();
    expect(row?.ticket_count, 'ticket_count musí být 100').toBe(100);
    expect(row?.title).toBe(CONTEST_TITLE);
    expect(row?.status).toBe('draft');

    await adminClient.auth.signOut();
  });

  test('52d) A11 izolace — draft contest není viditelný anonymním uživatelům', async () => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    if (!ctx.contestId) test.skip(true, 'Žádný test contest (52c přeskočen)');
    test.setTimeout(15_000);

    // Anonymní klient (bez přihlášení) nesmí vidět draft soutěž
    const anonClient = makeAnonClient();
    const { data: rows, error } = await (anonClient as any)
      .from('contests')
      .select('id, title, status')
      .eq('id', ctx.contestId!);

    // RLS: draft contest → anon nemůže číst → prázdné pole nebo 0 řádků
    const found = (rows ?? []).length > 0;
    expect(found, 'Anonymní uživatel nesmí vidět draft soutěž (RLS izolace)').toBe(false);
  });
});
