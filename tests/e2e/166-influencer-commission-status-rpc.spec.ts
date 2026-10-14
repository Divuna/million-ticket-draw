/**
 * Spec 166 — bezpečná serverová cesta pro změnu stavu influencerských provizí
 *
 * Řeší nález: `AdminInfluencerCommissions.tsx` měnil `influencer_commissions.status`
 * přímo přes PostgREST `.update()`. Tabulka má ale jedinou policy — SELECT pro
 * `is_superadmin()`. UPDATE policy neexistuje, takže zápis zasáhl 0 řádků, PostgREST
 * nevrátil chybu a UI hlásilo falešný úspěch nad finančním stavem.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez DB) — frontend už tabulku nezapisuje
 *   B) živé chování RPC proti staging DB (opt-in)
 *
 * Scénáře části B:
 *   166a  calculated -> approved            → povoleno
 *   166b  approved   -> paid                → povoleno
 *   166c  calculated -> paid                → zakázáno, stav se nezmění
 *   166d  paid       -> cokoli              → zakázáno, stav se nezmění
 *   166e  neoprávněný uživatel (běžný, admin bez superadmina, anon) → zamítnuto
 *   166f  hromadné paid neobejde pravidla   → all-or-nothing, nic se nezmění
 *   166g  updated_at nastavuje server       → nelze podstrčit z klienta
 *   166h  úspěšný přechod zapíše audit se starým i novým stavem
 *
 * Test si zakládá VLASTNÍ partnery, provize a uživatele a v `afterAll` je uklízí.
 * Nesahá na existující provize, partnery, peněženky ani platby.
 *
 * Required env (část B):
 *   E2E_INFLUENCER_COMMISSION_RPC=1
 *   VITE_SUPABASE_URL      - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_INFLUENCER_COMMISSION_RPC === '1';

const MIGRATION = 'supabase/migrations/20260907170000_admin_influencer_commission_status_rpc.sql';
const PAGE = 'src/pages/AdminInfluencerCommissions.tsx';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

/** Zápis přes PostgREST: `.from("influencer_commissions")` následovaný mutací. */
const WRITE_PATTERN =
  /\.from\(\s*["']influencer_commissions["']\s*\)[\s\S]{0,400}?\.(update|upsert|insert|delete)\s*\(/;

function listFiles(root: string): string[] {
  const absoluteRoot = repoPath(root);
  const result: string[] = [];

  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = join(absoluteRoot, entry);
    const relative = absolute.slice(process.cwd().length + 1).replaceAll('\\', '/');

    if (relative.includes('/node_modules/') || relative.startsWith('node_modules/')) continue;

    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      result.push(...listFiles(relative));
    } else if (/\.(ts|tsx)$/.test(relative)) {
      result.push(relative);
    }
  }

  return result;
}

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('166 kontrakt — frontend nezapisuje do influencer_commissions', () => {
  test('166i stránka výplat už tabulku neupdatuje přímo', () => {
    const page = read(PAGE);

    // Jediná povolená přímá operace nad tabulkou je čtení.
    expect(page).toContain('.from("influencer_commissions")');
    expect(page).toContain('admin_set_influencer_commission_status');
    expect(page).toContain('admin_set_influencer_commissions_paid');

    // Žádný zápis: ani jednotlivý, ani hromadný.
    expect(WRITE_PATTERN.test(page)).toBe(false);
  });

  test('166j žádný jiný frontendový soubor do tabulky nezapisuje', () => {
    const writers = listFiles('src')
      .filter((file) => {
        if (file === 'src/integrations/supabase/types.ts') return false;
        const source = read(file);
        if (!source.includes('influencer_commissions')) return false;
        return WRITE_PATTERN.test(source);
      })
      .sort();

    expect(writers).toEqual([]);
  });

  test('166k migrace drží superadmin guard, povolené přechody a granty', () => {
    const sql = read(MIGRATION);

    // Guard je superadmin, ne is_admin — is_admin() by dnešní oprávnění rozšířil.
    expect(sql).toContain('IF NOT public.is_superadmin() THEN');
    expect(sql).not.toContain('public.is_admin()');

    // Přesně dva povolené přechody.
    expect(sql).toContain("(v_current = 'calculated' AND p_new_status = 'approved')");
    expect(sql).toContain("(v_current = 'approved'   AND p_new_status = 'paid')");

    // Zámek řádku + serverový čas.
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('updated_at = now()');

    // Auditní stopa se starým i novým stavem.
    expect(sql).toContain('public.log_admin_action');
    expect(sql).toContain("jsonb_build_object('status', v_current)");
    expect(sql).toContain("jsonb_build_object('status', p_new_status)");

    // Hromadná cesta deleguje na jednotlivou, neobchází ji vlastním UPDATE.
    const bulkBody = sql.slice(sql.indexOf('admin_set_influencer_commissions_paid'));
    expect(bulkBody).toContain("public.admin_set_influencer_commission_status(v_id, 'paid')");
    expect(bulkBody).not.toContain('UPDATE public.influencer_commissions');

    // Granty: nikdy anon.
    for (const fn of [
      'public.admin_set_influencer_commission_status(uuid, text)',
      'public.admin_set_influencer_commissions_paid(uuid[])',
    ]) {
      expect(sql).toContain('REVOKE ALL ON FUNCTION ' + fn + ' FROM PUBLIC');
      expect(sql).toContain('REVOKE ALL ON FUNCTION ' + fn + ' FROM anon');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION ' + fn + ' TO authenticated');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION ' + fn + ' TO service_role');
    }

    // Obecná UPDATE policy se přidávat nesmí — zápis patří jen do RPC.
    expect(sql).not.toContain('CREATE POLICY');
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_INFLUENCER_COMMISSION_RPC=1 a staging env');
  }
}

/** Návratová hodnota obou RPC. Stav "updated" je jediný úspěšný výsledek. */
interface RpcResult {
  status?: string;
  from?: string;
  to?: string;
  updated_at?: string;
  updated_count?: number;
}

interface AuditRow {
  event: string;
  user_id: string | null;
  metadata: {
    entity_type?: string;
    entity_id?: string;
    old_data?: { status?: string };
    new_data?: { status?: string };
  };
}

const res = (data: unknown): RpcResult => (data ?? {}) as RpcResult;

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdPartnerIds: string[] = [];
const createdCommissionIds: string[] = [];
const uniq = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function seedUser(db: SupabaseClient, role?: 'admin' | 'superadmin') {
  const email = 'spec166-' + (role ?? 'user') + '-' + uniq() + '@onemil.test';
  const password = 'Spec166-' + Math.random().toString(36).slice(2, 10) + '!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('createUser failed: ' + error?.message);
  createdUserIds.push(data.user.id);
  if (role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: data.user.id, role });
    if (roleErr) throw new Error('user_roles seed failed: ' + roleErr.message);
  }
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('signIn failed: ' + error.message);
  return client;
}

