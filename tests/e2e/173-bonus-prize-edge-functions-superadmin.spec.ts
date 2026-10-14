/**
 * Spec 173 — add-bonus-prize / distribute-bonus-prizes: SUPERADMIN ONLY
 *
 * Řeší potvrzený nález: obě Edge Functions přijímaly canonical `user_roles.role
 * IN ('admin','superadmin')`. Po PR #414 je `bonus_prizes` INSERT/UPDATE/DELETE
 * na tabulkové RLS úrovni výhradně `public.is_superadmin()`. `distribute-bonus-
 * prizes` navíc zapisuje přes service-role klienta, který RLS zcela obchází —
 * proto je vlastní explicitní kontrola v Edge Function jedinou autorizační
 * bariérou pro skutečné DB zápisy, které následují.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez síťového volání) — obsah zdrojových
 *      souborů obou funkcí
 *   B) živé chování proti staging Edge Functions (opt-in)
 *
 * Mimo rozsah (nedotčeno touto opravou, a tedy i tímto spec souborem):
 * business logika bonusových výher, výpočet pozic, ticket engine, winners,
 * MioCoin ekonomika, RLS, databáze, RPC, bonus_prizes migrace, AdminDashboard,
 * AdminContestManagement, ContestDetailAdmin, 7/9-arg overload problém,
 * false-success DELETE/UPDATE problém, Sofinity, jiné Edge Functions.
 *
 * Required env (část B):
 *   E2E_BONUS_PRIZE_EF_SUPERADMIN=1
 *   VITE_SUPABASE_URL      - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY (nebo E2E_SUPABASE_DB_ADMIN — viz níže)
 *
 * Poznámka k části B: staging nemá k dispozici service-role klíč v této
 * session, takže test v CI větví na dva režimy — pokud E2E_SUPABASE_SERVICE_ROLE_KEY
 * existuje, použije `auth.admin.createUser`; jinak zůstává skip (stejně jako
 * ostatní opt-in staging specy v tomto repu). Behaviorální ověření bylo v
 * rámci přípravy tohoto PR provedeno ručně proti nasazeným staging funkcím
 * (add-bonus-prize v1, distribute-bonus-prizes v38) přes reálné HTTP volání
 * s heslovým přihlášením — viz popis PR.
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_BONUS_PRIZE_EF_SUPERADMIN === '1';

const ADD_BONUS_PRIZE = 'supabase/functions/add-bonus-prize/index.ts';
const DISTRIBUTE_BONUS_PRIZES = 'supabase/functions/distribute-bonus-prizes/index.ts';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('173 kontrakt — add-bonus-prize / distribute-bonus-prizes SUPERADMIN ONLY', () => {
  test('173a add-bonus-prize kontroluje výhradně role === "superadmin", ne pole admin/superadmin', () => {
    const src = read(ADD_BONUS_PRIZE);
    expect(src).toContain("roleData.role !== 'superadmin'");
    expect(src).not.toMatch(/\[\s*['"]admin['"]\s*,\s*['"]superadmin['"]\s*\]\s*\.includes\(roleData\.role\)/);
    expect(src).toContain("throw new Error('Superadmin access required')");
    expect(src).not.toContain("Admin access required");
  });

  test('173b distribute-bonus-prizes kontroluje výhradně role === "superadmin", ne pole admin/superadmin', () => {
    const src = read(DISTRIBUTE_BONUS_PRIZES);
    expect(src).toContain("roleData.role !== 'superadmin'");
    expect(src).not.toMatch(/\[\s*['"]admin['"]\s*,\s*['"]superadmin['"]\s*\]\s*\.includes\(roleData\.role\)/);
    expect(src).toContain("'Superadmin access required'");
    expect(src).not.toContain("'Admin access required'");
  });

  test('173c chybová odpověď explicitně vyžaduje superadmin přístup v obou funkcích', () => {
    expect(read(ADD_BONUS_PRIZE)).toMatch(/Superadmin access required/);
    expect(read(DISTRIBUTE_BONUS_PRIZES)).toMatch(/Superadmin access required/);
  });

  test('173d obě funkce čtou roli výhradně z canonical user_roles, nikdy z legacy users.role', () => {
    for (const path of [ADD_BONUS_PRIZE, DISTRIBUTE_BONUS_PRIZES]) {
      const src = read(path);
      expect(src).toContain(".from('user_roles')");
      expect(src).not.toMatch(/\.from\(['"]users['"]\)\s*\n?\s*\.select\(['"]role['"]\)/);
      expect(src).not.toContain("users.role");
    }
  });

  test('173e distribute-bonus-prizes odmítá non-superadmina ještě před service-role zápisem — role check předchází veškeré bonus_prizes/contests operace', () => {
    const src = read(DISTRIBUTE_BONUS_PRIZES);
    const roleCheckIdx = src.indexOf("roleData.role !== 'superadmin'");
    const firstContestFetchIdx = src.indexOf(".from('contests')");
    // First CALL site of processBonusBatchWithRetry (not its declaration,
    // which appears earlier in the file as `async function processBonusBatchWithRetry(`).
    const firstBonusWriteIdx = src.indexOf("await processBonusBatchWithRetry(");
    expect(roleCheckIdx).toBeGreaterThan(-1);
    expect(firstContestFetchIdx).toBeGreaterThan(-1);
    expect(firstBonusWriteIdx).toBeGreaterThan(-1);
    expect(roleCheckIdx).toBeLessThan(firstContestFetchIdx);
    expect(roleCheckIdx).toBeLessThan(firstBonusWriteIdx);
  });

  test('173f add-bonus-prize odmítá non-superadmina ještě před bonus_prizes INSERT', () => {
    const src = read(ADD_BONUS_PRIZE);
    const roleCheckIdx = src.indexOf("roleData.role !== 'superadmin'");
    const insertIdx = src.indexOf(".insert({");
    expect(roleCheckIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(roleCheckIdx).toBeLessThan(insertIdx);
  });

  test('173g business logika (pozice, batching, distribuce, Sofinity) zůstává nedotčená — pouze guard se změnil', () => {
    const addSrc = read(ADD_BONUS_PRIZE);
    const distSrc = read(DISTRIBUTE_BONUS_PRIZES);

    expect(addSrc).toContain('ticket_position < 1 || ticket_position >= 1000000');
    expect(addSrc).toContain('Bonus prize already exists for this ticket position');

    expect(distSrc).toContain('function generateRandomPositions');
    expect(distSrc).toContain('function generateStepPositions');
    expect(distSrc).toContain('processBonusBatchWithRetry');
    expect(distSrc).toContain('send_event_to_sofinity');
    expect(distSrc).toContain('total_miocoin_bonus');
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING EDGE FUNCTIONS ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_BONUS_PRIZE_EF_SUPERADMIN=1 a staging env vč. service role');
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
  const email = 'spec173-' + (role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec173-' + Math.random().toString(36).slice(2, 10) + '!';
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

async function accessToken(email: string, password: string): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error('signIn failed: ' + error?.message);
  return data.session.access_token;
}

async function seedContest(db: SupabaseClient) {
  const { data, error } = await db
    .from('contests')
    .insert({
      title: 'Spec173 EF test contest ' + uniq(),
      status: 'draft',
      ticket_count: 1000,
      ticket_price: 1,
      main_prize: 'Spec173 probe',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('seedContest failed: ' + error?.message);
  createdContestIds.push(data.id);
  return data.id as string;
}

async function callFn(name: string, token: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

test.describe('173 živé chování — add-bonus-prize / distribute-bonus-prizes SUPERADMIN ONLY', () => {
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

  test('173-1 add-bonus-prize přijímá canonical superadmin', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const token = await accessToken(superadmin.email, superadmin.password);

    const { status, json } = await callFn('add-bonus-prize', token, {
      contest_id: contestId,
      description: 'spec173-super',
      ticket_position: 1,
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });

  test('173-2 add-bonus-prize odmítá canonical admin', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const adminUser = await seedUser(db, 'admin');
    const token = await accessToken(adminUser.email, adminUser.password);

    const before = await db.from('bonus_prizes').select('id', { count: 'exact', head: true }).eq('contest_id', contestId);

    const { status, json } = await callFn('add-bonus-prize', token, {
      contest_id: contestId,
      description: 'spec173-admin-denied',
      ticket_position: 1,
    });
    expect(status).toBe(400);
    expect(json.error).toBe('Superadmin access required');

    const after = await db.from('bonus_prizes').select('id', { count: 'exact', head: true }).eq('contest_id', contestId);
    expect(after.count).toBe(before.count ?? 0);
  });

  test('173-3 add-bonus-prize odmítá běžného uživatele (bez rolí)', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const plain = await seedUser(db);
    const token = await accessToken(plain.email, plain.password);

    const { status, json } = await callFn('add-bonus-prize', token, {
      contest_id: contestId,
      description: 'spec173-plain-denied',
      ticket_position: 1,
    });
    expect(status).toBe(400);
    expect(json.error).toBe('Superadmin access required');
  });

  test('173-4 distribute-bonus-prizes přijímá canonical superadmin', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const token = await accessToken(superadmin.email, superadmin.password);

    const { status, json } = await callFn('distribute-bonus-prizes', token, {
      contest_id: contestId,
      bonus_type: 'MioCoin',
      explicit_bonuses: [{ ticket_position: 1, amount: 1 }],
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });

  test('173-5 distribute-bonus-prizes odmítá canonical admin ještě PŘED service-role zápisem', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const adminUser = await seedUser(db, 'admin');
    const token = await accessToken(adminUser.email, adminUser.password);

    const { status, json } = await callFn('distribute-bonus-prizes', token, {
      contest_id: contestId,
      bonus_type: 'MioCoin',
      explicit_bonuses: [{ ticket_position: 1, amount: 1 }],
    });
    expect(status).toBe(400);
    expect(json.error).toBe('Superadmin access required');
    expect(json.step).toBe('superadmin_role');

    // Zero DB writes must have happened — the service-role client is only
    // reached after the guard.
    const rows = await db.from('bonus_prizes').select('id').eq('contest_id', contestId);
    expect(rows.data?.length ?? 0).toBe(0);
    const contest = await db.from('contests').select('total_miocoin_bonus').eq('id', contestId).single();
    expect(contest.data?.total_miocoin_bonus ?? 0).toBe(0);
  });
});
