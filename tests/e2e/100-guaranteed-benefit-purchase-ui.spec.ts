/**
 * Spec 100 — Garantovaný nákupní benefit: zákaznický nákup na detailu soutěže
 *
 * Staging-only, self-contained. Ověřuje, že nabídka benefitu je vidět pouze při
 * zapnutém pilotu a že jeden nákup vytvoří benefit i tiket zdarma.
 *
 * Setup (service role): throwaway partner + zákazník s peněženkou, schválený
 * garantovaný benefit (voucher + voucher_version s customer_price_miocoins),
 * partnerská distribuční cena 0 Kč, schválený distribuční order pro testovací
 * aktivní soutěž a volné kódy.
 *
 * Testy:
 *   100a) při vypnutém feature flagu se nabídka nezobrazí
 *   100b) při pilotním nastavení se nabídka zobrazí (název, partner, cena)
 *   100c) jeden nákup vytvoří benefit i tiket, zůstatek klesne přesně o cenu
 *         benefitu a NEvznikne žádná ticket_purchase transakce
 *   100d) dvojklik nevytvoří druhý nákup
 *
 * Serial: testy sdílejí globální feature flag v `settings`.
 *
 * Cleanup: flag i allowlist se VŽDY vrátí na původní hodnoty. Data se uklidí
 * best-effort — `voucher_issuances`, schválené `voucher_versions` a použité
 * `voucher_distribution_orders` jsou záměrně neměnné (Phase 1 guard triggery),
 * takže tyto auditní řádky na stagingu zůstávají.
 *
 * Vyžaduje env vars (přítomné v playwright-staging.yml):
 *   VITE_SUPABASE_URL               — staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!ANON_KEY && !!SERVICE_ROLE;

const RUN_ID         = Date.now();
const CUSTOMER_EMAIL = `spec100-customer-${RUN_ID}@onemil.cz`;
const PASSWORD       = `Spec100!${RUN_ID}x`;

const BENEFIT_PRICE = 20;   // MioCoiny, které zákazník platí za benefit
const TICKET_PRICE  = 10;   // cena klasického tiketu — nesmí se strhnout
const START_BALANCE = 500;
const BENEFIT_NAME  = `E2E Spec100 Benefit ${RUN_ID}`;
const PARTNER_NAME  = `E2E Spec100 Partner ${RUN_ID}`;

const FLAG_KEY      = 'guaranteed_benefit_purchase_enabled';
const ALLOWLIST_KEY = 'guaranteed_benefit_purchase_contest_allowlist';

const ctx: {
  customerAuthId?: string;
  partnerId?: string;
  voucherId?: string;
  versionId?: string;
  priceRuleId?: string;
  orderId?: string;
  contestId?: string;
  prevFlag?: string;
  prevAllowlist?: string;
} = {};

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function setFlag(admin: SupabaseClient, enabled: boolean, allowlist: string): Promise<void> {
  await (admin as any).from('settings').update({ value: enabled ? 'true' : 'false' }).eq('key', FLAG_KEY);
  await (admin as any).from('settings').update({ value: allowlist }).eq('key', ALLOWLIST_KEY);
}

async function setupData(): Promise<void> {
  const admin = makeAdmin();

  // Zapamatovat původní hodnoty flagu, aby je cleanup vrátil beze změny.
  const { data: settingsRows } = await (admin as any)
    .from('settings').select('key,value').in('key', [FLAG_KEY, ALLOWLIST_KEY]);
  for (const row of (settingsRows ?? []) as { key: string; value: string }[]) {
    if (row.key === FLAG_KEY) ctx.prevFlag = row.value;
    if (row.key === ALLOWLIST_KEY) ctx.prevAllowlist = row.value;
  }

  // Zákazník + peněženka
  const { data: cu, error: cuErr } = await admin.auth.admin.createUser({
    email: CUSTOMER_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (cuErr) throw new Error(`createUser(customer): ${cuErr.message}`);
  ctx.customerAuthId = cu.user.id;

  const { error: userErr } = await (admin as any)
    .from('users').upsert({ id: ctx.customerAuthId, email: CUSTOMER_EMAIL, role: 'user' }, { onConflict: 'id' });
  if (userErr) throw new Error(`public.users upsert: ${userErr.message}`);

  const { error: wErr } = await (admin as any)
    .from('wallets').upsert({ user_id: ctx.customerAuthId, balance_coins: START_BALANCE }, { onConflict: 'user_id' });
  if (wErr) throw new Error(`wallets upsert: ${wErr.message}`);

  // Partner
  const { data: p, error: pErr } = await (admin as any)
    .from('partners')
    .insert({
      name: PARTNER_NAME,
      company_name: PARTNER_NAME,
      logo_url: 'https://example.invalid/spec100.png',
      website_url: 'https://example.invalid/spec100',
      status: 'approved',
    })
    .select('id').single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);
  ctx.partnerId = p.id as string;

  // Schválený garantovaný benefit
  const { data: v, error: vErr } = await (admin as any)
    .from('vouchers')
    .insert({
      name: BENEFIT_NAME,
      image_url: 'https://example.invalid/spec100-benefit.png',
      is_public: false,
      partner_id: ctx.partnerId,
      distribution_mode: 'guaranteed_purchase_benefit',
      workflow_status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .select('id').single();
  if (vErr) throw new Error(`vouchers insert: ${vErr.message}`);
  ctx.voucherId = v.id as string;

  const { data: vv, error: vvErr } = await (admin as any)
    .from('voucher_versions')
    .insert({
      voucher_id: ctx.voucherId,
      version_number: 1,
      status: 'approved',
      name: BENEFIT_NAME,
      short_description: 'E2E benefit',
      terms_text: 'E2E podmínky',
      how_to_use_text: 'E2E použití',
      benefit_kind: 'percentage',
      benefit_value: 25,
      currency: 'CZK',
      code_source: 'provided_by_partner',
      requested_code_count: 10,
      approved_code_count: 10,
      customer_price_miocoins: BENEFIT_PRICE,
      approved_at: new Date().toISOString(),
    })
    .select('id').single();
  if (vvErr) throw new Error(`voucher_versions insert: ${vvErr.message}`);
  ctx.versionId = vv.id as string;

  // Partnerská distribuční cena 0 Kč
  const { data: pr, error: prErr } = await (admin as any)
    .from('voucher_distribution_price_rules')
    .insert({ scope: 'partner', partner_id: ctx.partnerId, unit_price_ex_vat: 0, vat_rate_percent: 21, currency: 'CZK' })
    .select('id').single();
  if (prErr) throw new Error(`price rule insert: ${prErr.message}`);
  ctx.priceRuleId = pr.id as string;

  // Aktivní testovací soutěž
  const { data: c, error: cErr } = await (admin as any)
    .from('contests')
    .insert({
      title: `E2E Spec100 Contest ${RUN_ID}`,
      name: `E2E Spec100 Contest ${RUN_ID}`,
      main_prize: 'E2E hlavní výhra',
      status: 'active',
      ticket_price: TICKET_PRICE,
      ticket_count: 100,
      next_ticket_number: 1,
    })
    .select('id').single();
  if (cErr) throw new Error(`contests insert: ${cErr.message}`);
  ctx.contestId = c.id as string;

  // Schválený distribuční order + volné kódy
  const { data: o, error: oErr } = await (admin as any)
    .from('voucher_distribution_orders')
    .insert({
      partner_id: ctx.partnerId,
      voucher_id: ctx.voucherId,
      voucher_version_id: ctx.versionId,
      contest_id: ctx.contestId,
      requested_quantity: 10,
      status: 'approved',
      price_rule_id: ctx.priceRuleId,
      unit_price_ex_vat_snapshot: 0,
      vat_rate_percent_snapshot: 21,
      currency_snapshot: 'CZK',
      decided_at: new Date().toISOString(),
      decided_by: ctx.customerAuthId,
    })
    .select('id').single();
  if (oErr) throw new Error(`distribution order insert: ${oErr.message}`);
  ctx.orderId = o.id as string;

  const codes = Array.from({ length: 5 }, (_, i) => ({
    voucher_id: ctx.voucherId,
    code: `SPEC100-${RUN_ID}-${i}`,
    status: 'available',
    distribution_order_id: ctx.orderId,
  }));
  const { error: codeErr } = await (admin as any).from('voucher_codes').insert(codes);
  if (codeErr) throw new Error(`voucher_codes insert: ${codeErr.message}`);
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();
  // Flag se vrací vždy jako první, i kdyby úklid dat selhal.
  try {
    await (admin as any).from('settings').update({ value: ctx.prevFlag ?? 'false' }).eq('key', FLAG_KEY);
    await (admin as any).from('settings').update({ value: ctx.prevAllowlist ?? '[]' }).eq('key', ALLOWLIST_KEY);
  } catch { /* ignore */ }

  // Best-effort. voucher_issuances / schválené verze / použité ordery jsou
  // neměnné (Phase 1 guard) — ty na stagingu záměrně zůstávají.
  try {
    if (ctx.customerAuthId) {
      await (admin as any).from('contest_bundle_purchases').delete().eq('user_id', ctx.customerAuthId);
      await (admin as any).from('wallet_transactions').delete().eq('user_id', ctx.customerAuthId);
    }
    if (ctx.orderId) {
      await (admin as any).from('voucher_codes').delete().eq('distribution_order_id', ctx.orderId).eq('status', 'available');
    }
    if (ctx.customerAuthId) {
      await admin.auth.admin.deleteUser(ctx.customerAuthId);
    }
  } catch { /* ignore */ }
}

