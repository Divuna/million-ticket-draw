/**
 * Spec 194 — Fáze 6: affiliate provize ze skutečně zaplacených Kč.
 *
 * STAGING ONLY. Souběh měsíčního výpočtu s refundací a souběh refundace s vystavením
 * výplatního dokladu (194e DB, 194f skutečná Edge Function + čtení částky z PDF).
 * Souběh měsíčního výpočtu s refundací (každé volání je
 * samostatné spojení/transakce) musí skončit konzistentně: provize = součet
 * jejích plateb po refundacích, žádná platba dvakrát, žádná duplicita.
 * Stripe se nevolá. Pravidla jednotlivě: `supabase/tests/phase6_affiliate_commissions_scenarios.sql`.
 *
 * Required env: VITE_SUPABASE_URL (staging), E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const MIGRATION = 'supabase/migrations/20260926100000_phase6_affiliate_commissions_paid_czk.sql';

function skipIfNotStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) {
    test.skip(true, 'staging-only — vyžaduje staging Supabase URL a service role klíč');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const createdUserIds: string[] = [];
const rand = () => Math.random().toString(36).slice(2, 10);
const month = (offset = 0) => {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

async function createUser(db: SupabaseClient): Promise<string> {
  const email = `spec194-${Date.now()}-${rand()}@onemil.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: `Spec194-${rand()}!`, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  const { error: e2 } = await db.from('users').upsert({ id: data.user.id, email }, { onConflict: 'id' });
  if (e2) throw new Error(`public.users seed failed: ${e2.message}`);
  return data.user.id;
}

async function createAffiliateWithCustomer(db: SupabaseClient) {
  const { data: aff, error } = await db
    .from('affiliate_accounts')
    .insert({
      name: `Spec194 ${rand()}`, email: `spec194-aff-${rand()}@onemil.test`, ref_code: `S194${rand()}`,
      modes: ['influencer'], status: 'approved', commission_rate_customer: 5, commission_rate_company: 5,
    })
    .select('id')
    .single();
  if (error || !aff) throw new Error(`affiliate insert failed: ${error?.message}`);
  const customer = await createUser(db);
  const { error: e2 } = await db.from('affiliate_customer_refs').insert({ affiliate_id: aff.id, user_id: customer, source: 'spec194' });
  if (e2) throw new Error(`affiliate ref failed: ${e2.message}`);
  return { affiliateId: aff.id as string, customer };
}

async function topUp(db: SupabaseClient, userId: string, czk: number, bonus: number, monthOffset = 0): Promise<string> {
  const { data, error } = await db
    .from('payments')
    .insert({
      user_id: userId, amount: czk + bonus, method: 'stripe', status: 'completed',
      stripe_session_id: `cs_test_spec194_${Date.now()}_${rand()}`,
      paid_amount_czk: czk, base_mio: czk, bonus_mio: bonus, currency: 'czk', stripe_livemode: false,
      ...(monthOffset ? { created_at: `${month(monthOffset)}T12:00:00Z` } : {}),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`topUp failed: ${error?.message}`);
  return data.id as string;
}

async function commission(db: SupabaseClient, affiliateId: string, monthOffset = 0) {
  const { data, error } = await db
    .from('affiliate_commissions')
    .select('id, amount_base_czk, amount_total_czk, status, gross_amount_base_czk, recovery_offset_czk, recovery_credit_czk')
    .eq('affiliate_id', affiliateId)
    .eq('commission_type', 'customer_payments')
    .eq('period_month', month(monthOffset));
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function linesFor(db: SupabaseClient, affiliateId: string) {
  const { data, error } = await db
    .from('affiliate_commission_payments')
    .select('commission_id, payment_id, paid_amount_czk, refunded_czk, commission_rate')
    .eq('affiliate_id', affiliateId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Výplatní doklad × refundace (souběh). EF test potřebuje admin/superadmin účet
// a opt-in E2E_AFFILIATE_PAYOUTS=1 (stejně jako spec 41).
// ---------------------------------------------------------------------------
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const ADMIN_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';
const PAYOUTS_ENABLED = process.env.E2E_AFFILIATE_PAYOUTS === '1';

async function adminUserClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) throw new Error(`admin sign-in failed: ${error.message}`);
  return client;
}

/** Schválená provize 15 Kč (platba 300 Kč), zákazník utratil 200 MIO → refundace vrátí 100 Kč. */
async function approvedCommissionWithRefundablePayment(db: SupabaseClient) {
  const { affiliateId, customer } = await createAffiliateWithCustomer(db);
  const paymentId = await topUp(db, customer, 300, 0);
  const spent = await admin().rpc('wallet_debit_fefo', {
    p_user_id: customer, p_amount: 200, p_reason: 'spec194_spend', p_reference_id: null, p_metadata: {}, p_allow_partial: false,
  });
  expect(spent.error).toBeNull();
  expect((await admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() })).error).toBeNull();
  const [row] = await commission(db, affiliateId);
  expect(Number(row.amount_base_czk)).toBe(15);
  const { error } = await db.from('affiliate_commissions').update({ status: 'approved' }).eq('id', row.id);
  expect(error).toBeNull();
  return { affiliateId, customer, paymentId, commissionId: row.id as string };
}

