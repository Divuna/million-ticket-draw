/**
 * Spec 161 — Shoptet: ochrana proti starým objednávkám (issue #289, část C)
 *
 * Staging-only, self-contained. Ověřuje schválené chování end-to-end na reálném
 * toku submit → verify → approve → import, ne na jeho napodobenině:
 *
 *   A) export obsahuje staré objednávky           → připraveno v setupu
 *   B) partnerské ověření nic nevydá              → 0 kódů, 0 e-mailů, 0 aktivací, 0 fakturace
 *   C) baseline se uloží                          → 3 řádky, zatím NEAKTIVNÍ
 *   D) aktivace až po ověření                     → neověřená žádost → 409
 *   E) staré objednávky přejdou na paid            → pořád 0 kódů, 0 e-mailů, 0 fakturace
 *   F) nová objednávka po aktivaci                 → projde běžnou odměnovou logikou
 *   G) stávající napojení (BOHEMIA, vereonika sro) → beze změny
 *
 * Export se hostuje jako veřejný soubor ve staging Storage, aby šlo jeho obsah
 * mezi kroky přepsat — je to jediný způsob, jak reálně simulovat „stará
 * objednávka se později změnila na zaplacenou".
 *
 * Vyžadované env (playwright-staging.yml je má):
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / E2E_SUPABASE_SERVICE_ROLE_KEY
 *   INTERNAL_FUNCTION_TOKEN            — import-shoptet-orders
 *   E2E_SUPERADMIN_EMAIL / _PASSWORD   — approve-shoptet-connection
 *
 * Úklid: afterAll maže partnery, auth uživatele, žádosti, baseline, kódy,
 * import běhy i storage bucket — i když test spadne.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const INTERNAL_TOKEN     = process.env.INTERNAL_FUNCTION_TOKEN ?? '';
const SUPERADMIN_EMAIL    = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const RUN_ID = Date.now();
const BUCKET = 'spec161-shoptet-export';
const CSV_PATH = `export-${RUN_ID}.csv`;

const PARTNER_EMAIL   = `spec161-partner-${RUN_ID}@onemil.cz`;
const UNVERIFIED_EMAIL = `spec161-unverified-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec161!${RUN_ID}x`;

// A/B/C jsou v exportu při ověření. D přibude AŽ MEZI ověřením a schválením —
// existovala tedy před aktivací a musí skončit v baseline stejně jako ostatní.
// E vznikne až po aktivaci a jako jediná smí dostat odměnu.
const OLD_ORDERS = [`S161-OLD-A-${RUN_ID}`, `S161-OLD-B-${RUN_ID}`, `S161-OLD-C-${RUN_ID}`];
const LATE_ORDER = `S161-OLD-D-${RUN_ID}`;
const PRE_ACTIVATION_ORDERS = [...OLD_ORDERS, LATE_ORDER];
const NEW_ORDER  = `S161-NEW-E-${RUN_ID}`;

// Stávající produkční napojení, kterých se změna nesmí dotknout.
const LEGACY_PARTNER_NAMES = ['BOHEMIA INFINITY s.r.o.', 'vereonika sro'];

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!ANON_KEY && !!SERVICE_ROLE && !!INTERNAL_TOKEN;

const svc = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/** Shoptet-like CSV. `paid` je 1/0, `statusName` drží lifecycle. */
function buildCsv(rows: Array<{ order: string; paid: boolean }>): string {
  const header = 'code;statusName;totalPriceWithVat;paid;email';
  const body = rows.map(
    (r) => `${r.order};pending;250;${r.paid ? '1' : '0'};spec161-customer-${RUN_ID}@example.invalid`,
  );
  return [header, ...body].join('\n');
}

/** Hlavičky sedí, ale řádek nemá číslo objednávky → parser ho označí za neplatný. */
function buildCsvWithInvalidRow(): string {
  return [
    'code;statusName;totalPriceWithVat;paid;email',
    `${OLD_ORDERS[0]};pending;250;0;spec161-customer-${RUN_ID}@example.invalid`,
    `;pending;250;0;spec161-customer-${RUN_ID}@example.invalid`,
  ].join('\n');
}

const ctx: {
  partnerId?: string;
  partnerAuthId?: string;
  requestId?: string;
  unverifiedPartnerId?: string;
  unverifiedAuthId?: string;
  unverifiedRequestId?: string;
  legacySnapshot?: string;
} = {};