/** Nová dočasná provize v zadaném stavu. Nikdy nesahá na existující řádky. */
async function seedCommission(db: SupabaseClient, status: string, monthOffset = 0) {
  const { data: partner, error: pErr } = await db
    .from('partners')
    .insert({
      name: 'E2E Spec166 ' + uniq(),
      logo_url: 'https://placehold.co/200x200/1D2128/E7EBF0?text=E2E166',
      website_url: 'https://example.test/spec166',
    })
    .select('id')
    .single();
  if (pErr || !partner) throw new Error('partner seed failed: ' + pErr?.message);
  createdPartnerIds.push(partner.id as string);

  // Vlastní partner na každou provizi kvůli UNIQUE (influencer_partner_id, period_month).
  const month = new Date(Date.UTC(2020, monthOffset % 12, 1)).toISOString().slice(0, 10);

  const { data: commission, error: cErr } = await db
    .from('influencer_commissions')
    .insert({
      influencer_partner_id: partner.id,
      period_month: month,
      amount_czk: 123.45,
      status,
    })
    .select('id, status, updated_at')
    .single();
  if (cErr || !commission) throw new Error('commission seed failed: ' + cErr?.message);
  createdCommissionIds.push(commission.id as string);

  return commission as { id: string; status: string; updated_at: string };
}

async function statusOf(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from('influencer_commissions')
    .select('status, updated_at')
    .eq('id', id)
    .single();
  if (error) throw new Error('read failed: ' + error.message);
  return data as { status: string; updated_at: string };
}

