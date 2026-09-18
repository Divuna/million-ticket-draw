/**
 * ⚠️ DOČASNÝ SPEC — SMAZAT PO POUŽITÍ ⚠️
 *
 * Jednorázový cílený E2E postup pro vytvoření JEDNÉ finální testovací soutěže
 * na stagingu přes normální existující admin UI (žádné přímé SQL INSERT/UPDATE
 * do `contests`). Spouští se přes:
 *
 *   gh workflow run playwright-staging.yml --ref fix/ticket-result-modal-unify \
 *     -f only_spec=tests/e2e/999-final-test-contest-setup-TEMP.spec.ts
 *
 * Přihlášení: existující staging E2E superadmin účet
 *   (STAGING_E2E_SUPERADMIN_EMAIL / STAGING_E2E_SUPERADMIN_PASSWORD,
 *    default superadmin-e2e@onemil.cz). Heslo se nikde nevypisuje/neloguje.
 *
 * Nastavení soutěže:
 *   - title: "FINAL TEST – Ticket Flow"
 *   - ticket_count: 12, ticket_price: 1
 *   - main_prize: "Testovací hlavní výhra" (= poslední tiket = pozice 12)
 *   - fyzická bonusová výhra "Testovací bonusová výhra" na pozici 4
 *   - MioCoin bonus 250 MioCoinů na pozici 5 (NE 7 — viz poznámka níže)
 *
 * MioCoin pozice — DŮLEŽITÁ POZNÁMKA:
 *   Administrace MioCoin generátoru neumí ručně zadat přesnou pozici — jen
 *   bulk formuli (Celkový počet MioCoinů / Hodnota jednoho bonusu → počet
 *   pozic, rozmístění Rovnoměrně/Náhodně). Pro ticket_count=12 a jednu pozici
 *   (250/250=1) vzorec "Rovnoměrně" deterministicky vygeneruje pozici 5
 *   (maxMioCoinPosition = ticket_count-1 = 11, spacing = floor(11/2) = 5).
 *   Proto tento test počítá s pozicí 5, ne s původně plánovanou 7. Toto je
 *   vlastnost současné admin UI, žádný kód nebyl kvůli tomu měněn.
 *
 * Ověřuje se: uložení → reload → hodnoty se nezměnily → editace POUZE popisu
 * → uložení → reload → ticket_count/ticket_price/status/obě bonusové pozice
 * se SAMY OD SEBE NEZMĚNILY (spec-152-style regrese, kterou majitel chtěl
 * pohlídat). Žádný tiket se v tomto testu nekupuje.
 */

import { test, expect, type Locator } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

// Existing staging E2E superadmin account — never printed, never logged.
const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  !!ANON_KEY && !!SERVICE_ROLE &&
  !!SUPERADMIN_EMAIL && !!SUPERADMIN_PASSWORD;

const RUN_ID = Date.now();
const CONTEST_TITLE = `FINAL TEST – Ticket Flow ${RUN_ID}`;
const MAIN_IMAGE_PATH = path.resolve(process.cwd(), 'public/miocoin-icon.png');

const ctx: { contestId?: string } = {};

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function inputByLabel(container: Locator, labelText: string): Locator {
  return container.locator('label', { hasText: labelText }).locator('..').locator('input');
}