async function uploadCsv(csv: string): Promise<void> {
  const client = svc();
  const { error } = await client.storage
    .from(BUCKET)
    .upload(CSV_PATH, new Blob([csv], { type: 'text/csv' }), {
      upsert: true,
      contentType: 'text/csv',
    });
  if (error) throw new Error(`csv upload: ${error.message}`);
}

/** JWT konkrétního uživatele — Edge Functions se volají jeho jménem, ne service_role. */
async function signIn(email: string, password: string): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign in ${email}: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

async function callFunction(
  name: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function runImport(mode: 'dry_run' | 'live'): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/import-shoptet-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
    body: JSON.stringify({ partner_id: ctx.partnerId, mode, trigger: 'admin' }),
  });
  return res.json();
}

/** Kolik kódů/aktivací/fakturačních řádků partner má. Musí zůstat na nule. */
async function partnerIssuance(partnerId: string) {
  const client = svc();
  const [codes, activations, invoiceLines] = await Promise.all([
    client.from('partner_reward_codes').select('code, external_order_id, status').eq('partner_id', partnerId),
    client.from('partner_coin_activations').select('id').eq('partner_id', partnerId),
    client.from('partner_invoice_lines').select('id').eq('partner_id', partnerId),
  ]);
  return {
    codes: codes.data ?? [],
    activations: activations.data?.length ?? 0,
    invoiceLines: invoiceLines.error ? 0 : (invoiceLines.data?.length ?? 0),
  };
}

async function customerEmailCount(): Promise<number> {
  const { data } = await svc()
    .from('email_queue')
    .select('id')
    .like('email', `spec161-customer-${RUN_ID}@%`);
  return data?.length ?? 0;
}

