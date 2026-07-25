/**
 * Spec 100 — Garantovaný nákupní benefit: zákaznický nákup na detailu soutěže
 *
 * Staging-only, idempotentní. Ověřuje, že nabídka benefitu je vidět pouze při
 * zapnutém pilotu a že jeden nákup vytvoří benefit i tiket zdarma.
 *
 * ── Stabilní fixture ──────────────────────────────────────────────────────
 * Partner, benefit (voucher), schválená verze, cenové pravidlo, soutěž
 * i distribuční order mají PEVNÁ UUID (FIXTURE.*) a stabilní e-mail zákazníka.
 * Běh je nejdřív dohledá; vytvoří je jen tehdy, když ještě neexistují. Opakované
 * běhy tedy NEVYTVÁŘEJÍ nové partnery, soutěže, vouchery, verze ani distribuční
 * objednávky. Schválené verze/vouchery a `voucher_issuances` jsou podle Phase 1
 * guardů neměnné a záměrně se nikdy nemažou.
 *
 * ── Co se resetuje před každým během ──────────────────────────────────────
 *   - soutěž zpět na `active`
 *   - doplnění volných `voucher_codes` (spotřebované zůstávají `issued`)
 *   - zůstatek peněženky testovacího zákazníka na START_BALANCE
 *   - smazání jeho `contest_bundle_purchases` a `wallet_transactions`
 *   - feature flag + allowlist se po běhu VŽDY vrátí na původní hodnoty
 *
 * Protože je zákazník stabilní, jsou počty tvrzeny přírůstkově (delta), ne
 * absolutně — opakované vydání téhož benefitu je záměrně neúčtovatelné.
 *
 * Testy:
 *   100a) při vypnutém feature flagu se nabídka nezobrazí
 *   100b) při pilotním nastavení se nabídka zobrazí (název, partner, cena)
 *   100c) jeden nákup vytvoří benefit i tiket, zůstatek klesne přesně o cenu
 *         benefitu a NEvznikne žádná ticket_purchase transakce
 *   100d) dvojklik nevytvoří druhý nákup
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

/** Pevná identita fixture — nikdy negenerovat náhodně. */
const FIXTURE = {
  partnerId:   'f0000100-0000-4000-8000-000000000001',
  voucherId:   'f0000100-0000-4000-8000-000000000002',
  versionId:   'f0000100-0000-4000-8000-000000000003',
  priceRuleId: 'f0000100-0000-4000-8000-000000000004',
  contestId:   'f0000100-0000-4000-8000-000000000005',
  orderId:     'f0000100-0000-4000-8000-000000000006',
} as const;

const CUSTOMER_EMAIL = 'spec100-fixture@onemil.cz';
const PASSWORD       = 'Spec100!Fixture9';
const PARTNER_NAME   = 'E2E Spec100 Fixture Partner';
const BENEFIT_NAME   = 'E2E Spec100 Fixture Benefit';
const CONTEST_NAME   = 'E2E Spec100 Fixture Contest';

const BENEFIT_PRICE = 20;      // MioCoiny, které zákazník platí za benefit
const TICKET_PRICE  = 10;      // cena klasického tiketu — nesmí se strhnout
const START_BALANCE = 500;
const MIN_FREE_CODES = 5;      // doplní se před každým během
// Vysoké stropy, aby fixture nikdy nedošla kapacita (order i soutěž jsou po
// schválení neměnné, takže se to musí nastavit hned při vzniku).
const ORDER_QUANTITY = 1_000_000;
const TICKET_COUNT   = 1_000_000;

const FLAG_KEY      = 'guaranteed_benefit_purchase_enabled';
const ALLOWLIST_KEY = 'guaranteed_benefit_purchase_contest_allowlist';

