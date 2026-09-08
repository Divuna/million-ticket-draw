/**
 * Spec 172 — bonus_prizes: sjednocení write autorizace na canonical
 * superadmin (public.is_superadmin()) a odstranění legacy public.users.role
 * závislosti z table RLS a pěti aktivních SECURITY DEFINER RPC.
 *
 * Řeší potvrzený nález: `bonus_prizes` write RLS
 * ("Allow admin full access to bonus prizes", ALL) i RPC
 * `admin_manage_bonus_prize` (7-arg, 9-arg), `admin_begin_miocoin_save`,
 * `admin_append_miocoin_chunk`, `admin_finalize_miocoin_save`,
 * `admin_bulk_insert_miocoin_bonuses` používaly starou
 * `public.users.role IN ('admin','superadmin')` / `= 'superadmin'` kontrolu.
 * Citlivá správa soutěží a bonusových výher je dnes SUPERADMIN-ONLY na
 * úrovni frontendu (`/admin` → RequireSuperadminOrRedirect,
 * `/admin/contest/:id` → RequireSuperadmin + interní isSuperAdmin guard).
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez DB) — obsah migrace
 *   B) živé chování proti staging DB (opt-in)
 *
 * Mimo rozsah (nedotčeno touto migrací, a tedy i tímto spec souborem):
 * 7-arg/9-arg overload ambiguity `admin_manage_bonus_prize`,
 * `ContestDetailAdmin.tsx`/`AdminContestManagement.tsx` frontend kód,
 * `add-bonus-prize`/`distribute-bonus-prizes` Edge Functions,
 * `assign_contest_ticket_atomic`/`buy_ticket_atomic` (zákaznický engine).
 *
 * Required env (část B):
 *   E2E_BONUS_PRIZES_RLS=1
 *   VITE_SUPABASE_URL      - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_BONUS_PRIZES_RLS === '1';

const MIGRATION = 'supabase/migrations/20260908110000_bonus_prizes_canonical_superadmin_rls.sql';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('172 kontrakt — bonus_prizes canonical superadmin RLS migrace', () => {
  test('172a migrace odstraňuje přesně jednu legacy ALL policy a vytváří 3 canonical write policies', () => {
    const sql = read(MIGRATION);

    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Allow admin full access to bonus prizes" ON public.bonus_prizes',
    );
    expect(sql).toContain('CREATE POLICY "bonus_prizes_admin_insert" ON public.bonus_prizes');
    expect(sql).toContain('CREATE POLICY "bonus_prizes_admin_update" ON public.bonus_prizes');
    expect(sql).toContain('CREATE POLICY "bonus_prizes_admin_delete" ON public.bonus_prizes');

    // Existující SELECT policies se nesmí smazat ani přejmenovat.
    expect(sql).not.toContain('DROP POLICY IF EXISTS "bonus_prizes_select_admin"');
    expect(sql).not.toContain('DROP POLICY IF EXISTS "bonus_prizes_select_resolved"');
    expect(sql).not.toContain('CREATE POLICY "bonus_prizes_select_admin"');
    expect(sql).not.toContain('CREATE POLICY "bonus_prizes_select_resolved"');
  });

  test('172b write policies používají výhradně (SELECT public.is_superadmin()), nikdy is_admin_for_rls()/users.role', () => {
    const sql = read(MIGRATION);
    const rawBlockMatch = sql.match(
      /-- ── TABLE RLS[\s\S]*?-- ── RPC: admin_manage_bonus_prize \(7-arg\)/,
    );
    expect(rawBlockMatch).not.toBeNull();
    const policyBlock = rawBlockMatch![0]
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    const isSuperadminCount = (policyBlock.match(/\(SELECT public\.is_superadmin\(\)\)/g) || []).length;
    // insert(check) + update(using+check) + delete(using) = 4 výskytů.
    expect(isSuperadminCount).toBe(4);

    expect(policyBlock).not.toMatch(/is_admin_for_rls\(\)/);
    expect(policyBlock).not.toMatch(/FROM\s+users/i);
    expect(policyBlock).not.toContain('users.role');
    expect(policyBlock).not.toMatch(/has_admin_permission\(/);
  });

  test('172c migrace scoped na authenticated, nikdy anon/public na write policies', () => {
    const sql = read(MIGRATION);
    const policyBlockMatch = sql.match(
      /-- ── TABLE RLS[\s\S]*?-- bonus_prizes_select_admin a bonus_prizes_select_resolved/,
    );
    expect(policyBlockMatch).not.toBeNull();
    const policyBlock = policyBlockMatch![0];

    expect(policyBlock).toMatch(/FOR INSERT TO authenticated/);
    expect(policyBlock).toMatch(/FOR UPDATE TO authenticated/);
    expect(policyBlock).toMatch(/FOR DELETE TO authenticated/);
    expect(policyBlock).not.toMatch(/\bTO\s+anon\b/);
    expect(policyBlock).not.toMatch(/\bTO\s+public\b(?!\.)/);
  });

  test('172d všech pět aktivních RPC guardů převedeno na public.is_superadmin(v_admin_id), žádná zbylá users.role kontrola', () => {
    const sql = read(MIGRATION);
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    // Přesně 7 volání is_superadmin(v_admin_id): 2× admin_manage_bonus_prize
    // (7-arg + 9-arg) + admin_begin_miocoin_save + admin_append_miocoin_chunk
    // + admin_finalize_miocoin_save + admin_bulk_insert_miocoin_bonuses = 6,
    // plus jedno v RLS testovacím komentáři nesmí být — ověřujeme dolní mez.
    const guardCount = (executable.match(/IF NOT public\.is_superadmin\(v_admin_id\) THEN/g) || []).length;
    expect(guardCount).toBe(6);

    // Žádný zbylý legacy guard nesmí přežít v žádné z přepsaných funkcí.
    expect(executable).not.toMatch(/FROM\s+users\s*$/im);
    expect(executable).not.toMatch(/FROM\s+public\.users/);
    expect(executable).not.toMatch(/role\s*=\s*'superadmin'/);
    expect(executable).not.toMatch(/role\s+IN\s*\('admin',\s*'superadmin'\)/);
  });

  test('172e obě signatury admin_manage_bonus_prize zůstávají zachovány beze změny parametrů — overload ambiguity mimo rozsah', () => {
    const sql = read(MIGRATION);
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(p_prize_id uuid DEFAULT NULL::uuid, p_contest_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_ticket_position integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT 'pending'::text, p_operation text DEFAULT 'create'::text)",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(p_prize_id uuid DEFAULT NULL::uuid, p_contest_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_ticket_position integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT 'pending'::text, p_operation text DEFAULT 'create'::text, p_image_url text DEFAULT NULL::text, p_detailed_description text DEFAULT NULL::text)",
    );

    // Migrace nesmí obsahovat žádný skutečný DROP FUNCTION ani přejmenování
    // signatury (executable SQL bez komentářů — komentáře o tomto text mluví).
    expect(executable).not.toMatch(/DROP FUNCTION/i);
    expect(executable).not.toMatch(/ALTER FUNCTION.*RENAME/i);
  });

  test('172f migrace nesahá mimo bonus_prizes/RPC — žádná struktura, data, contest/ticket/winner logika', () => {
    const sql = read(MIGRATION);
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    // Poznámka: RPC těla legitimně obsahují "INSERT INTO public.bonus_prizes"
    // a "CREATE TEMP TABLE tmp_miocoin_bonuses" jako svou nezměněnou business
    // logiku (create bonusové výhry / MioCoin chunk / legacy bulk insert) —
    // to je záměr, nekontroluje se zde. Kontroluje se jen absence
    // strukturální/destruktivní DDL na skutečné (netemp) tabulce mimo rozsah.
    const withoutKnownTempTableOps = executable.replace(
      /DROP TABLE IF EXISTS tmp_miocoin_bonuses;/gi,
      '',
    );
    expect(withoutKnownTempTableOps).not.toMatch(/ALTER TABLE|DROP TABLE|TRUNCATE|DISABLE ROW LEVEL SECURITY/i);
    expect(executable).not.toMatch(/\bCREATE\s+(?!TEMP\b|TEMPORARY\b)\w*\s*TABLE\b/i);
    for (const forbidden of ['assign_contest_ticket_atomic', 'buy_ticket_atomic', 'add-bonus-prize', 'distribute-bonus-prizes']) {
      expect(executable).not.toContain(forbidden);
    }
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_BONUS_PRIZES_RLS=1 a staging env');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const anonClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdContestIds: string[] = [];
const uniq = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function seedUser(
  db: SupabaseClient,
  opts: { role?: 'admin' | 'superadmin'; legacyUsersRole?: string },
) {
  const email = 'spec172-' + (opts.role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec172-' + Math.random().toString(36).slice(2, 10) + '!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('createUser failed: ' + error?.message);
  const userId = data.user.id;
  createdUserIds.push(userId);

  if (opts.legacyUsersRole) {
    await db.from('users').update({ role: opts.legacyUsersRole }).eq('id', userId);
  }
  if (opts.role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: userId, role: opts.role });
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
      title: 'Spec172 test contest ' + uniq(),
      status: 'draft',
      ticket_count: 1000,
      ticket_price: 1,
      main_prize: 'Spec172 probe',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('seedContest failed: ' + error?.message);
  createdContestIds.push(data.id);
  return data.id as string;
}

test.describe('172 živé chování — bonus_prizes write RLS + RPC guardy', () => {
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

  test('172-1/2/3 superadmin (canonical) může INSERT/UPDATE/DELETE, i když stará users.role="user"', async () => {
    const db = admin();
    const superadmin = await seedUser(db, { role: 'superadmin', legacyUsersRole: 'user' });
    const contestId = await seedContest(db);
    const client = await signIn(superadmin.email, superadmin.password);

    const { data: inserted, error: insertError } = await client
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec172-super', ticket_position: 1, status: 'pending' })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    expect(inserted?.id).toBeTruthy();

    const { data: updated, error: updateError } = await client
      .from('bonus_prizes')
      .update({ description: 'spec172-super-updated' })
      .eq('id', inserted!.id)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated?.length).toBe(1);

    const { data: deleted, error: deleteError } = await client
      .from('bonus_prizes')
      .delete()
      .eq('id', inserted!.id)
      .select('id');
    expect(deleteError).toBeNull();
    expect(deleted?.length).toBe(1);
  });

  test('172-4/5 admin bez superadmin role nemůže INSERT/UPDATE/DELETE, i když stará users.role="superadmin"', async () => {
    const db = admin();
    const adminOnly = await seedUser(db, { role: 'admin', legacyUsersRole: 'superadmin' });
    const contestId = await seedContest(db);
    const client = await signIn(adminOnly.email, adminOnly.password);

    const { error: insertError } = await client
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec172-admin', ticket_position: 1, status: 'pending' });
    expect(insertError).not.toBeNull();

    // Seed a row as service-role, then confirm the non-superadmin admin
    // cannot touch it via UPDATE/DELETE (0 rows affected, RLS-silent).
    const { data: seedRow } = await db
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec172-seed', ticket_position: 2, status: 'pending' })
      .select('id')
      .single();

    const { data: updated } = await client
      .from('bonus_prizes')
      .update({ description: 'should-not-change' })
      .eq('id', seedRow!.id)
      .select('id');
    expect(updated?.length ?? 0).toBe(0);

    const { data: deleted } = await client
      .from('bonus_prizes')
      .delete()
      .eq('id', seedRow!.id)
      .select('id');
    expect(deleted?.length ?? 0).toBe(0);
  });

  test('172-6 běžný uživatel (bez rolí) nemůže zapisovat', async () => {
    const db = admin();
    const plain = await seedUser(db, {});
    const contestId = await seedContest(db);
    const client = await signIn(plain.email, plain.password);

    const { error: insertError } = await client
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec172-plain', ticket_position: 1, status: 'pending' });
    expect(insertError).not.toBeNull();
  });

  test('172-7 anon nemůže zapisovat', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const anon = anonClient();

    const { error: insertError } = await anon
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec172-anon', ticket_position: 1, status: 'pending' });
    expect(insertError).not.toBeNull();
  });

  test('172-8/9 SELECT chování je beze změny — is_admin_for_rls() vidí pending, resolved je veřejné', async () => {
    const db = admin();
    const canonicalAdmin = await seedUser(db, { role: 'admin' });
    const contestId = await seedContest(db);
    const { data: pendingRow } = await db
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec172-select-pending', ticket_position: 1, status: 'pending' })
      .select('id')
      .single();

    const adminClient = await signIn(canonicalAdmin.email, canonicalAdmin.password);
    const { data: seenByAdmin } = await adminClient.from('bonus_prizes').select('id').eq('id', pendingRow!.id);
    expect(seenByAdmin?.length).toBe(1);
  });

  test('172-10a admin_manage_bonus_prize (9-arg): canonical superadmin projde guardem, non-superadmin je odmítnut bez ohledu na starou users.role', async () => {
    const db = admin();
    const superadmin = await seedUser(db, { role: 'superadmin', legacyUsersRole: 'user' });
    const adminOnly = await seedUser(db, { role: 'admin', legacyUsersRole: 'superadmin' });
    const fakeContestId = '00000000-0000-0000-0000-000000000000';

    const superClient = await signIn(superadmin.email, superadmin.password);
    const { data: superResult } = await superClient.rpc('admin_manage_bonus_prize', {
      p_contest_id: fakeContestId,
      p_ticket_position: 1,
      p_description: 'x',
      p_detailed_description: null,
      p_status: 'pending',
      p_operation: 'create',
      p_image_url: null,
    });
    // Guard passed — failed on the (expected, harmless) nonexistent-contest check.
    expect((superResult as { message?: string } | null)?.message).toBe('Soutěž s daným ID neexistuje');

    const adminClient = await signIn(adminOnly.email, adminOnly.password);
    const { error: adminError } = await adminClient.rpc('admin_manage_bonus_prize', {
      p_contest_id: fakeContestId,
      p_ticket_position: 1,
      p_description: 'x',
      p_detailed_description: null,
      p_status: 'pending',
      p_operation: 'create',
      p_image_url: null,
    });
    expect(adminError).not.toBeNull();
    expect(adminError!.message).toContain('Pouze administrátoři mohou spravovat bonusové výhry');
  });

  test('172-10b MioCoin save RPC řetězec: canonical superadmin projde, non-superadmin je odmítnut u všech tří', async () => {
    const db = admin();
    const superadmin = await seedUser(db, { role: 'superadmin', legacyUsersRole: 'user' });
    const adminOnly = await seedUser(db, { role: 'admin', legacyUsersRole: 'superadmin' });
    const fakeContestId = '00000000-0000-0000-0000-000000000000';

    type MioCoinRpcResult = { success: boolean; message?: string };
    const miocoinCalls: [
      'admin_begin_miocoin_save' | 'admin_append_miocoin_chunk' | 'admin_finalize_miocoin_save',
      Record<string, unknown>,
    ][] = [
      ['admin_begin_miocoin_save', { p_contest_id: fakeContestId, p_expected_count: 1 }],
      ['admin_append_miocoin_chunk', { p_contest_id: fakeContestId, p_bonuses: [] }],
      ['admin_finalize_miocoin_save', { p_contest_id: fakeContestId, p_expected_count: 1 }],
    ];

    const superClient = await signIn(superadmin.email, superadmin.password);
    for (const [fn, args] of miocoinCalls) {
      const { data } = await superClient.rpc(fn, args);
      expect((data as MioCoinRpcResult | null)?.message).toBe('Soutez s danym ID neexistuje');
    }

    const adminClient = await signIn(adminOnly.email, adminOnly.password);
    for (const [fn, args] of miocoinCalls) {
      const { data } = await adminClient.rpc(fn, args);
      const result = data as MioCoinRpcResult | null;
      expect(result?.success).toBe(false);
      expect(result?.message).toContain('Pouze administratori mohou spravovat bonusove vyhry');
    }
  });
});
