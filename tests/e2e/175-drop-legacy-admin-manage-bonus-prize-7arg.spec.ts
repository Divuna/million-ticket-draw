/**
 * Spec 175 — odstranění legacy 7-arg `admin_manage_bonus_prize` overload
 *
 * Řeší potvrzený audit: produkce i staging měly dvě overload signatury
 * `admin_manage_bonus_prize` — 7-arg (bez p_image_url/p_detailed_description)
 * a 9-arg (canonical, s nimi navíc). PR #416 opravil ContestDetailAdmin.tsx
 * na jednoznačné volání 9-arg; tento krok odstraňuje samotnou legacy
 * 7-arg signaturu, protože audit nenašel žádného živého volajícího, který
 * by ji potřeboval.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez síťového volání) — obsah nové
 *      migrace + oba frontend call sites + historické migrace nedotčeny
 *   B) živé chování proti staging DB (opt-in) — po migraci existuje jen
 *      9-arg, obě volání fungují, autorizace beze změny, žádná ambiguity
 *
 * Mimo rozsah (nedotčeno touto opravou, a tedy i tímto spec souborem):
 * tělo 9-arg RPC, bonus_prizes RLS, Edge Functions, business logika
 * bonusových výher, MioCoin logika, ticket engine, winners, soutěžní
 * logika, Sofinity, historické migrace, rollback dokumenty.
 *
 * Required env (část B):
 *   E2E_DROP_LEGACY_BONUS_PRIZE_OVERLOAD=1
 *   VITE_SUPABASE_URL      - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_DROP_LEGACY_BONUS_PRIZE_OVERLOAD === '1';

const MIGRATION = 'supabase/migrations/20260908120000_drop_legacy_admin_manage_bonus_prize_7arg.sql';
const CONTEST_DETAIL_ADMIN = 'src/components/ContestDetailAdmin.tsx';
const ADMIN_CONTEST_MANAGEMENT = 'src/components/AdminContestManagement.tsx';

const HISTORICAL_MIGRATIONS = [
  'supabase/migrations/20250921025951_.sql',
  'supabase/migrations/20250921145952_157f6257-2317-40cd-ad32-0ffc6ba84df8.sql',
  'supabase/migrations/20260415_fix_admin_manage_bonus_prize_image_url.sql',
  'supabase/migrations/20260415_fix_admin_manage_bonus_prize_detailed_description.sql',
];
const ROLLBACK_DOCS = [
  'docs/rollback/phase1_baseline.sql',
  'docs/rollback/phase1_production_apply.sql',
  'docs/rollback/phase1_production_rollback.sql',
  'docs/rollback/phase1_production_verification.sql',
];

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const historicalHashesBefore: Record<string, string> = {};

test.beforeAll(() => {
  // Capture hashes so 175d can assert byte-identical content — historical
  // migrations and rollback docs must not be touched by this cleanup.
  for (const path of [...HISTORICAL_MIGRATIONS, ...ROLLBACK_DOCS]) {
    historicalHashesBefore[path] = createHash('sha256').update(read(path)).digest('hex');
  }
});

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('175 kontrakt — drop legacy admin_manage_bonus_prize 7-arg overload', () => {
  test('175a nová migrace maže výhradně přesnou 7-arg signaturu', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(
      /DROP FUNCTION public\.admin_manage_bonus_prize\(\s*uuid,\s*uuid,\s*text,\s*integer,\s*numeric,\s*text,\s*text\s*\)/,
    );
    // Nesmí obsahovat 9-arg signaturu v žádném DROP.
    expect(sql).not.toMatch(/DROP FUNCTION[\s\S]*?p_image_url/i);
    expect(sql).not.toMatch(/DROP FUNCTION[\s\S]*?p_detailed_description/i);
  });

  test('175b migrace nemění tělo 9-arg RPC ani nic mimo tuto jednu DROP FUNCTION', () => {
    const sql = read(MIGRATION);
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();

    // Jediný skutečný SQL příkaz mimo BEGIN/COMMIT je ten jeden DROP FUNCTION.
    expect(executable).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(executable).not.toMatch(/ALTER TABLE|CREATE POLICY|DROP POLICY/i);
    expect(executable).not.toMatch(/INSERT INTO|UPDATE public\.|DELETE FROM/i);
  });

  test('175c oba live frontend call sites zůstávají kompatibilní s 9-arg (posílají p_image_url a p_detailed_description)', () => {
    for (const path of [CONTEST_DETAIL_ADMIN, ADMIN_CONTEST_MANAGEMENT]) {
      const src = read(path);
      const rpcCallMatch = src.match(/supabase\.rpc\("admin_manage_bonus_prize",\s*\{[\s\S]*?\}\)/);
      expect(rpcCallMatch).not.toBeNull();
      const rpcCall = rpcCallMatch![0];
      expect(rpcCall).toContain('p_image_url');
      expect(rpcCall).toContain('p_detailed_description');
    }
  });

  test('175d historické migrace a rollback dokumenty zůstávají byte-identické (nepřepsány)', () => {
    for (const path of [...HISTORICAL_MIGRATIONS, ...ROLLBACK_DOCS]) {
      const hashNow = createHash('sha256').update(read(path)).digest('hex');
      expect(hashNow, `${path} must stay byte-identical`).toBe(historicalHashesBefore[path]);
    }
  });

  test('175e žádná Edge Function ani jiný aktivní zdroj nevolá admin_manage_bonus_prize', () => {
    // Statický negative-check nad zdrojem: jediní dva volající v repu jsou
    // ty dva prověřené frontend soubory (viz 175c).
    const out = execSync(
      'grep -rl "admin_manage_bonus_prize" supabase/functions src --include=*.ts --include=*.tsx',
      { cwd: resolve(process.cwd()), encoding: 'utf8' },
    ).trim();
    const matches = out.split('\n').filter(Boolean).sort();
    expect(matches).toEqual(
      [CONTEST_DETAIL_ADMIN, ADMIN_CONTEST_MANAGEMENT, 'src/integrations/supabase/types.ts'].sort(),
    );
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_DROP_LEGACY_BONUS_PRIZE_OVERLOAD=1 a staging env');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdContestIds: string[] = [];
const uniq = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function seedUser(db: SupabaseClient, role?: 'admin' | 'superadmin') {
  const email = 'spec175-' + (role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec175-' + Math.random().toString(36).slice(2, 10) + '!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('createUser failed: ' + error?.message);
  const userId = data.user.id;
  createdUserIds.push(userId);
  if (role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: userId, role });
    if (roleErr) throw new Error('user_roles seed failed: ' + roleErr.message);
  }
  return { id: userId, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('signIn failed: ' + error.message);
  return client;
}

async function seedContest(db: SupabaseClient) {
  const { data, error } = await db
    .from('contests')
    .insert({
      title: 'Spec175 drop-overload test contest ' + uniq(),
      status: 'draft',
      ticket_count: 1000,
      ticket_price: 1,
      main_prize: 'Spec175 probe',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('seedContest failed: ' + error?.message);
  createdContestIds.push(data.id);
  return data.id as string;
}

test.describe('175 živé chování — po odstranění legacy 7-arg overload', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    if (createdContestIds.length) {
      await db.from('bonus_prizes').delete().in('contest_id', createdContestIds);
      await db.from('admin_actions').delete().in('target_id', createdContestIds);
      await db.from('contests').delete().in('id', createdContestIds);
    }
    for (const id of createdUserIds) {
      await db.from('user_roles').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  test('175-2 starý ambiguous 5-arg tvar volání už nevrací "is not unique"', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: '00000000-0000-0000-0000-000000000000',
      p_description: 'spec175-old-shape',
      p_ticket_position: 1,
      p_amount: null,
    });
    // No ambiguity error anymore. Fails only on the harmless
    // "contest not found" business check, not on overload resolution.
    if (error) {
      expect(error.message).not.toContain('is not unique');
      expect(error.message).toContain('neexistuje');
    }
  });

  test('175-3 ContestDetailAdmin.tsx tvar volání funguje pro superadmina', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: contestId,
      p_description: 'spec175-contestdetail',
      p_ticket_position: 1,
      p_amount: null,
      p_image_url: null,
      p_detailed_description: null,
    });
    expect(error).toBeNull();
    expect((data as { success: boolean } | null)?.success).toBe(true);
  });

  test('175-4 AdminContestManagement.tsx tvar volání funguje pro superadmina', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_manage_bonus_prize', {
      p_contest_id: contestId,
      p_ticket_position: 1,
      p_description: 'spec175-adminmgmt',
      p_detailed_description: null,
      p_status: 'pending',
      p_operation: 'create',
      p_image_url: null,
    });
    expect(error).toBeNull();
    expect((data as { success: boolean } | null)?.success).toBe(true);
  });

  test('175-5 canonical admin (bez superadmin role) je odmítnut i po odstranění overloadu', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const adminUser = await seedUser(db, 'admin');
    const client = await signIn(adminUser.email, adminUser.password);

    const { data, error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: contestId,
      p_description: 'spec175-admin-denied',
      p_ticket_position: 1,
      p_amount: null,
      p_image_url: null,
      p_detailed_description: null,
    });
    expect(error).toBeNull();
    expect((data as { success: boolean } | null)?.success).toBe(false);
    expect((data as { message?: string } | null)?.message).toContain(
      'Pouze administrátoři mohou spravovat bonusové výhry',
    );

    const rows = await db.from('bonus_prizes').select('id').eq('contest_id', contestId);
    expect(rows.data?.length ?? 0).toBe(0);
  });
});
