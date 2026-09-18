/**
 * ⚠️ DOČASNÝ SPEC — SMAZAT PO POUŽITÍ ⚠️
 *
 * Jednorázová aktivace finální testovací soutěže přes NORMÁLNÍ admin UI:
 * řádkový status Select v "Správa soutěží" → "Aktivní". Používá stejnou
 * cestu jako člověk v administraci (admin_manage_contest s p_operation
 * 'update' a explicitními NULL u ostatních parametrů), takže se nesmí
 * přepsat nic jiného než status.
 *
 * Žádný nákup, žádné SQL UPDATE proti `contests`.
 *
 * Spouští se přes:
 *   gh workflow run playwright-staging.yml --ref fix/ticket-result-modal-unify \
 *     -f only_spec=tests/e2e/999-activate-final-contest-TEMP.spec.ts
 *
 * Přihlášení: existující staging E2E superadmin účet
 *   (STAGING_E2E_SUPERADMIN_EMAIL / STAGING_E2E_SUPERADMIN_PASSWORD).
 *   Heslo se nikde nevypisuje ani neloguje.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const SUPERADMIN_EMAIL    = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SERVICE_ROLE && !!SUPERADMIN_EMAIL && !!SUPERADMIN_PASSWORD;

const CONTEST_ID = '6ff5a9e1-99ba-499c-8ce9-ee44338288dc';

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe('999 TEMP — activate FINAL TEST contest via normal admin UI', () => {
  test('switches the contest from pending to active and changes nothing else', async ({ page }) => {
    test.setTimeout(120_000);

    if (!isStaging) {
      test.skip(true, 'Staging secrets not available');
    }

    const admin = makeServiceClient();

    // ── Baseline before the UI action ────────────────────────────────────────
    const { data: before, error: beforeErr } = await (admin as any)
      .from('contests')
      .select('id, status, ticket_count, ticket_price, next_ticket_number')
      .eq('id', CONTEST_ID)
      .single();
    expect(beforeErr, 'Čtení soutěže před aktivací nesmí selhat').toBeNull();
    expect(before?.status, 'Soutěž musí před aktivací být pending').toBe('pending');

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });

    // ── Admin UI: Správa soutěží → řádek soutěže → status Select → "Aktivní" ──
    await loginViaUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await page.goto('/admin?tab=management');
    await expect(page.getByRole('button', { name: /Aktivní soutěže/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Aktivní soutěže/i }).click();
    await page.waitForTimeout(500);

    // Každý řádek tabulky vypisuje "ID: <uuid>", takže je to jednoznačný locator.
    const row = page.locator('tr', { hasText: CONTEST_ID });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Radix Select: trigger má role="combobox", položky se renderují do portálu
    // mimo řádek, proto se hledají na úrovni stránky přes role="option".
    await row.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Aktivní', exact: true }).click();

    // ── Ověření skutečného stavu v DB (ne jen UI) ────────────────────────────
    await expect
      .poll(async () => {
        const { data } = await (admin as any)
          .from('contests').select('status').eq('id', CONTEST_ID).single();
        return data?.status ?? null;
      }, { timeout: 20_000, message: 'Soutěž se musí přepnout na active' })
      .toBe('active');

    await page.screenshot({ path: 'test-results/999-after-activation.png', fullPage: true });

    // ── Nic jiného se nesmělo přepsat ────────────────────────────────────────
    const { data: after, error: afterErr } = await (admin as any)
      .from('contests')
      .select('id, status, ticket_count, ticket_price, next_ticket_number')
      .eq('id', CONTEST_ID)
      .single();
    expect(afterErr, 'Čtení soutěže po aktivaci nesmí selhat').toBeNull();

    expect(after.status).toBe('active');
    expect(after.ticket_count, 'ticket_count se NESMÍ změnit').toBe(before.ticket_count);
    expect(after.ticket_price, 'ticket_price se NESMÍ změnit').toBe(before.ticket_price);
    expect(after.next_ticket_number, 'next_ticket_number se NESMÍ posunout').toBe(before.next_ticket_number);

    const { data: bonuses, error: bonusErr } = await (admin as any)
      .from('bonus_prizes')
      .select('ticket_position, amount')
      .eq('contest_id', CONTEST_ID)
      .order('ticket_position');
    expect(bonusErr, 'Čtení bonus_prizes nesmí selhat').toBeNull();

    const physical = (bonuses ?? []).find((b: any) => !b.amount || Number(b.amount) === 0);
    const mioCoin  = (bonuses ?? []).find((b: any) => b.amount && Number(b.amount) > 0);
    expect(physical?.ticket_position, 'Fyzická bonusová výhra musí zůstat na pozici 4').toBe(4);
    expect(mioCoin?.ticket_position, 'MioCoin bonus musí zůstat na pozici 5').toBe(5);
    expect(Number(mioCoin?.amount), 'MioCoin bonus musí zůstat 250').toBe(250);

    const { count: ticketsSold, error: ticketsErr } = await (admin as any)
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', CONTEST_ID);
    expect(ticketsErr, 'Čtení tiketů nesmí selhat').toBeNull();
    expect(ticketsSold, 'Aktivace nesmí vydat žádný tiket').toBe(0);

    console.log(`[999-activate] contest=${CONTEST_ID} status=${after.status} ticket_count=${after.ticket_count} ticket_price=${after.ticket_price} tickets_sold=${ticketsSold}`);
    console.log(`[999-activate] bonuses: physical@${physical?.ticket_position}, miocoin@${mioCoin?.ticket_position}=${mioCoin?.amount}`);
  });
});