async function payoutState(db: SupabaseClient, commissionId: string, paymentId: string) {
  const { data: c } = await db.from('affiliate_commissions')
    .select('status, amount_base_czk, amount_total_czk, vat_rate, payout_document_id, payout_locked_at').eq('id', commissionId).single();
  const { data: docs } = await db.from('affiliate_payout_documents')
    .select('id, document_number, amount_base_czk, amount_total_czk, vat_rate, pdf_storage_path, pdf_sha256, email_queue_id, accounting_email_queue_id')
    .eq('commission_id', commissionId);
  const { data: snaps } = await db.from('affiliate_payout_document_snapshots')
    .select('document_number, amount_base_czk, amount_total_czk, vat_rate, document_id').eq('commission_id', commissionId);
  const { data: recs } = await db.from('affiliate_commission_recoveries').select('amount_czk').eq('payment_id', paymentId);
  return { c: c!, docs: docs ?? [], snaps: snaps ?? [], recs: (recs ?? []).map((r) => Number(r.amount_czk)) };
}

/** Doklad = snapshot = provize; výsledek je buď „refundace vyhrála“ (10 / bez recovery), nebo „doklad vyhrál“ (15 / recovery 5). */
function assertConsistentOutcome(s: Awaited<ReturnType<typeof payoutState>>): 'refund_won' | 'document_won' {
  expect(s.docs).toHaveLength(1);
  expect(s.snaps).toHaveLength(1);
  const d = s.docs[0]; const sn = s.snaps[0];
  expect(sn.document_id).toBe(d.id);
  expect(sn.document_number).toBe(d.document_number);
  expect(Number(sn.amount_base_czk)).toBe(Number(d.amount_base_czk));
  expect(Number(sn.amount_total_czk)).toBe(Number(d.amount_total_czk));
  expect(Number(s.c.amount_base_czk)).toBe(Number(d.amount_base_czk));
  expect(Number(s.c.amount_total_czk)).toBe(Number(d.amount_total_czk));
  expect(s.c.status).toBe('ready_to_pay');
  expect(s.c.payout_document_id).toBe(d.id);
  expect(s.recs.length).toBeLessThanOrEqual(1);
  if (Number(d.amount_base_czk) === 10) {
    expect(s.recs.filter((x) => x !== 0)).toEqual([]);
    return 'refund_won';
  }
  expect(Number(d.amount_base_czk)).toBe(15);
  expect(s.recs).toEqual([5]);
  return 'document_won';
}

// Minimální čtení textu z PDF (pdf-lib, Identity-H + ToUnicode CMap) bez knihoven.
function pdfTextCandidates(buf: Buffer): string[] {
  const s = buf.toString('latin1');
  const streams: string[] = [];
  const re = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    const raw = buf.subarray(start, end);
    let out: string | null = null;
    for (const cut of [0, 1, 2]) {
      try { out = inflateSync(raw.subarray(0, raw.length - cut)).toString('latin1'); break; } catch { /* další pokus */ }
    }
    streams.push(out ?? raw.toString('latin1'));
    re.lastIndex = end + 9;
  }
  const utf16 = (hex: string) => {
    let r = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) r += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return r;
  };
  const cmaps = streams.filter((x) => x.includes('begincmap')).map((cm) => {
    const map = new Map<number, string>();
    for (const blk of cm.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(parseInt(p[1], 16), utf16(p[2]));
    }
    for (const blk of cm.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
        const lo = parseInt(p[1], 16); const hi = parseInt(p[2], 16);
        if (p[3].startsWith('[')) {
          const items = [...p[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => utf16(x[1]));
          items.forEach((t, i) => map.set(lo + i, t));
        } else {
          const base = utf16(p[3].slice(1, -1));
          for (let g = lo; g <= hi; g++) {
            map.set(g, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (g - lo)));
          }
        }
      }
    }
    return map;
  });
  const hexes = streams.flatMap((x) => [...x.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((mm) => mm[1]));
  const out: string[] = [];
  for (const h of hexes) {
    for (const map of cmaps) {
      let t = ''; let ok = true;
      for (let i = 0; i + 4 <= h.length; i += 4) {
        const ch = map.get(parseInt(h.slice(i, i + 4), 16));
        if (ch === undefined) { ok = false; break; }
        t += ch;
      }
      if (ok) out.push(t);
    }
  }
  return out;
}