test.describe('166 živé chování admin_set_influencer_commission_status', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    if (createdCommissionIds.length) {
      await db.from('influencer_commissions').delete().in('id', createdCommissionIds);
    }
    if (createdPartnerIds.length) {
      await db.from('partners').delete().in('id', createdPartnerIds);
    }
    for (const id of createdUserIds) {
      await db.from('user_roles').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  test('166a calculated -> approved je povoleno', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const commission = await seedCommission(db, 'calculated', 1);
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'approved',
    });

    expect(error).toBeNull();
    expect(res(data).status).toBe('updated');
    expect(res(data).from).toBe('calculated');
    expect(res(data).to).toBe('approved');
    expect((await statusOf(db, commission.id)).status).toBe('approved');
  });

  test('166b approved -> paid je povoleno', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const commission = await seedCommission(db, 'approved', 2);
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'paid',
    });

    expect(error).toBeNull();
    expect(res(data).status).toBe('updated');
    expect((await statusOf(db, commission.id)).status).toBe('paid');
  });

  test('166c calculated -> paid je zakázáno a stav se nezmění', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const commission = await seedCommission(db, 'calculated', 3);
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'paid',
    });

    expect(error).toBeNull();
    expect(res(data).status).toBe('invalid_transition');
    expect(res(data).from).toBe('calculated');
    expect((await statusOf(db, commission.id)).status).toBe('calculated');
  });

  test('166d paid už nelze přepnout na jiný stav', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const commission = await seedCommission(db, 'paid', 4);
    const client = await signIn(superadmin.email, superadmin.password);

    for (const target of ['approved', 'paid']) {
      const { data, error } = await client.rpc('admin_set_influencer_commission_status', {
        p_commission_id: commission.id,
        p_new_status: target,
      });
      expect(error).toBeNull();
      expect(res(data).status).toBe('invalid_transition');
    }

    // Cíl mimo povolenou dvojici se odmítne dřív, než se sáhne na řádek.
    const { data: bogus } = await client.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'calculated',
    });
    expect(res(bogus).status).toBe('invalid_status');

    expect((await statusOf(db, commission.id)).status).toBe('paid');
  });

  test('166e neoprávněný uživatel nic nezmění', async () => {
    const db = admin();
    const plain = await seedUser(db);
    const nonSuperadmin = await seedUser(db, 'admin');
    const commission = await seedCommission(db, 'calculated', 5);

    for (const account of [plain, nonSuperadmin]) {
      const client = await signIn(account.email, account.password);
      const { data, error } = await client.rpc('admin_set_influencer_commission_status', {
        p_commission_id: commission.id,
        p_new_status: 'approved',
      });
      expect(error).toBeNull();
      expect(res(data).status).toBe('forbidden');
    }

    // Anonymní klient nemá EXECUTE vůbec.
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: anonError } = await anon.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'approved',
    });
    expect(anonError).not.toBeNull();

    expect((await statusOf(db, commission.id)).status).toBe('calculated');
  });

  test('166f hromadné paid neobejde kontrolu stavů a je all-or-nothing', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const ok = await seedCommission(db, 'approved', 6);
    const notEligible = await seedCommission(db, 'calculated', 7);
    const client = await signIn(superadmin.email, superadmin.password);

    // Dávka s jedním nezpůsobilým řádkem neprojde a NIC nezmění — ani ten způsobilý.
    const { error: rejected } = await client.rpc('admin_set_influencer_commissions_paid', {
      p_commission_ids: [ok.id, notEligible.id],
    });
    expect(rejected).not.toBeNull();
    expect((await statusOf(db, ok.id)).status).toBe('approved');
    expect((await statusOf(db, notEligible.id)).status).toBe('calculated');

    // Dávka jen ze způsobilých řádků projde.
    const { data: accepted, error: okError } = await client.rpc(
      'admin_set_influencer_commissions_paid',
      { p_commission_ids: [ok.id] }
    );
    expect(okError).toBeNull();
    expect(res(accepted).status).toBe('updated');
    expect(res(accepted).updated_count).toBe(1);
    expect((await statusOf(db, ok.id)).status).toBe('paid');

    // Neoprávněný uživatel hromadnou cestou také neprojde.
    const plain = await seedUser(db);
    const another = await seedCommission(db, 'approved', 8);
    const plainClient = await signIn(plain.email, plain.password);
    const { data: forbidden } = await plainClient.rpc('admin_set_influencer_commissions_paid', {
      p_commission_ids: [another.id],
    });
    expect(res(forbidden).status).toBe('forbidden');
    expect((await statusOf(db, another.id)).status).toBe('approved');
  });

  test('166g updated_at nastavuje server, klient ho nepodstrčí', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const commission = await seedCommission(db, 'calculated', 9);
    const before = await statusOf(db, commission.id);
    const client = await signIn(superadmin.email, superadmin.password);

    const { data } = await client.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'approved',
    });

    const after = await statusOf(db, commission.id);
    // RPC nemá parametr pro čas, takže hodnota může vzniknout jen na serveru.
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updated_at).getTime()
    );
    expect(res(data).updated_at).toBe(after.updated_at);
  });

  test('166h úspěšný přechod zapíše audit se starým i novým stavem', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const commission = await seedCommission(db, 'calculated', 10);
    const client = await signIn(superadmin.email, superadmin.password);

    await client.rpc('admin_set_influencer_commission_status', {
      p_commission_id: commission.id,
      p_new_status: 'approved',
    });

    const { data: logs, error } = await db
      .from('audit_logs')
      .select('event, user_id, metadata')
      .eq('event', 'influencer_commission_status_changed')
      .eq('user_id', superadmin.id);

    expect(error).toBeNull();
    const entry = (logs ?? []).find(
      (row) => row.metadata?.entity_id === commission.id
    ) as AuditRow | undefined;

    expect(entry).toBeTruthy();
    expect(entry.metadata.entity_type).toBe('influencer_commission');
    expect(entry.metadata.old_data.status).toBe('calculated');
    expect(entry.metadata.new_data.status).toBe('approved');
  });
});