async function openContestEditDialog(page: import('@playwright/test').Page) {
  // Freshly created contests default to status "pending", which the admin
  // list groups under "Aktivní soutěže" (archiveTab "active" — pending/
  // active/paused), NOT "Archiv test" (that tab is status === "draft" only).
  await page.getByRole('button', { name: /Aktivní soutěže/i }).click();
  await page.waitForTimeout(500);
  const row = page.locator('tr', { hasText: CONTEST_TITLE });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: /Upravit/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test.describe('999 TEMP — Final test contest setup via normal admin UI', () => {
  test('creates FINAL TEST contest, verifies persistence, verifies description-only edit does not overwrite other fields', async ({ page }) => {
    test.setTimeout(240_000);

    if (!isStaging) {
      test.skip(true, 'Staging secrets not available (VITE_SUPABASE_URL / service role / superadmin creds)');
    }

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });

    // ── Step 1: Login as existing staging superadmin ─────────────────────────
    await loginViaUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await page.goto('/admin?tab=management');
    await expect(page.getByRole('button', { name: /Nová soutěž/i })).toBeVisible({ timeout: 15_000 });

    // ── Step 2: Open create-contest dialog ────────────────────────────────────
    await page.getByRole('button', { name: /Nová soutěž/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Vytvořit novou soutěž', { exact: true })).toBeVisible({ timeout: 15_000 });

    // ── Step 3: Základní údaje ─────────────────────────────────────────────────
    await inputByLabel(dialog, 'Název soutěže').fill(CONTEST_TITLE);
    await inputByLabel(dialog, 'Hlavní výhra').fill('Testovací hlavní výhra');
    await inputByLabel(dialog, 'Počet tiketů').fill('12');
    await inputByLabel(dialog, 'Cena tiketu (MioCoins)').fill('1');

    // handleSave() unconditionally requires rules_pdf_file/rules_pdf_url before
    // it will submit anything (regardless of status) — this is a stricter
    // runtime guard than the Save-button's isFormValid check, which does NOT
    // require it. Without this upload the dialog silently fails to close.
    // A minimal in-memory PDF buffer is enough — the client only checks
    // file.type === "application/pdf"; Supabase Storage doesn't validate
    // PDF structure on upload.
    const rulesPdfInput = dialog
      .locator('label', { hasText: 'Pravidla soutěže' })
      .locator('..')
      .locator('input[type="file"]');
    await rulesPdfInput.setInputFiles({
      name: 'final-test-rules.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
    });

    // ── Step 4: Grafika — nahrát hlavní obrázek (vyžadováno pro save) ────────
    await dialog.getByRole('tab', { name: /Grafika/i }).click();
    const graphicsPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await graphicsPanel.locator('input[type="file"]').first().setInputFiles(MAIN_IMAGE_PATH);
    await expect(graphicsPanel.getByText(/Vybrán soubor:/i)).toBeVisible({ timeout: 5_000 });

    // ── Step 5: Bonusy – věcné — fyzická výhra na pozici 4 ────────────────────
    await dialog.getByRole('tab', { name: 'Bonusy – věcné' }).click();
    const physicalPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await inputByLabel(physicalPanel, 'Popis výhry').fill('Testovací bonusová výhra');
    await inputByLabel(physicalPanel, 'Pozice tiketu').fill('4');
    await physicalPanel.getByRole('button', { name: /Přidat věcnou výhru/i }).click();
    await expect(physicalPanel.getByText('Testovací bonusová výhra')).toBeVisible({ timeout: 5_000 });

    // ── Step 6: Bonusy – MioCoins — 250 MioCoinů, generátor (pozice 5, viz nahoře) ──
    await dialog.getByRole('tab', { name: 'Bonusy – MioCoins' }).click();
    const coinsPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await inputByLabel(coinsPanel, 'Celkový počet MioCoinů ve hře').fill('250');
    await inputByLabel(coinsPanel, 'Hodnota jednoho bonusu (po kolika)').fill('250');
    // Rozmístění zůstává na výchozí hodnotě "Rovnoměrně".
    await coinsPanel.getByRole('button', { name: /Vygenerovat MioCoiny/i }).click();
    // Regex is scoped to the full summary sentence (not bare /250/) because the
    // "Celkem: 250 MC (1 pozic)" badge elsewhere in this panel also contains
    // "250" — a bare match caused a Playwright strict-mode violation (2 elements).
    await expect(coinsPanel.getByText(/Vygenerováno 1 pozic s celkovou hodnotou\s*250/)).toBeVisible({ timeout: 5_000 });

    // ── Step 7: Uložit ─────────────────────────────────────────────────────────
    await dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click();
    const saveBtn = dialog.getByRole('button', { name: /Vytvořit soutěž/i }).last();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await page.screenshot({ path: 'test-results/999-before-save.png', fullPage: true });
    await saveBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 20_000 });

    // CREATE mode shows a second, separate confirmation AlertDialog
    // ("Soutěž byla vytvořena" / OK — showCreatedDialog in
    // AdminContestManagement.tsx) after the create dialog itself closes.
    // It sits on top of the admin list and must be dismissed, otherwise the
    // next click on an underlying tab button hangs until the test timeout.
    const createdConfirmDialog = page.getByRole('alertdialog');
    await expect(createdConfirmDialog).toBeVisible({ timeout: 10_000 });
    await createdConfirmDialog.getByRole('button', { name: 'OK' }).click();
    await expect(createdConfirmDialog).not.toBeVisible({ timeout: 10_000 });

    // ── Step 8: Zjistit contest ID (read-only service-role SELECT podle titulku) ──
    const admin = makeServiceClient();
    const { data: createdRow, error: createdErr } = await (admin as any)
      .from('contests')
      .select('id, title, ticket_count, ticket_price, status, main_prize')
      .eq('title', CONTEST_TITLE)
      .single();
    expect(createdErr, 'Čtení nově vytvořené soutěže nesmí selhat').toBeNull();
    expect(createdRow?.id).toBeTruthy();
    ctx.contestId = createdRow.id as string;

    console.log(`[999] Contest ID: ${ctx.contestId}`);
    console.log(`[999] Admin detail URL: ${page.url().replace(/\/admin.*/, '')}/admin?tab=management`);

    expect(createdRow.ticket_count).toBe(12);
    expect(createdRow.ticket_price).toBe(1);
    expect(createdRow.main_prize).toBe('Testovací hlavní výhra');

    // ── Step 9: Reload/reopen — ověřit persistenci přes UI ────────────────────
    const dialog2 = await openContestEditDialog(page);
    await expect(inputByLabel(dialog2, 'Název soutěže')).toHaveValue(CONTEST_TITLE);
    await expect(inputByLabel(dialog2, 'Počet tiketů')).toHaveValue('12');
    await expect(inputByLabel(dialog2, 'Cena tiketu (MioCoins)')).toHaveValue('1');

    await dialog2.getByRole('tab', { name: 'Bonusy – věcné' }).click();
    const physicalPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    await expect(physicalPanel2.getByText('Testovací bonusová výhra')).toBeVisible({ timeout: 8_000 });
    await expect(physicalPanel2.getByText(/Pozice #4/)).toBeVisible({ timeout: 5_000 });

    await dialog2.getByRole('tab', { name: 'Bonusy – MioCoins' }).click();
    const coinsPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    // Scoped to the "Celkem: … MC (N pozic)" badge specifically — after reopen
    // this panel also renders "Vygenerováno 1 pozic s celkovou hodnotou 250
    // MioCoinů." elsewhere, and a bare /1 pozic/ or /250/ regex matches both
    // (Playwright strict-mode violation).
    await expect(coinsPanel2.getByText(/Celkem:\s*250\s*MC\s*\(1 pozic\)/)).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/999-after-reload.png', fullPage: true });

    // Read-only DB verify přes service_role — jediný způsob jak potvrdit
    // PŘESNOU MioCoin pozici (UI po reopenu zobrazuje jen počet+celkovou hodnotu).
    const { data: bonusRows, error: bonusErr } = await (admin as any)
      .from('bonus_prizes')
      .select('ticket_position, amount, description')
      .eq('contest_id', ctx.contestId);
    expect(bonusErr, 'Čtení bonus_prizes nesmí selhat').toBeNull();

    const physicalBonus = (bonusRows ?? []).find((r: any) => !r.amount || r.amount === 0);
    const mioCoinBonus = (bonusRows ?? []).find((r: any) => r.amount && r.amount > 0);

    expect(physicalBonus?.ticket_position, 'Fyzická výhra musí být na pozici 4').toBe(4);
    expect(mioCoinBonus?.ticket_position, 'MioCoin bonus musí být na pozici 5 (viz poznámka v hlavičce testu)').toBe(5);
    expect(mioCoinBonus?.amount, 'MioCoin bonus musí mít hodnotu 250').toBe(250);

    // ── Step 10: Editace POUZE popisu ─────────────────────────────────────────
    await dialog2.getByRole('tab', { name: /Základní údaje/i }).click();
    const basicPanel2 = dialog2.locator('[role="tabpanel"][data-state="active"]');
    const descriptionField = basicPanel2.locator('textarea').first();
    await descriptionField.fill('E2E dočasný popis — kontrola, že se nic jiného nepřepíše.');

    await dialog2.getByRole('tab', { name: /Vytvořit soutěž/i }).click();
    const saveBtn2 = dialog2.getByRole('button', { name: /Uložit změny|Vytvořit soutěž/i });
    await expect(saveBtn2).toBeEnabled({ timeout: 5_000 });
    await saveBtn2.click();
    await expect(dialog2).not.toBeVisible({ timeout: 20_000 });

    // ── Step 11: Reload podruhé — ověřit, že se NIC JINÉHO samo nezměnilo ─────
    const dialog3 = await openContestEditDialog(page);
    await expect(inputByLabel(dialog3, 'Počet tiketů')).toHaveValue('12');
    await expect(inputByLabel(dialog3, 'Cena tiketu (MioCoins)')).toHaveValue('1');

    const { data: afterRow, error: afterErr } = await (admin as any)
      .from('contests')
      .select('id, ticket_count, ticket_price, status, description')
      .eq('id', ctx.contestId)
      .single();
    expect(afterErr, 'Čtení soutěže po edit popisu nesmí selhat').toBeNull();

    // STOP-guard: pokud se cokoli z těchto hodnot samo přepsalo, test SELŽE
    // explicitně na tomto assertu — to je záměr (spec-152-style regrese).
    expect(afterRow.ticket_count, 'ticket_count se NESMÍ samo změnit po edit popisu').toBe(12);
    expect(afterRow.ticket_price, 'ticket_price se NESMÍ sama změnit po edit popisu').toBe(1);
    expect(afterRow.status, 'status se NESMÍ sám změnit po edit popisu').toBe(createdRow.status);
    expect(afterRow.description).toContain('kontrola, že se nic jiného nepřepíše');

    const { data: bonusRowsAfter, error: bonusAfterErr } = await (admin as any)
      .from('bonus_prizes')
      .select('ticket_position, amount')
      .eq('contest_id', ctx.contestId);
    expect(bonusAfterErr, 'Čtení bonus_prizes po edit popisu nesmí selhat').toBeNull();

    const physicalAfter = (bonusRowsAfter ?? []).find((r: any) => !r.amount || r.amount === 0);
    const mioCoinAfter = (bonusRowsAfter ?? []).find((r: any) => r.amount && r.amount > 0);
    expect(physicalAfter?.ticket_position, 'Fyzická výhra se NESMÍ přesunout z pozice 4').toBe(4);
    expect(mioCoinAfter?.ticket_position, 'MioCoin bonus se NESMÍ přesunout z pozice 5').toBe(5);
    expect(mioCoinAfter?.amount, 'MioCoin hodnota se NESMÍ změnit ze 250').toBe(250);

    await page.screenshot({ path: 'test-results/999-after-description-edit-reload.png', fullPage: true });

    // ── Step 12: Potvrdit, že nebyl vydán/prodán žádný tiket ─────────────────
    const { count: ticketCount, error: ticketCountErr } = await (admin as any)
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', ctx.contestId);
    expect(ticketCountErr, 'Čtení počtu tiketů nesmí selhat').toBeNull();
    expect(ticketCount, 'V této soutěži nesmí být zatím vydán žádný tiket').toBe(0);

    console.log(`[999] FINAL RESULT — Contest ID: ${ctx.contestId}`);
    console.log(`[999] title=${CONTEST_TITLE} ticket_count=12 ticket_price=1 status=${afterRow.status}`);
    console.log(`[999] physical bonus position=${physicalAfter?.ticket_position} miocoin bonus position=${mioCoinAfter?.ticket_position} amount=${mioCoinAfter?.amount}`);
    console.log(`[999] tickets issued so far: ${ticketCount}`);
    console.log('[999] POZNÁMKA: MioCoin bonus je na pozici 5 místo původně plánované pozice 7, protože současný UI generátor neumí ručně určit přesnou pozici (jen bulk formuli). Kód kvůli tomu nebyl měněn.');

    await dialog3.locator('[aria-label="Close"], button[data-dialog-close]').click({ timeout: 1000 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  });
});