function pdfAmount(lines: string[], label: string): number | null {
  for (const l of lines) {
    const mm = l.match(new RegExp(`${label}:\\s*([0-9\\s\\u00a0\\u202f]+,[0-9]{2})`));
    if (mm) return Number(mm[1].replace(/[\s  ]/g, '').replace(',', '.'));
  }
  return null;
}

test.describe('194 affiliate provize v Kč (staging DB + kontrakt)', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    for (const id of createdUserIds) await db.auth.admin.deleteUser(id);
  });

  test('194a: souběh měsíčního výpočtu a refundace → konzistentní provize', async () => {
    skipIfNotStaging();
    const db = admin();

    for (let round = 0; round < 3; round++) {
      const { affiliateId, customer } = await createAffiliateWithCustomer(db);
      const paymentId = await topUp(db, customer, 300, 10);
      await topUp(db, customer, 150, 0);
      // zákazník utratí 200 MIO → refundovat půjde 100 Kč z první platby
      const spent = await admin().rpc('wallet_debit_fefo', {
        p_user_id: customer, p_amount: 200, p_reason: 'spec194_spend', p_reference_id: null, p_metadata: {}, p_allow_partial: false,
      });
      expect(spent.error).toBeNull();

      const results = await Promise.all([
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() }),
        admin().rpc('prepare_stripe_refund', { p_payment_id: paymentId }),
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() }),
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() }),
      ]);
      for (const r of results) expect(r.error).toBeNull();

      const rows = await commission(db, affiliateId);
      expect(rows).toHaveLength(1);
      const lines = await linesFor(db, affiliateId);
      expect(lines).toHaveLength(2);
      expect(new Set(lines.map((l) => l.payment_id)).size).toBe(2);

      // Provize = součet jejích plateb po refundacích; refundace 100 Kč je započtena.
      const expected = Math.round(
        lines.reduce((s, l) => s + (Number(l.paid_amount_czk) - Number(l.refunded_czk)) * Number(l.commission_rate) / 100, 0) * 100,
      ) / 100;
      expect(Number(rows[0].amount_base_czk)).toBe(expected);
      expect(expected).toBe(17.5); // (300 − 100 + 150) × 5 %
    }
  });

  test('194b: souběžné opakované výpočty → bez duplicit', async () => {
    skipIfNotStaging();
    const db = admin();
    const { affiliateId, customer } = await createAffiliateWithCustomer(db);
    await topUp(db, customer, 300, 10);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() })),
    );
    for (const r of results) expect(r.error).toBeNull();

    const rows = await commission(db, affiliateId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount_base_czk)).toBe(15);
    expect(await linesFor(db, affiliateId)).toHaveLength(1);
  });

  test('194d: souběh refundace uzamčené provize a vzniku nové provize → přesné umoření', async () => {
    skipIfNotStaging();
    const db = admin();

    for (let round = 0; round < 3; round++) {
      const { affiliateId, customer } = await createAffiliateWithCustomer(db);
      const lockedPayment = await topUp(db, customer, 300, 0);
      expect((await admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() })).error).toBeNull();
      const locked = await commission(db, affiliateId);
      expect(locked).toHaveLength(1);
      const { error: lockErr } = await db.from('affiliate_commissions').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', locked[0].id);
      expect(lockErr).toBeNull();
      await topUp(db, customer, 200, 0, 1); // provize příštího měsíce: hrubá 10

      const results = await Promise.all([
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month(1) }),
        admin().from('payments').update({ status: 'refunded', refund_amount_czk: 300 }).eq('id', lockedPayment),
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month(1) }),
      ]);
      for (const r of results) expect(r.error).toBeNull();

      // Vyplacená provize beze změny, recovery 15, nová provize 10 celá umořena, zbývá 5.
      const after = await commission(db, affiliateId);
      expect(Number(after[0].amount_base_czk)).toBe(15);
      const { data: rec } = await db.from('affiliate_commission_recoveries').select('amount_czk').eq('payment_id', lockedPayment);
      expect(rec?.map((x) => Number(x.amount_czk))).toEqual([15]);
      const next = await commission(db, affiliateId, 1);
      expect(next).toHaveLength(1);
      expect(Number(next[0].gross_amount_base_czk)).toBe(10);
      expect(Number(next[0].recovery_offset_czk)).toBe(10);
      expect(Number(next[0].amount_base_czk)).toBe(0);
      const { data: alloc } = await db.from('affiliate_commission_recovery_allocations')
        .select('amount_czk, kind').eq('affiliate_id', affiliateId).is('released_at', null);
      expect(alloc?.length).toBe(1);
      expect(Number(alloc?.[0].amount_czk)).toBe(10);
    }
  });

  test('194e: souběh refundace × prepare/finalize výplatního dokladu (DB) → vždy jeden ze dvou správných výsledků', async () => {
    test.setTimeout(240_000);
    skipIfNotStaging();
    const db = admin();
    const outcomes: string[] = [];

    for (let round = 0; round < 8; round++) {
      const s = await approvedCommissionWithRefundablePayment(db);
      const issue = async () => {
        const prep = await admin().rpc('prepare_affiliate_payout_document', { p_commission_id: s.commissionId });
        expect(prep.error).toBeNull();
        expect(prep.data?.success).toBe(true);
        const fin = await admin().rpc('finalize_affiliate_payout_document', {
          p_commission_id: s.commissionId, p_document_number: prep.data.document_number,
          p_pdf_storage_path: `spec194/${s.commissionId}.pdf`, p_pdf_sha256: 'f'.repeat(64),
          p_affiliate_email_subject: 's', p_affiliate_email_body: 'b', p_accounting_email_subject: 's', p_accounting_email_body: 'b',
        });
        expect(fin.error).toBeNull();
        expect(fin.data?.success).toBe(true);
        return prep.data;
      };
      const refund = async () => {
        const r = await admin().rpc('prepare_stripe_refund', { p_payment_id: s.paymentId });
        expect(r.error).toBeNull();
      };
      // střídavě spouštíme dřív doklad / dřív refundaci
      const [a] = round % 2 === 0 ? await Promise.all([issue(), refund()]) : (await Promise.all([refund(), issue()])).reverse();
      const st = await payoutState(db, s.commissionId, s.paymentId);
      const outcome = assertConsistentOutcome(st);
      // snapshot vrácený do PDF (výstup prepare) = uložený doklad
      expect(Number(a.amount_total_czk)).toBe(Number(st.docs[0].amount_total_czk));
      outcomes.push(outcome);
      // e-maily z testovacího dokladu se neodesílají
      await db.from('email_queue').delete().in('id', [st.docs[0].email_queue_id, st.docs[0].accounting_email_queue_id]);
    }
    test.info().annotations.push({ type: 'outcomes', description: outcomes.join(',') });
    console.log('194e outcomes:', outcomes.join(','));
  });

  test('194f: skutečná Edge Function × refundace → PDF = snapshot = DB, selhání Stripe v obou pořadích', async () => {
    test.setTimeout(300_000);
    skipIfNotStaging();
    test.skip(!PAYOUTS_ENABLED || !SUPABASE_ANON || !ADMIN_EMAIL || !ADMIN_PASSWORD, 'vyžaduje E2E_AFFILIATE_PAYOUTS=1 a admin účet');
    const db = admin();
    const adminUser = await adminUserClient();
    const outcomes: string[] = [];

    for (let round = 0; round < 4; round++) {
      const s = await approvedCommissionWithRefundablePayment(db);
      const ef = () => adminUser.functions.invoke('create-affiliate-payout-document', { body: { commission_id: s.commissionId } });
      const refund = () => admin().rpc('prepare_stripe_refund', { p_payment_id: s.paymentId });
      const [efRes, refRes] = round % 2 === 0
        ? await Promise.all([ef(), refund()])
        : (await Promise.all([refund(), ef()])).reverse() as [Awaited<ReturnType<typeof ef>>, Awaited<ReturnType<typeof refund>>];
      expect(efRes.error).toBeFalsy();
      expect(efRes.data?.success).toBe(true);
      expect(refRes.error).toBeNull();

      const st = await payoutState(db, s.commissionId, s.paymentId);
      const outcome = assertConsistentOutcome(st);
      outcomes.push(outcome);
      const doc = st.docs[0];

      // PDF: stažený soubor = uložený hash; částky na PDF = doklad = snapshot = provize
      const { data: blob, error: dlErr } = await db.storage.from('affiliate-payout-docs').download(doc.pdf_storage_path);
      expect(dlErr).toBeFalsy();
      const buf = Buffer.from(await blob!.arrayBuffer());
      expect(createHash('sha256').update(buf).digest('hex')).toBe(doc.pdf_sha256);
      const lines = pdfTextCandidates(buf);
      expect(pdfAmount(lines, 'Celkem k vyplate')).toBe(Number(doc.amount_total_czk));
      expect(pdfAmount(lines, 'Zaklad')).toBe(Number(doc.amount_base_czk));

      // Stripe refundace nakonec selže → přesná obnova podle pravidel Fáze 6, doklad beze změny
      await admin().rpc('record_stripe_refund_status', { p_payment_id: s.paymentId, p_refund_id: `re_spec194_${rand()}`, p_status: 'failed' });
      const rev = await admin().rpc('reverse_failed_stripe_refund', { p_payment_id: s.paymentId, p_stripe_status: 'failed' });
      expect(rev.error).toBeNull();
      const after = await payoutState(db, s.commissionId, s.paymentId);
      expect(Number(after.docs[0].amount_total_czk)).toBe(Number(doc.amount_total_czk));
      expect(Number(after.c.amount_base_czk)).toBe(Number(doc.amount_base_czk));
      // doklad vyhrál → recovery 5 → 0; refundace vyhrála → doklad 10 a affiliate má nárok 5 (recovery −5)
      expect(after.recs).toEqual(outcome === 'document_won' ? [0] : [-5]);

      await db.from('email_queue').delete().in('id', [doc.email_queue_id, doc.accounting_email_queue_id]);
      await db.storage.from('affiliate-payout-docs').remove([doc.pdf_storage_path]);
    }
    console.log('194f outcomes:', outcomes.join(','));
  });

  test('194c: kontrakt — zákaznický základ ze zaplacených Kč, firemní větev beze změny', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('pay.paid_amount_czk IS NOT NULL');
    expect(sql).not.toMatch(/SUM\(pay\.amount\)/);
    // Firemní větev: 5 % ze zaplacené faktury bez DPH, jedna provize na fakturu.
    expect(sql).toContain("ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2)");
    expect(sql).toContain("AND pi.status = 'paid'");
    expect(sql).toContain('AND date_trunc(\'month\', pi.paid_at)::date <= v_month');
    expect(sql).toContain('ON CONFLICT (source_invoice_id) WHERE source_invoice_id IS NOT NULL DO NOTHING');
    // Vyplacená / dokladovaná provize se automaticky nemění.
    expect(sql).toContain("or (v_c.status = 'approved' and v_c.payout_document_id is null and v_c.payout_locked_at is null) then");
    // Uzamčená provize se nemění: refundace vytvoří recovery, umoření jen u stejného affiliate.
    expect(sql).toContain('insert into public.affiliate_commission_recoveries');
    expect(sql).toContain("c.affiliate_id = p_affiliate_id");
    expect(sql).toContain('exit when v_cap <= 0;');
    expect(sql).not.toMatch(/amount_base_czks*=s*-/);
    // Výplatní doklad: prepare zapisuje snapshot pod zámkem, finalize vkládá jen ze snapshotu.
    expect(sql).toContain('INSERT INTO public.affiliate_payout_document_snapshots');
    expect(sql).toContain("'payout_snapshot_amount_mismatch'");
    expect(sql).toContain('v_snap.amount_total_czk,');
    const ef = readFileSync('supabase/functions/create-affiliate-payout-document/index.ts', 'utf8');
    expect(ef).not.toMatch(/from\(["']affiliate_commissions["']\)/);
    expect(ef).toContain('amountTotal: Number(prepared.amount_total_czk)');
    // Fáze 6 nesahá na peněženky MIO ani na refundační funkce.
    expect(sql).not.toMatch(/update public\.wallets/i);
    expect(sql).not.toMatch(/create or replace function public\.(prepare_stripe_refund|reverse_failed_stripe_refund|finalize_stripe_refund)/i);
  });
});
