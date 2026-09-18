/**
 * ⚠️ DOČASNÝ SPEC — SMAZAT PO POUŽITÍ ⚠️
 *
 * One-shot cleanup: přesune dvě osiřelé testovací soutěže (vzniklé během
 * ladění tests/e2e/999-final-test-contest-setup-TEMP.spec.ts, viz historie
 * commitů na této větvi) do "Archiv test" (status draft) přes normální
 * staging admin UI. Žádné SQL INSERT/UPDATE/DELETE proti `contests`.
 *
 * Proč přesun, ne smazání: obě soutěže mají řádky v `partner_offer_contests`
 * (každá nová soutěž se automaticky navazuje na aktivní partner nabídky), což
 * v admin UI natvrdo blokuje tlačítko "Smazat" ("Nelze smazat – je navázaná
 * na nabídky. Přesuň ji do Archivu test.") — FK `partner_offer_contests_
 * contest_id_fkey` je NO ACTION (bez CASCADE), takže i po soft-detach
 * (`detached_at`) by přímé SQL DELETE na `contests` stejně selhalo. Přesun
 * do "Archiv test" je jediná cesta, kterou normální UI pro tyto soutěže
 * nabízí — přesně to, co bylo požadováno.
 *
 * Finální testovací soutěž (6ff5a9e1-99ba-499c-8ce9-ee44338288dc) se
 * NEDOTÝKÁ.
 *
 * Spouští se přes:
 *   gh workflow run playwright-staging.yml --ref fix/ticket-result-modal-unify \
 *     -f only_spec=tests/e2e/999-final-test-contest-setup-TEMP.spec.ts
 *
 * Přihlášení: existující staging E2E superadmin účet
 *   (STAGING_E2E_SUPERADMIN_EMAIL / STAGING_E2E_SUPERADMIN_PASSWORD).
 *   Heslo se nikde nevypisuje/neloguje.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SERVICE_ROLE && !!SUPERADMIN_EMAIL && !!SUPERADMIN_PASSWORD;

const ORPHAN_IDS = [
  'ceb67924-f5e3-4178-8180-9336a9bbbb2f',
  'd1efce6f-b6e9-417f-978c-20c7699261c5',
] as const;

const KEEP_CONTEST_ID = '6ff5a9e1-99ba-499c-8ce9-ee44338288dc';

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe('999 TEMP CLEANUP — move orphan test contests to Archiv test via admin UI', () => {
  test('moves the two orphan contests to draft; leaves the final contest untouched', async ({ page }) => {
    test.setTimeout(120_000);

    if (!isStaging) {
      test.skip(true, 'Staging secrets not available');
    }

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });

    await loginViaUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await page.goto('/admin?tab=management');
    await expect(page.getByRole('button', { name: /Aktivní soutěže/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Aktivní soutěže/i }).click();
    await page.waitForTimeout(500);

    // Select both orphan rows via their row checkbox (available for status
    // "pending"/"paused" — both orphans are "pending"), then use the bulk
    // action bar's "Přesunout do Archivu test" button — the same
    // admin_manage_contest(p_operation:'update', p_status:'draft') RPC path
    // the UI itself uses for a single-row status change.
    for (const id of ORPHAN_IDS) {
      const row = page.locator('tr', { hasText: id });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.locator('input[type="checkbox"]').check();
    }

    const moveBtn = page.getByRole('button', { name: /Přesunout do Archivu test/i });
    await expect(moveBtn).toBeVisible({ timeout: 5_000 });
    await expect(moveBtn).toBeEnabled({ timeout: 5_000 });
    await moveBtn.click();

    // Success toast + the admin list auto-switches to "Archiv test" tab.
    await expect(page.getByText('Přesunuto do Archivu test')).toBeVisible({ timeout: 15_000 });

    // Read-only verification via service role — confirms the real DB state,
    // not just a UI toast. No writes happen here.
    const admin = makeServiceClient();
    const { data: orphanRows, error: orphanErr } = await (admin as any)
      .from('contests')
      .select('id, status')
      .in('id', ORPHAN_IDS);
    expect(orphanErr, 'Čtení osiřelých soutěží nesmí selhat').toBeNull();
    for (const id of ORPHAN_IDS) {
      const row = (orphanRows ?? []).find((r: any) => r.id === id);
      expect(row?.status, `${id} musí být přesunuta do "draft" (Archiv test)`).toBe('draft');
    }

    // The final contest must remain completely untouched: still "pending",
    // still zero tickets sold.
    const { data: keepRow, error: keepErr } = await (admin as any)
      .from('contests')
      .select('id, status, ticket_count, ticket_price')
      .eq('id', KEEP_CONTEST_ID)
      .single();
    expect(keepErr, 'Čtení finální soutěže nesmí selhat').toBeNull();
    expect(keepRow?.status, 'Finální soutěž musí zůstat "pending"').toBe('pending');
    expect(keepRow?.ticket_count).toBe(12);
    expect(keepRow?.ticket_price).toBe(1);

    const { count: keepTickets, error: keepTicketsErr } = await (admin as any)
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', KEEP_CONTEST_ID);
    expect(keepTicketsErr, 'Čtení tiketů finální soutěže nesmí selhat').toBeNull();
    expect(keepTickets, 'Finální soutěž musí mít stále 0 prodaných tiketů').toBe(0);

    console.log('[999-cleanup] Orphans moved to draft:', ORPHAN_IDS.join(', '));
    console.log(`[999-cleanup] Final contest untouched: ${KEEP_CONTEST_ID}, status=pending, tickets=0`);
  });
});
