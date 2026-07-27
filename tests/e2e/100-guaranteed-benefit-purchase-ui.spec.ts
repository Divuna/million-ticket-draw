/**
 * Spec 100 — Mystery kupon: zákaznický nákup na detailu soutěže
 *
 * Staging-only, idempotentní. Zákazník používá JEDINÉ existující tlačítko
 * „Uplatnit X MioCoinů". U zapojené soutěže za stejnou cenu (contests.ticket_price)
 * dostane náhodný kupon a tiket zdarma; u nezapojené běží beze změny klasický
 * buy_ticket_atomic. Před nákupem se o kuponu nesmí prozradit vůbec nic.
 *
 * ── Stabilní fixture ──────────────────────────────────────────────────────
 * Partner, kupon (voucher), schválená verze, cenové pravidlo, soutěž
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
 *   - smazání jeho `contest_bundle_purchases`
 *   - feature flag + allowlist se po běhu VŽDY vrátí na původní hodnoty
 *
 * Peněženkový ledger `wallet_transactions` je neměnný (BEFORE DELETE guard),
 * takže se NIKDY nemaže — účetní typy se tvrdí jen nad řádky, které vznikly
 * během daného testu.
 *
 * Protože je zákazník stabilní, jsou počty tvrzeny přírůstkově (delta), ne
 * absolutně — opakované vydání téhož kuponu je záměrně neúčtovatelné.
 *
 * Testy:
 *   100a) vypnutý pilot → klasický nákup tiketu beze změny (ticket_purchase)
 *   100b) zapnutý pilot → před nákupem není o kuponu vidět nic, cena zůstává
 *         contests.ticket_price
 *   100c) nákup strhne přesně ticket_price, vytvoří kupon i tiket zdarma,
 *         odhalí kód a NEvznikne žádná ticket_purchase transakce
 *   100d) dvojklik na detailu nevytvoří druhý nákup
 *   100d-games) dvojklik z karty v Games → jeden odečet, kupon i tiket
 *   100d-favorites) dvojklik z karty v Oblíbených → jeden odečet, kupon i tiket
 *   100d-classic) dvojklik z karty u nezapojené soutěže → jen jeden tiket
 *   100d-cold) dvojklik na detailu, než dorazí zůstatek → jen jeden nákup
 *   100d-cold-classic) totéž u nezapojené soutěže → jediný ticket_purchase
 *   100e) nákup posledního kódu — výsledek zůstane, „Pokračovat" ho zavře
 *   100f) výhra MioCoinů + kupon v jednom dialogu
 *   100g) věcná výhra + kupon v jednom dialogu
 *   100h) název, partner, kód kuponu + kopírování
 *   100i) jediné tlačítko „Pokračovat", žádný druhý modal
 *   100j) mobilní zobrazení bez vodorovného posouvání
 *   100k) panel dalšího výherního tiketu + skloňování
 *   100l) bez známé vzdálenosti se panel nezobrazí
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

// Cena mystery nákupu je vždy cena tiketu. Verze kuponu má schválně JINOU
// hodnotu customer_price_miocoins, aby bylo vidět, že se pro nákup nepoužívá.
const TICKET_PRICE          = 10;
const VERSION_LEGACY_PRICE  = 20;
const START_BALANCE  = 500;
const MIN_FREE_CODES = 5;      // doplní se před každým během
// Vysoké stropy, aby fixture nikdy nedošla kapacita (order i soutěž jsou po
// schválení neměnné, takže se to musí nastavit hned při vzniku).
const ORDER_QUANTITY = 1_000_000;
const TICKET_COUNT   = 1_000_000;

/** Text tlačítka na detailu soutěže — jediný vstup do obou toků. */
const BUY_BUTTON = `Uplatnit ${TICKET_PRICE} MioCoin`;

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
      customer_price_miocoins: VERSION_LEGACY_PRICE,
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

  // Bundle řádky nejsou immutable — čistý výchozí stav.
  // `wallet_transactions` se ZÁMĚRNĚ nemažou: ledger je neměnný
  // (trg_wallet_transactions_immutable_delete), proto se účetní typy tvrdí
  // jen na řádcích vzniklých během testu (viz latestTxnStamp).
  await (admin as any).from('contest_bundle_purchases').delete().eq('user_id', customerId);
}