const ctx: {
  customerAuthId?: string;
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

/** Stabilní zákazník: dohledat podle e-mailu, jinak vytvořit. Heslo se sjednotí. */
async function ensureCustomer(admin: SupabaseClient): Promise<string> {
  const { data: existing } = await (admin as any)
    .from('users').select('id').eq('email', CUSTOMER_EMAIL).maybeSingle();

  if (existing?.id) {
    // Sjednotit heslo, aby přihlášení fungovalo i po případné ruční změně.
    await admin.auth.admin.updateUserById(existing.id as string, { password: PASSWORD });
    return existing.id as string;
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: CUSTOMER_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`createUser(customer): ${error?.message}`);

  const { error: userErr } = await (admin as any)
    .from('users').upsert({ id: created.user.id, email: CUSTOMER_EMAIL, role: 'user' }, { onConflict: 'id' });
  if (userErr) throw new Error(`public.users upsert: ${userErr.message}`);

  return created.user.id;
}

/** Vytvoří chybějící části fixture. Existující se nikdy nepřepisují. */
async function ensureFixture(admin: SupabaseClient, actorId: string): Promise<void> {
  const exists = async (table: string, id: string): Promise<boolean> => {
    const { data } = await (admin as any).from(table).select('id').eq('id', id).maybeSingle();
    return !!data?.id;
  };
  const insert = async (table: string, row: Record<string, unknown>): Promise<void> => {
    const { error } = await (admin as any).from(table).insert(row);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  };

  if (!(await exists('partners', FIXTURE.partnerId))) {
    await insert('partners', {
      id: FIXTURE.partnerId,
      name: PARTNER_NAME,
      company_name: PARTNER_NAME,
      logo_url: 'https://example.invalid/spec100.png',
      website_url: 'https://example.invalid/spec100',
      status: 'approved',
    });
  }

  if (!(await exists('vouchers', FIXTURE.voucherId))) {
    await insert('vouchers', {
      id: FIXTURE.voucherId,
      name: BENEFIT_NAME,
      image_url: 'https://example.invalid/spec100-benefit.png',
      is_public: false,
      partner_id: FIXTURE.partnerId,
      distribution_mode: 'guaranteed_purchase_benefit',
      workflow_status: 'approved',
      // vouchers_approval_shape_check: approved potřebuje čas i aktéra.
      approved_at: new Date().toISOString(),
      approved_by: actorId,
    });
  }

  if (!(await exists('voucher_versions', FIXTURE.versionId))) {
    await insert('voucher_versions', {
      id: FIXTURE.versionId,
      voucher_id: FIXTURE.voucherId,
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
      requested_code_count: ORDER_QUANTITY,
      approved_code_count: ORDER_QUANTITY,
      customer_price_miocoins: BENEFIT_PRICE,
      approved_at: new Date().toISOString(),
      approved_by: actorId,
    });
  }

  if (!(await exists('voucher_distribution_price_rules', FIXTURE.priceRuleId))) {
    await insert('voucher_distribution_price_rules', {
      id: FIXTURE.priceRuleId,
      scope: 'partner',
      partner_id: FIXTURE.partnerId,
      unit_price_ex_vat: 0,
      vat_rate_percent: 21,
      currency: 'CZK',
    });
  }

  if (!(await exists('contests', FIXTURE.contestId))) {
    await insert('contests', {
      id: FIXTURE.contestId,
      title: CONTEST_NAME,
      name: CONTEST_NAME,
      main_prize: 'E2E hlavní výhra',
      status: 'active',
      ticket_price: TICKET_PRICE,
      ticket_count: TICKET_COUNT,
      next_ticket_number: 1,
    });
  }

  if (!(await exists('voucher_distribution_orders', FIXTURE.orderId))) {
    await insert('voucher_distribution_orders', {
      id: FIXTURE.orderId,
      partner_id: FIXTURE.partnerId,
      voucher_id: FIXTURE.voucherId,
      voucher_version_id: FIXTURE.versionId,
      contest_id: FIXTURE.contestId,
      requested_quantity: ORDER_QUANTITY,
      status: 'approved',
      price_rule_id: FIXTURE.priceRuleId,
      unit_price_ex_vat_snapshot: 0,
      vat_rate_percent_snapshot: 21,
      currency_snapshot: 'CZK',
      decided_at: new Date().toISOString(),
      decided_by: actorId,
    });
  }
}

/** Obnoví jen bezpečně měnitelný stav. Nikdy nemaže immutable záznamy. */
async function resetMutableState(admin: SupabaseClient, customerId: string): Promise<void> {
  // Soutěž zpět na active (kdyby ji cokoli uzavřelo).
  await (admin as any)
    .from('contests').update({ status: 'active' }).eq('id', FIXTURE.contestId).neq('status', 'active');

  // Doplnit volné kódy — spotřebované zůstávají `issued` (neměnné).
  const { count } = await (admin as any)
    .from('voucher_codes')
    .select('id', { count: 'exact', head: true })
    .eq('distribution_order_id', FIXTURE.orderId)
    .eq('status', 'available');
  const missing = MIN_FREE_CODES - (count ?? 0);
  if (missing > 0) {
    const stamp = Date.now();
    const rows = Array.from({ length: missing }, (_, i) => ({
      voucher_id: FIXTURE.voucherId,
      code: `SPEC100-${stamp}-${i}`,
      status: 'available',
      distribution_order_id: FIXTURE.orderId,
    }));
    const { error } = await (admin as any).from('voucher_codes').insert(rows);
    if (error) throw new Error(`voucher_codes top-up: ${error.message}`);
  }

  // Peněženka na známý zůstatek.
  const { error: wErr } = await (admin as any)
    .from('wallets').upsert({ user_id: customerId, balance_coins: START_BALANCE }, { onConflict: 'user_id' });
  if (wErr) throw new Error(`wallets upsert: ${wErr.message}`);

  // Bundle řádky a transakce zákazníka (nejsou immutable) — čistý výchozí stav.
  await (admin as any).from('contest_bundle_purchases').delete().eq('user_id', customerId);
  await (admin as any).from('wallet_transactions').delete().eq('user_id', customerId);
}

async function countIssuances(admin: SupabaseClient, customerId: string): Promise<number> {
  const { count } = await (admin as any)
    .from('voucher_issuances').select('id', { count: 'exact', head: true }).eq('user_id', customerId);
  return count ?? 0;
}

async function countTickets(admin: SupabaseClient, customerId: string): Promise<number> {
  const { count } = await (admin as any)
    .from('tickets').select('id', { count: 'exact', head: true })
    .eq('user_id', customerId).eq('contest_id', FIXTURE.contestId);
  return count ?? 0;
}

async function countBundles(admin: SupabaseClient, customerId: string): Promise<number> {
  const { count } = await (admin as any)
    .from('contest_bundle_purchases').select('id', { count: 'exact', head: true }).eq('user_id', customerId);
  return count ?? 0;
}

async function primeConsent(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
}

test.describe.serial('Spec 100 — garantovaný nákupní benefit (UI)', () => {
  test.skip(!isStaging, 'Staging-only spec (requires staging Supabase + service role key)');
  // Login + navigace na detail soutěže se nevejde do výchozích 30 s.
  test.describe.configure({ timeout: 90_000 });

  test.beforeAll(async () => {
    const admin = makeAdmin();

    const { data: settingsRows } = await (admin as any)
      .from('settings').select('key,value').in('key', [FLAG_KEY, ALLOWLIST_KEY]);
    for (const row of (settingsRows ?? []) as { key: string; value: string }[]) {
      if (row.key === FLAG_KEY) ctx.prevFlag = row.value;
      if (row.key === ALLOWLIST_KEY) ctx.prevAllowlist = row.value;
    }

    ctx.customerAuthId = await ensureCustomer(admin);
    await ensureFixture(admin, ctx.customerAuthId);
    await resetMutableState(admin, ctx.customerAuthId);
  });

  test.afterAll(async () => {
    const admin = makeAdmin();
    try {
      await (admin as any).from('settings').update({ value: ctx.prevFlag ?? 'false' }).eq('key', FLAG_KEY);
      await (admin as any).from('settings').update({ value: ctx.prevAllowlist ?? '[]' }).eq('key', ALLOWLIST_KEY);
    } catch { /* flag se musí vrátit i při selhání testu */ }
  });

  test('100a: při vypnutém flagu se nabídka benefitu nezobrazí', async ({ page }) => {
    await setFlag(makeAdmin(), false, '[]');

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${FIXTURE.contestId}`);

    // Detail soutěže má realtime + polling, takže `networkidle` nikdy nenastane.
    // Počkáme na klasické tlačítko — tím je zároveň ověřeno, že nákup tiketu
    // zůstal beze změny, a teprve pak tvrdíme, že nabídka benefitu chybí.
    await expect(
      page.getByRole('button', { name: `Uplatnit ${TICKET_PRICE} MioCoin` }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('guaranteed-benefit-offer')).toHaveCount(0);
  });

  test('100b: při pilotním nastavení se nabídka zobrazí', async ({ page }) => {
    await setFlag(makeAdmin(), true, JSON.stringify([FIXTURE.contestId]));

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${FIXTURE.contestId}`);

    const offer = page.getByTestId('guaranteed-benefit-offer');
    await expect(offer).toBeVisible({ timeout: 30_000 });
    await expect(offer).toContainText(BENEFIT_NAME);
    await expect(offer).toContainText(PARTNER_NAME);
    await expect(offer).toContainText(String(BENEFIT_PRICE));
    await expect(offer).toContainText('zdarma');
  });

  test('100c: nákup vytvoří benefit i tiket, strhne jen cenu benefitu', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));

    const customerId = ctx.customerAuthId!;
    // Fixture je znovupoužitelná, proto se tvrdí přírůstky, ne absolutní počty.
    const issuancesBefore = await countIssuances(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${FIXTURE.contestId}`);

    await expect(page.getByTestId('guaranteed-benefit-offer')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('guaranteed-benefit-buy').click();

    // Nejdřív se ukáže získaný benefit, teprve po zavření výsledek tiketu.
    const reveal = page.getByTestId('guaranteed-benefit-reveal');
    await expect(reveal).toBeVisible({ timeout: 30_000 });
    await expect(reveal).toContainText(BENEFIT_NAME);

    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore + 1);
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);

    // Nejnovější vydání má navázaný tiket a platné účtovací zdůvodnění.
    // (Opakované vydání téhož benefitu témuž zákazníkovi je záměrně neúčtované.)
    const { data: latest } = await (admin as any)
      .from('voucher_issuances')
      .select('billable,billing_reason,ticket_id,issued_at')
      .eq('user_id', customerId).order('issued_at', { ascending: false }).limit(1);
    expect(latest?.[0]?.ticket_id).toBeTruthy();
    expect(['first_customer_issuance', 'repeat_customer_issuance'])
      .toContain(latest?.[0]?.billing_reason);
    expect(latest?.[0]?.billable).toBe(latest?.[0]?.billing_reason === 'first_customer_issuance');

    // Bundle řádky byly resetované, takže tento nákup je jediný.
    const { data: bundles } = await (admin as any)
      .from('contest_bundle_purchases').select('id,status,charged_miocoins').eq('user_id', customerId);
    expect(bundles?.length).toBe(1);
    expect(bundles?.[0].status).toBe('completed');
    expect(Number(bundles?.[0].charged_miocoins)).toBe(BENEFIT_PRICE);

    // Zůstatek klesl přesně o cenu benefitu (ne o cenu tiketu).
    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - BENEFIT_PRICE);

    // Účetně jde o benefit_purchase, nikdy ticket_purchase.
    const { data: txns } = await (admin as any)
      .from('wallet_transactions').select('type').eq('user_id', customerId);
    const types = (txns ?? []).map((t: { type: string }) => t.type);
    expect(types).toContain('benefit_purchase');
    expect(types).not.toContain('ticket_purchase');
  });

  test('100d: dvojklik nevytvoří druhý nákup', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));

    const customerId = ctx.customerAuthId!;
    const bundlesBefore = await countBundles(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto(`/contest/${FIXTURE.contestId}`);
    await expect(page.getByTestId('guaranteed-benefit-offer')).toBeVisible({ timeout: 30_000 });

    // Dvě kliknutí synchronně za sebou, dřív než dorazí odpověď z RPC.
    await page.getByTestId('guaranteed-benefit-buy').evaluate((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await expect(page.getByTestId('guaranteed-benefit-reveal')).toBeVisible({ timeout: 30_000 });

    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
  });
});
