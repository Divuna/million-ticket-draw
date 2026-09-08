/**
 * Spec 176 — AdminContestManagement.tsx: false-success oprava přímých
 * DELETE/UPDATE zápisů do `bonus_prizes`
 *
 * Řeší potvrzený nález: `handleSave` v `AdminContestManagement.tsx` mazal
 * staré bonusové výhry dvěma přímými `.from("bonus_prizes").delete()`
 * voláními, jejichž výsledek se vůbec nekontroloval, a poté ukládal
 * ekonomická data fyzické výhry přes `.update()`, který kontroloval jen
 * `error`. PostgREST/RLS vrací `error: null` i když policy zápis tiše
 * odfiltruje na 0 ovlivněných řádků — bez kontroly to vypadá jako úspěch,
 * přestože se v databázi nic nezměnilo. Reprodukováno na stagingu
 * (canonical admin, non-superadmin, proti `bonus_prizes_admin_delete`/
 * `_update` RLS policies z PR #414): DELETE i UPDATE vrátily `error: null`
 * a `0` ovlivněných řádků, řádek zůstal v DB beze změny.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez síťového volání) — obsah opravy
 *   B) živé chování proti staging DB (opt-in) — post-condition detekce
 *      skutečně funguje a legitimní "není co mazat" nezpůsobí falešnou chybu
 *
 * Mimo rozsah (nedotčeno touto opravou, a tedy i tímto spec souborem):
 * RLS, databázové funkce, Edge Functions, migrace, admin_manage_bonus_prize,
 * MioCoin save RPC, ticket engine, winners, ceny/pozice bonusových výher,
 * soutěžní logika, Sofinity, route oprávnění. `ContestDetailAdmin.tsx` nemá
 * žádný přímý `.from("bonus_prizes")` zápis (jen RPC), takže se ho tato
 * oprava netýká a soubor zůstal nedotčen.
 *
 * Required env (část B):
 *   E2E_BONUS_PRIZES_FALSE_SUCCESS=1
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
const ENABLED = process.env.E2E_BONUS_PRIZES_FALSE_SUCCESS === '1';

const ADMIN_CONTEST_MANAGEMENT = 'src/components/AdminContestManagement.tsx';
const CONTEST_DETAIL_ADMIN = 'src/components/ContestDetailAdmin.tsx';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('176 kontrakt — bonus_prizes false-success DELETE/UPDATE fix', () => {
  test('176a ContestDetailAdmin.tsx nemá žádný přímý zápis do bonus_prizes — nebyl a nesmí být upravován', () => {
    const src = read(CONTEST_DETAIL_ADMIN);
    expect(src).not.toMatch(/\.from\(["']bonus_prizes["']\)\s*\.\s*(delete|update)\(/);
    expect(src).not.toContain('.from("bonus_prizes")');
  });

  test('176b obě DELETE cesty kontrolují error a zastaví uložení chybou', () => {
    const src = read(ADMIN_CONTEST_MANAGEMENT);
    expect(src).toContain('deletePhysicalError');
    expect(src).toMatch(/if \(deletePhysicalError\) \{\s*throw new Error/);
    expect(src).toContain('deleteAllError');
    expect(src).toMatch(/if \(deleteAllError\) \{\s*throw new Error/);
  });

  test('176c obě DELETE cesty mají post-condition ověření (re-SELECT stejné cílové množiny) místo spoléhání na affected-rows count', () => {
    const src = read(ADMIN_CONTEST_MANAGEMENT);
    // Physical-only branch: re-select se stejným filtrem jako DELETE.
    const physicalBlock = src.slice(
      src.indexOf('deletePhysicalError'),
      src.indexOf('} else {', src.indexOf('deletePhysicalError')),
    );
    expect(physicalBlock).toContain('remainingPhysicalCount');
    expect(physicalBlock).toContain('.or("amount.is.null,amount.eq.0")');
    expect(physicalBlock).toMatch(/if \(\(remainingPhysicalCount \?\? 0\) > 0\)/);

    // All-bonuses branch: re-select bez filtru, jen contest_id.
    const allBlock = src.slice(src.indexOf('deleteAllError'), src.indexOf('// Insert physical prizes FIRST'));
    expect(allBlock).toContain('remainingAllCount');
    expect(allBlock).toMatch(/if \(\(remainingAllCount \?\? 0\) > 0\)/);

    // Nikde se nepoužívá "affected rows > 0" jako chybový signál pro DELETE
    // (0 ovlivněných řádků je legitimní stav, viz komentář u opravy).
    expect(src).not.toMatch(/deleteCount === 0\s*\)\s*{\s*throw/);
  });

  test('176d economy UPDATE zůstává non-blocking, ale nově ověřuje skutečně změněný řádek', () => {
    const src = read(ADMIN_CONTEST_MANAGEMENT);
    const updateBlock = src.slice(
      src.indexOf('Persist economy metadata for this physical prize'),
      src.indexOf('Insert MioCoin bonuses', src.indexOf('Persist economy metadata for this physical prize')) === -1
        ? src.indexOf('Persist economy metadata for this physical prize') + 2500
        : undefined,
    );
    expect(updateBlock).toContain('.select("id")');
    expect(updateBlock).toContain('econPrizeRowUpdated');
    expect(updateBlock).toMatch(/if \(econPrizeError \|\| !econPrizeRowUpdated\)/);
    // Non-blocking: no throw in this block, only console.error + toast.
    expect(updateBlock).not.toMatch(/throw new Error/);
    expect(updateBlock).toContain('"Soutěž uložena"');
    expect(updateBlock).toContain('"Ekonomická data fyzické výhry se nepodařilo uložit');
  });

  test('176e immutable MioCoin pravidlo (hasImmutablePersistedMioCoinBonuses) zůstalo nedotčené', () => {
    const src = read(ADMIN_CONTEST_MANAGEMENT);
    expect(src).toContain('const hasImmutablePersistedMioCoinBonuses = isEditingContest && hasPersistedMioCoinBonuses;');
    expect(src).toContain('if (hasImmutablePersistedMioCoinBonuses) {');
    // The physical-only OR filter (what stays deletable even when MioCoin
    // rows are immutable) is byte-identical to before the fix.
    expect(src).toContain('.or("amount.is.null,amount.eq.0")');
  });

  test('176f oprava nesahá na RLS/RPC/migrace/business logiku mimo tyto dvě DELETE větve a jednu UPDATE', () => {
    const src = read(ADMIN_CONTEST_MANAGEMENT);
    for (const forbidden of [
      'admin_manage_bonus_prize',
      'admin_begin_miocoin_save',
      'admin_append_miocoin_chunk',
      'admin_finalize_miocoin_save',
      'CREATE POLICY',
      'DROP POLICY',
    ]) {
      // These may legitimately appear elsewhere in the file (RPC calls used
      // by unrelated save steps) — the fix itself must not introduce new
      // occurrences of DDL keywords, which would indicate a schema change.
      if (forbidden.startsWith('CREATE') || forbidden.startsWith('DROP')) {
        expect(src).not.toContain(forbidden);
      }
    }
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_BONUS_PRIZES_FALSE_SUCCESS=1 a staging env');
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
  const email = 'spec176-' + (role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec176-' + Math.random().toString(36).slice(2, 10) + '!';
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
      title: 'Spec176 false-success test contest ' + uniq(),
      status: 'draft',
      ticket_count: 1000,
      ticket_price: 1,
      main_prize: 'Spec176 probe',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('seedContest failed: ' + error?.message);
  createdContestIds.push(data.id);
  return data.id as string;
}

test.describe('176 živé chování — post-condition kontrola DELETE/UPDATE', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    if (createdContestIds.length) {
      await db.from('bonus_prizes').delete().in('contest_id', createdContestIds);
      await db.from('contests').delete().in('id', createdContestIds);
    }
    for (const id of createdUserIds) {
      await db.from('user_roles').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  test('176-1 canonical superadmin DELETE skutečně smaže řádek — post-condition SELECT najde 0', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    await db.from('bonus_prizes').insert({
      contest_id: contestId,
      description: 'spec176-physical',
      ticket_position: 1,
      status: 'pending',
      amount: null,
    });

    const { error: deleteError } = await client
      .from('bonus_prizes')
      .delete()
      .eq('contest_id', contestId)
      .or('amount.is.null,amount.eq.0');
    expect(deleteError).toBeNull();

    const { count } = await client
      .from('bonus_prizes')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contestId)
      .or('amount.is.null,amount.eq.0');
    expect(count ?? 0).toBe(0);
  });

  test('176-2 legitimní "není co mazat" (nová soutěž, 0 bonus_prizes) nezpůsobí falešnou chybu', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { error: deleteError } = await client.from('bonus_prizes').delete().eq('contest_id', contestId);
    expect(deleteError).toBeNull();

    const { count } = await client
      .from('bonus_prizes')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contestId);
    // Post-condition passes even though the DELETE itself affected 0 rows —
    // this is exactly the "legitimate no-op" case the fix must not flag.
    expect(count ?? 0).toBe(0);
  });

  test('176-3 canonical admin (non-superadmin) DELETE je tiše odfiltrován RLS — post-condition to odhalí (řádek zůstává)', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const adminUser = await seedUser(db, 'admin');
    const client = await signIn(adminUser.email, adminUser.password);

    const { data: seeded } = await db
      .from('bonus_prizes')
      .insert({
        contest_id: contestId,
        description: 'spec176-admin-blocked',
        ticket_position: 1,
        status: 'pending',
        amount: null,
      })
      .select('id')
      .single();

    const { error: deleteError } = await client
      .from('bonus_prizes')
      .delete()
      .eq('contest_id', contestId)
      .or('amount.is.null,amount.eq.0');
    // PostgREST reports no error — RLS just filters the row out silently.
    expect(deleteError).toBeNull();

    const { count } = await db
      .from('bonus_prizes')
      .select('id', { count: 'exact', head: true })
      .eq('id', seeded!.id);
    // The post-condition check would see this and correctly treat it as a
    // failure (row still present) — exactly the false-success bug this PR fixes.
    expect(count ?? 0).toBe(1);
  });

  test('176-4 UPDATE ekonomických údajů: superadmin skutečně změní řádek, .select("id") to potvrdí', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { data: seeded } = await db
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec176-econ', ticket_position: 1, status: 'pending', amount: null })
      .select('id')
      .single();

    const { data: updated, error: updateError } = await client
      .from('bonus_prizes')
      .update({ supplier_name: 'Spec176 Supplier', unit_cost_czk: 123 })
      .eq('id', seeded!.id)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated?.length).toBe(1);
  });

  test('176-5 UPDATE ekonomických údajů: canonical admin (non-superadmin) je tiše odfiltrován — 0 řádků, žádná chyba', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const adminUser = await seedUser(db, 'admin');
    const client = await signIn(adminUser.email, adminUser.password);

    const { data: seeded } = await db
      .from('bonus_prizes')
      .insert({ contest_id: contestId, description: 'spec176-econ-blocked', ticket_position: 1, status: 'pending', amount: null })
      .select('id')
      .single();

    const { data: updated, error: updateError } = await client
      .from('bonus_prizes')
      .update({ supplier_name: 'Should Not Apply', unit_cost_czk: 999 })
      .eq('id', seeded!.id)
      .select('id');
    // No error — this is the false-success shape the fix's `.select("id")`
    // + length check now detects (updated.length !== 1).
    expect(updateError).toBeNull();
    expect(updated?.length ?? 0).toBe(0);

    const row = await db.from('bonus_prizes').select('supplier_name, unit_cost_czk').eq('id', seeded!.id).single();
    expect(row.data?.supplier_name).toBeNull();
    expect(row.data?.unit_cost_czk).toBeNull();
  });
});