/** Časová hranice pro tvrzení nad neměnným ledgerem — poslední známý řádek. */
async function latestTxnStamp(admin: SupabaseClient, customerId: string): Promise<string> {
  const { data } = await (admin as any)
    .from('wallet_transactions').select('created_at')
    .eq('user_id', customerId).order('created_at', { ascending: false }).limit(1);
  return (data?.[0]?.created_at as string | undefined) ?? '1970-01-01T00:00:00Z';
}

/** Typy transakcí zapsaných po dané hranici. */
async function txnTypesSince(
  admin: SupabaseClient, customerId: string, since: string,
): Promise<string[]> {
  const { data } = await (admin as any)
    .from('wallet_transactions').select('type')
    .eq('user_id', customerId).gt('created_at', since);
  return ((data ?? []) as { type: string }[]).map((t) => t.type);
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

/**
 * Otevře detail soutěže a počká na nákupní tlačítko. Detail má realtime
 * i polling, takže `networkidle` nikdy nenastane — čeká se na tlačítko.
 */
async function openContest(page: import('@playwright/test').Page) {
  await page.goto(`/contest/${FIXTURE.contestId}`);
  const button = page.getByRole('button', { name: BUY_BUTTON });
  await expect(button).toBeVisible({ timeout: 30_000 });
  return button;
}

/**
 * Pozdrží každé čtení peněženky, takže `balanceLoaded` na detailu soutěže
 * zůstane `false` i ve chvíli, kdy je nákupní tlačítko už klikatelné. Přesně
 * v té chvíli má handler jediný `await` před zamčením — a právě ten dřív
 * dovolil dvěma klikům ve stejném ticku koupit dvakrát.
 * Vrací počítadlo dokončených wallet requestů, aby test mohl doložit, že
 * v okamžiku kliknutí zůstatek opravdu ještě nedorazil.
 */
async function stallWalletReads(
  page: import('@playwright/test').Page,
  delayMs: number,
): Promise<() => number> {
  let delivered = 0;
  page.on('response', (response) => {
    if (response.url().includes('/rest/v1/wallets')) delivered += 1;
  });
  await page.route('**/rest/v1/wallets*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
  return () => delivered;
}

/**
 * Nastraží bonusovou výhru přesně na tiket, který padne příštímu nákupu.
 * Vrací úklidovou funkci — nastražený `bonus_prizes` řádek se po testu maže,
 * aby fixture nerostla.
 */
async function armNextTicketWin(
  admin: SupabaseClient,
  prize: { title: string; description: string; detailed?: string; amount: number | null; imageUrl?: string },
): Promise<() => Promise<void>> {
  const { data: contest } = await (admin as any)
    .from('contests').select('next_ticket_number').eq('id', FIXTURE.contestId).single();
  const position = Number(contest.next_ticket_number);

  await (admin as any).from('bonus_prizes').delete()
    .eq('contest_id', FIXTURE.contestId).eq('ticket_position', position);

  const { error } = await (admin as any).from('bonus_prizes').insert({
    contest_id: FIXTURE.contestId,
    ticket_position: position,
    title: prize.title,
    description: prize.description,
    detailed_description: prize.detailed ?? null,
    image_url: prize.imageUrl ?? null,
    amount: prize.amount,
    status: 'pending',
  });
  if (error) throw new Error(`bonus_prizes insert: ${error.message}`);

  return async () => {
    await (admin as any).from('bonus_prizes').delete()
      .eq('contest_id', FIXTURE.contestId).eq('ticket_position', position);
  };
}

/** Fixture soutěž mezi oblíbenými, aby ji `/favorites` vypsal. */
async function ensureFavorite(admin: SupabaseClient, customerId: string): Promise<void> {
  const { data } = await (admin as any)
    .from('user_contest_favorites').select('id')
    .eq('user_id', customerId).eq('contest_id', FIXTURE.contestId).maybeSingle();
  if (data?.id) return;
  const { error } = await (admin as any)
    .from('user_contest_favorites').insert({ user_id: customerId, contest_id: FIXTURE.contestId });
  if (error) throw new Error(`user_contest_favorites insert: ${error.message}`);
}

/**
 * Najde kartu fixture soutěže v seznamu a vrátí její nákupní tlačítko.
 * Karty na seznamech mají skrytý titulek, proto se hledá přes contest id.
 */
async function openListCard(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  const card = page.getByTestId(`contest-card-${FIXTURE.contestId}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  const button = card.getByRole('button', { name: BUY_BUTTON });
  await expect(button).toBeVisible({ timeout: 30_000 });
  return button;
}

/** Dvě kliknutí ve stejném ticku — přesně to, co má synchronní zámek zahodit. */
async function doubleClickSameTick(
  button: import('@playwright/test').Locator,
): Promise<void> {
  await button.evaluate((el: HTMLElement) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

test.describe.serial('Spec 100 — mystery kupon (UI)', () => {
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

  test('100a: vypnutý pilot — klasický nákup tiketu beze změny', async ({ page }) => {
    const admin = makeAdmin();
    // Neprázdný allowlist BEZ této soutěže = soutěž mimo pilot.
    await setFlag(admin, true, JSON.stringify(['f0000100-0000-4000-8000-0000000000ff']));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    const issuancesBefore = await countIssuances(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);
    const since           = await latestTxnStamp(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    // Klasický tok jde rovnou na výsledek tiketu, žádné odhalení kuponu.
    await expect(
      page.locator('[role="dialog"]:has(button[aria-label="Zavřít"])'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('mystery-result-dialog')).toHaveCount(0);

    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore);

    // Klasický nákup účtuje ticket_purchase a strhne cenu tiketu.
    const types = await txnTypesSince(admin, customerId, since);
    expect(types).toContain('ticket_purchase');
    expect(types).not.toContain('benefit_purchase');

    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);
  });

  test('100b: zapnutý pilot — o kuponu není před nákupem vidět nic', async ({ page }) => {
    await setFlag(makeAdmin(), true, JSON.stringify([FIXTURE.contestId]));

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await openContest(page);

    // Cena zůstává contests.ticket_price — žádná zvláštní benefitní cena.
    await expect(page.getByRole('button', { name: BUY_BUTTON })).toBeVisible();
    await expect(page.getByRole('button', { name: /Uplatnit 20 MioCoin/ })).toHaveCount(0);

    // Žádná samostatná karta ani identita kuponu před nákupem.
    await expect(page.getByTestId('mystery-result-dialog')).toHaveCount(0);
    const body = page.locator('body');
    await expect(body).not.toContainText(BENEFIT_NAME);
    await expect(body).not.toContainText(PARTNER_NAME);
  });

  test('100c: nákup strhne cenu tiketu, dá kupon s kódem i tiket zdarma', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    // Fixture je znovupoužitelná, proto se tvrdí přírůstky, ne absolutní počty.
    const issuancesBefore = await countIssuances(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);
    const since           = await latestTxnStamp(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    // Nejdřív se odhalí kupon i s kódem, teprve po zavření výsledek tiketu.
    const reveal = page.getByTestId('mystery-result-dialog');
    await expect(reveal).toBeVisible({ timeout: 30_000 });
    await expect(reveal).toContainText(BENEFIT_NAME);
    await expect(page.getByTestId('mystery-coupon-code')).not.toBeEmpty();

    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore + 1);
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);

    // Nejnovější vydání má navázaný tiket a platné účtovací zdůvodnění.
    // (Opakované vydání téhož kuponu témuž zákazníkovi je záměrně neúčtované.)
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
    expect(Number(bundles?.[0].charged_miocoins)).toBe(TICKET_PRICE);

    // Zůstatek klesl přesně o cenu tiketu, ne o cenu z verze kuponu.
    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);

    // Účetně jde o benefit_purchase, nikdy ticket_purchase — tiket je zdarma.
    const types = await txnTypesSince(admin, customerId, since);
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
    const button = await openContest(page);
    await doubleClickSameTick(button);

    await expect(page.getByTestId('mystery-result-dialog')).toBeVisible({ timeout: 30_000 });

    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
  });

  test('100d-games: dvojklik z karty v Games vytvoří jen jeden nákup', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    const bundlesBefore    = await countBundles(admin, customerId);
    const issuancesBefore  = await countIssuances(admin, customerId);
    const ticketsBefore    = await countTickets(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openListCard(page, '/games');
    await doubleClickSameTick(button);

    await expect(page.getByTestId('mystery-result-dialog')).toBeVisible({ timeout: 30_000 });

    // Právě jeden odečet, jeden kupon, jeden tiket.
    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore + 1);
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);
    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);
  });

  // Vyžaduje, aby `public.user_contest_favorites` mělo partner-own RLS policies
  // (SELECT/INSERT/DELETE `user_id = auth.uid()`). Staging je dlouho neměl, takže
  // `/favorite-games` nevykreslovalo nic; doplněny 27. 07. 2026 podle produkce.
  test('100d-favorites: dvojklik z karty v Oblíbených vytvoří jen jeden nákup', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    await ensureFavorite(admin, customerId);
    const bundlesBefore   = await countBundles(admin, customerId);
    const issuancesBefore = await countIssuances(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openListCard(page, '/favorite-games');
    await doubleClickSameTick(button);

    await expect(page.getByTestId('mystery-result-dialog')).toBeVisible({ timeout: 30_000 });

    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore + 1);
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);
    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);
  });

  test('100d-classic: dvojklik z karty u nezapojené soutěže koupí jen jeden tiket', async ({ page }) => {
    const admin = makeAdmin();
    // Neprázdný allowlist BEZ této soutěže = klasický nákup.
    await setFlag(admin, true, JSON.stringify(['f0000100-0000-4000-8000-0000000000ff']));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);
    const issuancesBefore = await countIssuances(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openListCard(page, '/games');
    await doubleClickSameTick(button);

    await expect(
      page.locator('[role="dialog"]:has(button[aria-label="Zavřít"])'),
    ).toBeVisible({ timeout: 30_000 });

    // Jeden tiket, jeden odečet ceny tiketu, žádný kupon.
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore);
    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);
  });

  test('100d-cold: dvojklik na detailu s nenačteným zůstatkem koupí jen jednou', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    const bundlesBefore   = await countBundles(admin, customerId);
    const issuancesBefore = await countIssuances(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);
    const since           = await latestTxnStamp(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);

    // Zůstatek dorazí až dlouho po tom, co je tlačítko klikatelné.
    const walletReads = await stallWalletReads(page, 10_000);
    const button = await openContest(page);

    // Doklad, že jde opravdu o „studený" stav: peněženka ještě nedorazila,
    // takže handler má před zamčením await na loadUserBalance.
    expect(walletReads()).toBe(0);

    await doubleClickSameTick(button);

    await expect(page.getByTestId('mystery-result-dialog')).toBeVisible({ timeout: 40_000 });

    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore + 1);
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);

    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);

    const types = await txnTypesSince(admin, customerId, since);
    expect(types).toEqual(['benefit_purchase']);
  });

  test('100d-cold-classic: totéž u nezapojené soutěže — jediný ticket_purchase', async ({ page }) => {
    const admin = makeAdmin();
    // Neprázdný allowlist BEZ této soutěže = klasický nákup.
    await setFlag(admin, true, JSON.stringify(['f0000100-0000-4000-8000-0000000000ff']));

    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);
    const issuancesBefore = await countIssuances(admin, customerId);
    const since           = await latestTxnStamp(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);

    const walletReads = await stallWalletReads(page, 10_000);
    const button = await openContest(page);
    expect(walletReads()).toBe(0);

    await doubleClickSameTick(button);

    await expect(
      page.locator('[role="dialog"]:has(button[aria-label="Zavřít"])'),
    ).toBeVisible({ timeout: 40_000 });

    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore);

    const { data: wallet } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(wallet.balance_coins)).toBe(START_BALANCE - TICKET_PRICE);

    const types = await txnTypesSince(admin, customerId, since);
    expect(types).toEqual(['ticket_purchase']);
  });

  test('100f: výhra MioCoinů + kupon v jednom dialogu', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);

    const cleanup = await armNextTicketWin(admin, {
      title: 'Bonus MioCoiny',
      description: 'Bonus MioCoiny',
      amount: 250,
    });

    try {
      await primeConsent(page);
      await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
      const button = await openContest(page);
      await button.click();

      const dialog = page.getByTestId('mystery-result-dialog');
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      // Výhra z tiketu je hlavní sdělení.
      await expect(dialog).toContainText('GRATULUJEME');
      await expect(dialog).toContainText('VYHRÁL JSI');
      await expect(page.getByTestId('mystery-result-miocoin-amount')).toContainText('250');
      // Originální MioCoin obrázek, žádná nová ikona.
      await expect(page.getByTestId('mystery-result-prize-image'))
        .toHaveAttribute('src', /storage\/v1\/object\/public\/assets\//);

      // Kupon je pod ní jako druhý, garantovaný bonus.
      await expect(dialog).toContainText('A navíc získáváš kupon');
      await expect(page.getByTestId('mystery-coupon-name')).toContainText(BENEFIT_NAME);
    } finally {
      await cleanup();
    }
  });

  test('100g: věcná výhra + kupon v jednom dialogu', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);

    const PRIZE_TITLE = 'E2E Věcná cena';
    const PRIZE_DESC  = 'Popis věcné ceny pro E2E';
    const cleanup = await armNextTicketWin(admin, {
      title: PRIZE_TITLE,
      description: PRIZE_TITLE,
      detailed: PRIZE_DESC,
      amount: null,
      imageUrl: 'https://example.invalid/spec100-prize.png',
    });

    try {
      await primeConsent(page);
      await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
      const button = await openContest(page);
      await button.click();

      const dialog = page.getByTestId('mystery-result-dialog');
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      await expect(dialog).toContainText('GRATULUJEME');
      await expect(page.getByTestId('mystery-result-prize-title')).toContainText(PRIZE_TITLE);
      await expect(dialog).toContainText(PRIZE_DESC);
      await expect(page.getByTestId('mystery-result-prize-image'))
        .toHaveAttribute('src', 'https://example.invalid/spec100-prize.png');
      // Věcná výhra nesmí sklouznout do MioCoinové větve.
      await expect(page.getByTestId('mystery-result-miocoin-amount')).toHaveCount(0);

      await expect(page.getByTestId('mystery-coupon-name')).toContainText(BENEFIT_NAME);
    } finally {
      await cleanup();
    }
  });

  test('100h: kupon má název, partnera, kód i funkční kopírování', async ({ page, context }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    const dialog = page.getByTestId('mystery-result-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('mystery-coupon-name')).toContainText(BENEFIT_NAME);
    await expect(page.getByTestId('mystery-coupon-partner')).toContainText(PARTNER_NAME);

    const codeEl = page.getByTestId('mystery-coupon-code');
    await expect(codeEl).not.toBeEmpty();
    const shownCode = (await codeEl.textContent())?.trim() ?? '';

    // Kód na obrazovce musí sedět s tím, co je opravdu vydané v databázi.
    const { data: issuedCode } = await (admin as any)
      .from('voucher_codes').select('code')
      .eq('issued_to_user_id', customerId).eq('status', 'issued')
      .order('issued_at', { ascending: false }).limit(1).maybeSingle();
    expect(shownCode).toBe(issuedCode.code);

    await page.getByTestId('mystery-coupon-copy').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(shownCode);
  });

  test('100i: jediné hlavní tlačítko „Pokračovat", žádný druhý modal', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);
    const bundlesBefore   = await countBundles(admin, customerId);
    const issuancesBefore = await countIssuances(admin, customerId);
    const ticketsBefore   = await countTickets(admin, customerId);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    const dialog = page.getByTestId('mystery-result-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // Odstraněná tlačítka se nesmí vrátit.
    await expect(dialog.getByRole('button', { name: /Zobrazit celý tiket/i })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Zobrazit tiket/i })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Uložit kupon/i })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Pokračovat' })).toHaveCount(1);

    // Informace, kde kupon i tiket najde.
    await expect(page.getByTestId('mystery-result-storage-note')).toContainText('Voucherech');

    await page.getByTestId('mystery-result-continue').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[role="dialog"]:has(button[aria-label="Zavřít"])')).toHaveCount(0);

    // Zavření nic nevytvořilo ani nezrušilo — vše vzniklo už při nákupu.
    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
    expect(await countIssuances(admin, customerId)).toBe(issuancesBefore + 1);
    expect(await countTickets(admin, customerId)).toBe(ticketsBefore + 1);
  });

  test('100k: panel dalšího výherního tiketu se správným skloňováním', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    const customerId = ctx.customerAuthId!;
    await resetMutableState(admin, customerId);

    // Bonus dva tahy za koupeným tiketem → „za 2 tahy".
    const { data: contest } = await (admin as any)
      .from('contests').select('next_ticket_number').eq('id', FIXTURE.contestId).single();
    const bonusAt = Number(contest.next_ticket_number) + 2;

    await (admin as any).from('bonus_prizes').delete()
      .eq('contest_id', FIXTURE.contestId).eq('ticket_position', bonusAt);
    const { error } = await (admin as any).from('bonus_prizes').insert({
      contest_id: FIXTURE.contestId,
      ticket_position: bonusAt,
      title: 'E2E budoucí bonus',
      description: 'E2E budoucí bonus',
      amount: 10,
      status: 'pending',
    });
    if (error) throw new Error(`bonus_prizes insert: ${error.message}`);

    try {
      await primeConsent(page);
      await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
      const button = await openContest(page);
      await button.click();

      await expect(page.getByTestId('mystery-result-dialog')).toBeVisible({ timeout: 30_000 });

      const panel = page.getByTestId('mystery-result-next-win');
      await expect(panel).toBeVisible();
      // 2 tahy — ne „2 tahů", ne „2 tah".
      await expect(panel).toContainText('za 2 tahy');
      await expect(panel).toContainText('Může obsahovat MioCoiny, bonusovou cenu nebo hlavní výhru.');
    } finally {
      await (admin as any).from('bonus_prizes').delete()
        .eq('contest_id', FIXTURE.contestId).eq('ticket_position', bonusAt);
    }
  });

  test('100l: bez známé vzdálenosti se panel vůbec nezobrazí', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    await resetMutableState(admin, ctx.customerAuthId!);

    // Ve fixture soutěži nejsou žádné budoucí bonusy → RPC vrátí null.
    const { data: contest } = await (admin as any)
      .from('contests').select('next_ticket_number').eq('id', FIXTURE.contestId).single();
    await (admin as any).from('bonus_prizes').delete()
      .eq('contest_id', FIXTURE.contestId)
      .gte('ticket_position', Number(contest.next_ticket_number));

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    await expect(page.getByTestId('mystery-result-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('mystery-result-next-win')).toHaveCount(0);
    // Kupon i tlačítko zůstávají.
    await expect(page.getByTestId('mystery-coupon-code')).toBeVisible();
    await expect(page.getByTestId('mystery-result-continue')).toBeVisible();
  });

  test('100j: mobil — dialog je čitelný bez vodorovného posouvání', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    await resetMutableState(admin, ctx.customerAuthId!);

    await page.setViewportSize({ width: 375, height: 812 });
    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    const dialog = page.getByTestId('mystery-result-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // Výhra i kupon se vejdou pod sebe, stránka se nesmí posouvat do stran.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);

    await expect(page.getByTestId('mystery-coupon-code')).toBeVisible();
    await expect(page.getByTestId('mystery-result-continue')).toBeVisible();
  });

  test('100e: poslední kód — výsledek zůstane a Pokračovat ho zavře', async ({ page }) => {
    const admin = makeAdmin();
    await setFlag(admin, true, JSON.stringify([FIXTURE.contestId]));
    const customerId = ctx.customerAuthId!;

    // Nechat právě JEDEN volný kód, aby po nákupu žádný nezbyl.
    // Volné kódy nejsou immutable; vydané se nikdy nemažou.
    await (admin as any)
      .from('voucher_codes').delete()
      .eq('distribution_order_id', FIXTURE.orderId).eq('status', 'available');
    const { error: seedErr } = await (admin as any).from('voucher_codes').insert({
      voucher_id: FIXTURE.voucherId,
      code: `SPEC100-LAST-${Date.now()}`,
      status: 'available',
      distribution_order_id: FIXTURE.orderId,
    });
    if (seedErr) throw new Error(`last-code seed: ${seedErr.message}`);

    const bundlesBefore = await countBundles(admin, customerId);
    const { data: walletBefore } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    const balanceBefore = Number(walletBefore.balance_coins);

    await primeConsent(page);
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    const button = await openContest(page);
    await button.click();

    // Odhalení musí zůstat viditelné, i když kupony mezitím došly.
    const reveal = page.getByTestId('mystery-result-dialog');
    await expect(reveal).toBeVisible({ timeout: 30_000 });
    await expect(reveal).toContainText(BENEFIT_NAME);

    const { count: freeCodes } = await (admin as any)
      .from('voucher_codes').select('id', { count: 'exact', head: true })
      .eq('distribution_order_id', FIXTURE.orderId).eq('status', 'available');
    expect(freeCodes ?? 0).toBe(0);

    // „Pokračovat" zavře celý výsledek a NIC dalšího neotevře — druhý
    // TicketResultModal už v mystery toku neexistuje.
    await page.getByTestId('mystery-result-continue').click();
    await expect(reveal).toHaveCount(0);
    await expect(
      page.locator('[role="dialog"]:has(button[aria-label="Zavřít"])'),
    ).toHaveCount(0);

    // Žádný druhý nákup ani další odečet.
    expect(await countBundles(admin, customerId)).toBe(bundlesBefore + 1);
    const { data: walletAfter } = await (admin as any)
      .from('wallets').select('balance_coins').eq('user_id', customerId).single();
    expect(Number(walletAfter.balance_coins)).toBe(balanceBefore - TICKET_PRICE);
  });
});