test.describe.serial('Spec 100 — garantovaný nákupní benefit (UI)', () => {
  test.skip(!isStaging, 'Staging-only spec (requires staging Supabase + service role key)');

  test.beforeAll(async () => { await setupData(); });
  test.afterAll(async () => { await cleanupData(); });

  test('100a: při vypnutém flagu se nabídka benefitu nezobrazí', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, false, '[]');

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    });
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${ctx.contestId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.getByTestId('guaranteed-benefit-offer')).toHaveCount(0);
    // Klasický nákup zůstává dostupný beze změny.
    await expect(page.getByRole('button', { name: `Uplatnit ${TICKET_PRICE} MioCoin` })).toBeVisible();
  });

  test('100b: při pilotním nastavení se nabídka zobrazí', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([ctx.contestId]));

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    });
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${ctx.contestId}`);

    const offer = page.getByTestId('guaranteed-benefit-offer');
    await expect(offer).toBeVisible({ timeout: 20_000 });
    await expect(offer).toContainText(BENEFIT_NAME);
    await expect(offer).toContainText(PARTNER_NAME);
    await expect(offer).toContainText(String(BENEFIT_PRICE));
    await expect(offer).toContainText('zdarma');
  });

  test('100c: nákup vytvoří benefit i tiket, strhne jen cenu benefitu', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([ctx.contestId]));

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    });
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${ctx.contestId}`);

    await expect(page.getByTestId('guaranteed-benefit-offer')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('guaranteed-benefit-buy').click();

    // Nejdřív se ukáže získaný benefit, teprve po zavření výsledek tiketu.
    await expect(page.getByTestId('guaranteed-benefit-reveal')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('guaranteed-benefit-reveal')).toContainText(BENEFIT_NAME);

    // DB kontrola
    const { data: issuances } = await (admin as any)
      .from('voucher_issuances').select('id,billable,billing_reason,ticket_id')
      .eq('user_id', ctx.customerAuthId);
    expect(issuances?.length).toBe(1);
    expect(issuances?.[0].billable).toBe(true);
    expect(issuances?.[0].ticket_id).toBeTruthy();

    const { data: bundles } = await (admin as any)
      .from('contest_bundle_purchases').select('id,status,charged_miocoins')
      .eq('user_id', ctx.customerAuthId);
    expect(bundles?.length).toBe(1);
    expect(bundles?.[0].status).toBe('completed');
    expect(Number(bundles?.[0].charged_miocoins)).toBe(BENEFIT_PRICE);

    const { data: tickets } = await (admin as any)
      .from('tickets').select('id').eq('user_id', ctx.customerAuthId).eq('contest_id', ctx.contestId);
    expect(tickets?.length).toBe(1);

    // Zůstatek klesl přesně o cenu benefitu (ne o cenu tiketu).
    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', ctx.customerAuthId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - BENEFIT_PRICE);

    // Účetně jde o benefit_purchase, nikdy ticket_purchase.
    const { data: txns } = await (admin as any)
      .from('wallet_transactions').select('type,amount').eq('user_id', ctx.customerAuthId);
    const types = (txns ?? []).map((t: { type: string }) => t.type);
    expect(types).toContain('benefit_purchase');
    expect(types).not.toContain('ticket_purchase');
  });

  test('100d: dvojklik nevytvoří druhý nákup', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([ctx.contestId]));

    const { data: before } = await (admin as any)
      .from('contest_bundle_purchases').select('id').eq('user_id', ctx.customerAuthId);
    const countBefore = before?.length ?? 0;

    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    });
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${ctx.contestId}`);
    await expect(page.getByTestId('guaranteed-benefit-offer')).toBeVisible({ timeout: 20_000 });

    // Dvě kliknutí synchronně za sebou, dřív než dorazí odpověď z RPC.
    await page.getByTestId('guaranteed-benefit-buy').evaluate((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await expect(page.getByTestId('guaranteed-benefit-reveal')).toBeVisible({ timeout: 20_000 });

    const { data: after } = await (admin as any)
      .from('contest_bundle_purchases').select('id').eq('user_id', ctx.customerAuthId);
    expect(after?.length ?? 0).toBe(countBefore + 1);
  });
});