async function createPartnerWithRequest(email: string): Promise<{ partnerId: string; authId: string; requestId: string }> {
  const client = svc();
  const { data: u, error: uErr } = await client.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser: ${uErr.message}`);

  const { data: p, error: pErr } = await client
    .from('partners')
    .insert({
      name: `E2E Spec161 ${email}`,
      company_name: `E2E Spec161 s.r.o. ${RUN_ID}`,
      logo_url: 'https://example.invalid/spec161.png',
      website_url: 'https://example.invalid/spec161',
      contact_email: email,
      auth_user_id: u.user.id,
      status: 'approved',
      approved_at: new Date().toISOString(),
      reward_base_czk: 100,
      reward_mc: 1,
      reward_mode: 'whole_shop',
      reward_trigger_status: 'paid',
      // Import se zapne až schválením — přesně jako u reálného partnera.
      shoptet_import_enabled: false,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);

  const { data: r, error: rErr } = await client
    .from('shoptet_connection_requests')
    .insert({
      partner_id: p.id,
      shop_name: `Spec161 e-shop ${RUN_ID}`,
      trigger_status: 'paid',
      reward_czk: 100,
      reward_mc: 1,
      request_kind: 'initial',
      status: 'submitted',
      url_received: true,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (rErr) throw new Error(`request insert: ${rErr.message}`);

  return { partnerId: p.id as string, authId: u.user.id, requestId: r.id as string };
}

test.describe.serial('161 — Shoptet baseline: staré objednávky nikdy nevydají odměnu', () => {
  test.skip(!isStaging, 'staging-only — vyžaduje staging URL, service role a internal token');

  test.beforeAll(async () => {
    const client = svc();

    // Veřejný bucket pro testovací export. Obsah se mezi kroky přepisuje.
    await client.storage.createBucket(BUCKET, { public: true }).catch(() => undefined);
    await uploadCsv(buildCsv(OLD_ORDERS.map((order) => ({ order, paid: false }))));

    const main = await createPartnerWithRequest(PARTNER_EMAIL);
    ctx.partnerId = main.partnerId;
    ctx.partnerAuthId = main.authId;
    ctx.requestId = main.requestId;

    const second = await createPartnerWithRequest(UNVERIFIED_EMAIL);
    ctx.unverifiedPartnerId = second.partnerId;
    ctx.unverifiedAuthId = second.authId;
    ctx.unverifiedRequestId = second.requestId;

    // Exportní URL jde výhradně do Vaultu, stejnou cestou jako submit- EF.
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${CSV_PATH}`;
    for (const requestId of [main.requestId, second.requestId]) {
      const { error } = await client.rpc('store_shoptet_pending_url', {
        p_request_id: requestId,
        p_url: publicUrl,
      });
      if (error) throw new Error(`vault store: ${error.message}`);
    }

    // Otisk stávajících napojení PŘED testem — test G ho porovná po všem.
    const { data: legacy } = await client
      .from('partners')
      .select('id, name, shoptet_import_enabled, shoptet_customer_delivery, reward_trigger_status, reward_mode, reward_base_czk, reward_mc')
      .in('name', LEGACY_PARTNER_NAMES)
      .order('name');
    ctx.legacySnapshot = JSON.stringify(legacy ?? []);
  });

  test.afterAll(async () => {
    const client = svc();
    const partnerIds = [ctx.partnerId, ctx.unverifiedPartnerId].filter(Boolean) as string[];
    if (partnerIds.length > 0) {
      await client.from('shoptet_import_row_log').delete().in(
        'run_id',
        ((await client.from('shoptet_import_runs').select('id').in('partner_id', partnerIds)).data ?? []).map((r: any) => r.id),
      );
      await client.from('shoptet_import_runs').delete().in('partner_id', partnerIds);
      await client.from('partner_coin_activations').delete().in('partner_id', partnerIds);
      await client.from('partner_reward_codes').delete().in('partner_id', partnerIds);
      await client.from('shoptet_connection_baseline_orders').delete().in('partner_id', partnerIds);
      await client.from('shoptet_connection_requests').delete().in('partner_id', partnerIds);
      await client.from('partners').delete().in('id', partnerIds);
    }
    for (const authId of [ctx.partnerAuthId, ctx.unverifiedAuthId]) {
      if (authId) await client.auth.admin.deleteUser(authId).catch(() => undefined);
    }
    // `spec161-%`, ne jen zákaznický vzor: schválení navíc zařadí notifikaci
    // partnerovi, která by jinak zůstala v frontě viset.
    await client.from('email_queue').delete().like('email', `spec161-%${RUN_ID}%`);
    await client.storage.from(BUCKET).remove([CSV_PATH]).catch(() => undefined);
    await client.storage.deleteBucket(BUCKET).catch(() => undefined);
  });

  test('161a: ověření nanečisto nic nevydá a zapíše baseline', async () => {
    const token = await signIn(PARTNER_EMAIL, PASSWORD);
    const { status, json } = await callFunction('verify-shoptet-connection', token, {
      request_id: ctx.requestId,
    });

    expect(status, `verify: ${JSON.stringify(json)}`).toBe(200);
    expect(json.verified).toBe(true);
    expect(json.export_reachable).toBe(true);
    expect(json.headers_ok).toBe(true);
    expect(json.missing_headers).toEqual([]);
    expect(json.rows_valid).toBe(OLD_ORDERS.length);
    expect(json.baseline_orders).toBe(OLD_ORDERS.length);

    // Odpověď nesmí nést exportní URL, hash ani zákaznická data.
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain('storage/v1/object');
    expect(serialized).not.toContain('@example.invalid');
    expect(serialized).not.toContain(BUCKET);

    // B) Nic se nevydalo.
    const issuance = await partnerIssuance(ctx.partnerId!);
    expect(issuance.codes, 'ověření nesmí vytvořit kód').toHaveLength(0);
    expect(issuance.activations, 'ověření nesmí aktivovat coiny').toBe(0);
    expect(issuance.invoiceLines, 'ověření nesmí fakturovat').toBe(0);
    expect(await customerEmailCount(), 'ověření nesmí zařadit e-mail').toBe(0);
  });

  test('161b: baseline je uložená, ale ještě neaktivní', async () => {
    const client = svc();
    const { data: rows } = await client
      .from('shoptet_connection_baseline_orders')
      .select('external_order_id, activated_at')
      .eq('partner_id', ctx.partnerId!);

    expect(rows).toHaveLength(OLD_ORDERS.length);
    expect((rows ?? []).map((r: any) => r.external_order_id).sort()).toEqual([...OLD_ORDERS].sort());
    // Dokud napojení není schválené, baseline nic neblokuje.
    expect((rows ?? []).every((r: any) => r.activated_at === null)).toBe(true);

    const { data: req } = await client
      .from('shoptet_connection_requests')
      .select('verified_at, verified_order_count')
      .eq('id', ctx.requestId!)
      .single();
    expect(req?.verified_at).toBeTruthy();
    expect(req?.verified_order_count).toBe(OLD_ORDERS.length);
  });

  test('161b2: vadný export po úspěšném ověření zruší schvalitelnost', async () => {
    // Scénář B ze zadání: partner ověří, pak se mu export rozbije. Staré
    // `verified_at` nesmí zůstat viset, jinak by admin schválil napojení nad
    // exportem, který už nejde načíst.
    await svc().storage.from(BUCKET).remove([CSV_PATH]);

    const token = await signIn(PARTNER_EMAIL, PASSWORD);
    const { json } = await callFunction('verify-shoptet-connection', token, {
      request_id: ctx.requestId,
    });
    expect(json.verified).toBe(false);

    const client = svc();
    const { data: req } = await client
      .from('shoptet_connection_requests')
      .select('verified_at, verified_order_count')
      .eq('id', ctx.requestId!)
      .single();
    expect(req?.verified_at, 'neúspěšné ověření musí zneplatnit to předchozí').toBeNull();
    expect(req?.verified_order_count).toBeNull();

    const { data: baseline } = await client
      .from('shoptet_connection_baseline_orders')
      .select('id')
      .eq('request_id', ctx.requestId!);
    expect(baseline ?? [], 'předběžná baseline se musí zahodit').toHaveLength(0);
  });

  test('161b3: export s neplatným řádkem neprojde jako ověřený', async () => {
    // Scénář C: hlavičky sedí, ale jeden řádek nemá číslo objednávky. Nevíme
    // tedy, co v exportu je — baseline by mohla objednávku vynechat.
    await uploadCsv(buildCsvWithInvalidRow());

    const token = await signIn(PARTNER_EMAIL, PASSWORD);
    const { json } = await callFunction('verify-shoptet-connection', token, {
      request_id: ctx.requestId,
    });
    expect(json.verified).toBe(false);
    expect(json.reason).toBe('invalid_rows');
    expect(json.rows_invalid).toBeGreaterThan(0);

    const { data: req } = await svc()
      .from('shoptet_connection_requests')
      .select('verified_at')
      .eq('id', ctx.requestId!)
      .single();
    expect(req?.verified_at).toBeNull();
  });

  test('161b4: po opravě exportu ověření zase projde', async () => {
    await uploadCsv(buildCsv(OLD_ORDERS.map((order) => ({ order, paid: false }))));

    const token = await signIn(PARTNER_EMAIL, PASSWORD);
    const { json } = await callFunction('verify-shoptet-connection', token, {
      request_id: ctx.requestId,
    });
    expect(json.verified).toBe(true);
    expect(json.baseline_orders).toBe(OLD_ORDERS.length);
  });

  test('161c: neověřenou žádost nelze aktivovat', async () => {
    test.skip(!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD, 'chybí staging superadmin secrets');
    const token = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const { status, json } = await callFunction('approve-shoptet-connection', token, {
      request_id: ctx.unverifiedRequestId,
      action: 'approve',
    });
    expect(status).toBe(409);
    expect(json.error).toBe('verification_required');

    // Odmítnutí nesmí nic zapnout.
    const { data: p } = await svc()
      .from('partners')
      .select('shoptet_import_enabled')
      .eq('id', ctx.unverifiedPartnerId!)
      .single();
    expect(p?.shoptet_import_enabled).toBe(false);
  });

  test('161c2: rozbitý export zastaví i samotné schválení (fail-closed)', async () => {
    test.skip(!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD, 'chybí staging superadmin secrets');

    // Ověření prošlo (161b4), ale mezi ověřením a schválením se export rozbil.
    // Schválení si dělá vlastní čerstvý snímek, takže to musí zachytit.
    await svc().storage.from(BUCKET).remove([CSV_PATH]);

    const token = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    const { status, json } = await callFunction('approve-shoptet-connection', token, {
      request_id: ctx.requestId,
      action: 'approve',
    });
    expect(status).toBe(409);
    expect(json.error).toBe('export_not_usable');

    const client = svc();
    const { data: p } = await client
      .from('partners')
      .select('shoptet_import_enabled')
      .eq('id', ctx.partnerId!)
      .single();
    expect(p?.shoptet_import_enabled, 'fail-closed: import zůstává vypnutý').toBe(false);

    const { data: req } = await client
      .from('shoptet_connection_requests')
      .select('status')
      .eq('id', ctx.requestId!)
      .single();
    expect(req?.status, 'požadavek zůstává submitted a jde zopakovat').toBe('submitted');
  });

  test('161d: schválení pořídí ČERSTVOU baseline včetně objednávky vzniklé po ověření', async () => {
    test.skip(!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD, 'chybí staging superadmin secrets');

    // Scénář A ze zadání: mezi ověřením a schválením přibude objednávka D.
    // Ověření o ní neví, ale existovala PŘED aktivací → musí být v baseline.
    await uploadCsv(buildCsv(PRE_ACTIVATION_ORDERS.map((order) => ({ order, paid: false }))));

    const token = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    const { status, json } = await callFunction('approve-shoptet-connection', token, {
      request_id: ctx.requestId,
      action: 'approve',
    });
    expect(status, `approve: ${JSON.stringify(json)}`).toBe(200);
    expect(json.status).toBe('active');

    const client = svc();
    const { data: rows } = await client
      .from('shoptet_connection_baseline_orders')
      .select('external_order_id, activated_at')
      .eq('partner_id', ctx.partnerId!);

    // Čtyři, ne tři: D se přidala až po ověření.
    expect(rows).toHaveLength(PRE_ACTIVATION_ORDERS.length);
    expect((rows ?? []).map((r: any) => r.external_order_id).sort())
      .toEqual([...PRE_ACTIVATION_ORDERS].sort());
    expect((rows ?? []).map((r: any) => r.external_order_id)).toContain(LATE_ORDER);
    expect((rows ?? []).every((r: any) => r.activated_at !== null)).toBe(true);

    const { data: p } = await client
      .from('partners')
      .select('shoptet_import_enabled')
      .eq('id', ctx.partnerId!)
      .single();
    expect(p?.shoptet_import_enabled).toBe(true);
  });

  test('161e: stará objednávka přejde na paid → pořád žádná odměna', async () => {
    test.skip(!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD, 'chybí staging superadmin secrets');

    // Přesně scénář ze zadání: historická objednávka se později zaplatí.
    // Včetně D, která vznikla mezi ověřením a schválením.
    await uploadCsv(buildCsv(PRE_ACTIVATION_ORDERS.map((order) => ({ order, paid: true }))));

    const result = await runImport('live');
    expect(result.status, `import: ${JSON.stringify(result)}`).toBe('ok');
    expect(result.skipped_baseline).toBe(PRE_ACTIVATION_ORDERS.length);
    expect(result.created).toBe(0);
    expect(result.status_updated).toBe(0);
    expect(result.email_enqueued).toBe(0);

    const issuance = await partnerIssuance(ctx.partnerId!);
    expect(issuance.codes, 'baseline objednávka nesmí nikdy vydat kód').toHaveLength(0);
    expect(issuance.activations).toBe(0);
    expect(issuance.invoiceLines).toBe(0);
    expect(await customerEmailCount(), 'baseline objednávka nesmí poslat e-mail').toBe(0);
  });

  test('161f: nová objednávka po aktivaci projde běžnou odměnovou logikou', async () => {
    test.skip(!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD, 'chybí staging superadmin secrets');

    await uploadCsv(
      buildCsv([
        ...PRE_ACTIVATION_ORDERS.map((order) => ({ order, paid: true })),
        { order: NEW_ORDER, paid: true },
      ]),
    );

    const result = await runImport('live');
    expect(result.status, `import: ${JSON.stringify(result)}`).toBe('ok');
    expect(result.skipped_baseline).toBe(PRE_ACTIVATION_ORDERS.length);
    expect(result.created).toBe(1);

    const issuance = await partnerIssuance(ctx.partnerId!);
    expect(issuance.codes).toHaveLength(1);
    expect(issuance.codes[0].external_order_id).toBe(NEW_ORDER);
    // Žádná z objednávek z doby před aktivací se mezi kódy nesmí objevit —
    // ani D, o které partnerské ověření nevědělo.
    for (const old of PRE_ACTIVATION_ORDERS) {
      expect(issuance.codes.map((c: any) => c.external_order_id)).not.toContain(old);
    }
  });

  test('161g: stávající napojení zůstala beze změny', async () => {
    const client = svc();
    const { data: legacy } = await client
      .from('partners')
      .select('id, name, shoptet_import_enabled, shoptet_customer_delivery, reward_trigger_status, reward_mode, reward_base_czk, reward_mc')
      .in('name', LEGACY_PARTNER_NAMES)
      .order('name');
    expect(JSON.stringify(legacy ?? [])).toBe(ctx.legacySnapshot);

    // A hlavně: baseline se jim nesmí zavést zpětně — bez řádku běží import
    // přesně jako dosud.
    const legacyIds = (legacy ?? []).map((p: any) => p.id);
    if (legacyIds.length > 0) {
      const { data: legacyBaseline } = await client
        .from('shoptet_connection_baseline_orders')
        .select('id')
        .in('partner_id', legacyIds);
      expect(legacyBaseline ?? []).toHaveLength(0);
    }
  });
});
