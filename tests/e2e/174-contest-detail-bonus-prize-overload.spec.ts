/**
 * Spec 174 — ContestDetailAdmin.tsx: opravena nejednoznačnost
 * `admin_manage_bonus_prize` overload
 *
 * Řeší potvrzený nález: produkce má dvě signatury
 * `admin_manage_bonus_prize` — 7-arg (bez p_image_url/p_detailed_description)
 * a 9-arg (s nimi navíc). `ContestDetailAdmin.tsx` posílal jen 5 named args
 * sdílených oběma signaturami, což Postgres/PostgREST vyhodnotil jako
 * genuinely nejednoznačné volání (`42725: function ... is not unique`) —
 * ověřeno rolled-back staging probe PŘED touto opravou.
 *
 * Oprava: explicitní `p_image_url: null` + `p_detailed_description: null`
 * v `ContestDetailAdmin.tsx` volání — tyto dva parametry existují jen na
 * 9-arg signatuře, takže 7-arg přestává být kandidátem a volání se
 * jednoznačně vyřeší na 9-arg overload.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez síťového volání)
 *   B) živé chování proti staging DB (opt-in) — reprodukce PŮVODNÍ
 *      ambiguity + ověření NOVÉHO jednoznačného volání, včetně důkazu,
 *      že se skutečně vybrala 9-arg overload (image_url/detailed_description
 *      skutečně dorazí do vloženého řádku — 7-arg tyto sloupce vůbec
 *      nezapisuje).
 *
 * Mimo rozsah (nedotčeno touto opravou, a tedy i tímto spec souborem):
 * tělo žádné RPC, databáze, RLS, Edge Functions, AdminContestManagement.tsx,
 * bonus prize business logika, ticket engine, winners, MioCoin logika, ceny,
 * pozice tiketů, Sofinity, historické migrace. 7-arg RPC se v tomto kroku
 * neodstraňuje.
 *
 * Required env (část B):
 *   E2E_CONTEST_DETAIL_BONUS_OVERLOAD=1
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
const ENABLED = process.env.E2E_CONTEST_DETAIL_BONUS_OVERLOAD === '1';

const CONTEST_DETAIL_ADMIN = 'src/components/ContestDetailAdmin.tsx';
const ADMIN_CONTEST_MANAGEMENT = 'src/components/AdminContestManagement.tsx';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('174 kontrakt — ContestDetailAdmin bonus prize overload fix', () => {
  test('174a ContestDetailAdmin.tsx volá admin_manage_bonus_prize s p_image_url a p_detailed_description', () => {
    const src = read(CONTEST_DETAIL_ADMIN);
    const rpcCallMatch = src.match(
      /supabase\.rpc\("admin_manage_bonus_prize",\s*\{[\s\S]*?\}\)/,
    );
    expect(rpcCallMatch).not.toBeNull();
    const rpcCall = rpcCallMatch![0];

    expect(rpcCall).toContain('p_operation: "create"');
    expect(rpcCall).toContain('p_contest_id: contestId');
    expect(rpcCall).toContain('p_description: bonusForm.description');
    expect(rpcCall).toContain('p_ticket_position: bonusForm.ticket_position');
    expect(rpcCall).toContain('p_amount:');
    expect(rpcCall).toContain('p_image_url: null');
    expect(rpcCall).toContain('p_detailed_description: null');
  });

  test('174b volané named parametry existují pouze na 9-arg signatuře — sada je jednoznačná', () => {
    const src = read(CONTEST_DETAIL_ADMIN);
    const rpcCallMatch = src.match(
      /supabase\.rpc\("admin_manage_bonus_prize",\s*\{([\s\S]*?)\}\)/,
    );
    expect(rpcCallMatch).not.toBeNull();
    const paramsBlock = rpcCallMatch![1];

    const namedParams = Array.from(paramsBlock.matchAll(/(p_[a-z_]+):/g)).map((m) => m[1]);
    // Musí obsahovat p_image_url a p_detailed_description — parametry,
    // které existují VÝHRADNĚ na 9-arg signatuře. Jejich pouhá přítomnost
    // v named-notation volání vylučuje 7-arg jako kandidáta.
    expect(namedParams).toContain('p_image_url');
    expect(namedParams).toContain('p_detailed_description');
    // Žádné jiné parametry mimo těch, co existují na 9-arg signatuře.
    const valid9ArgParams = [
      'p_prize_id',
      'p_contest_id',
      'p_description',
      'p_ticket_position',
      'p_amount',
      'p_status',
      'p_operation',
      'p_image_url',
      'p_detailed_description',
    ];
    for (const p of namedParams) {
      expect(valid9ArgParams).toContain(p);
    }
  });

  test('174c AdminContestManagement.tsx zůstalo beze změny (nedotčeno touto opravou)', () => {
    // Statický kontrakt: AdminContestManagement.tsx už dnes posílá 7 named
    // args (vč. p_image_url/p_detailed_description) a tato oprava se ho
    // netýká — pouze ověřujeme, že jeho volání zůstává nedotčené a stále
    // obsahuje stejnou sadu parametrů jako dřív.
    const src = read(ADMIN_CONTEST_MANAGEMENT);
    const rpcCallMatch = src.match(
      /supabase\.rpc\("admin_manage_bonus_prize",\s*\{[\s\S]*?\}\)/,
    );
    expect(rpcCallMatch).not.toBeNull();
    const rpcCall = rpcCallMatch![0];

    expect(rpcCall).toContain('p_contest_id: contestId');
    expect(rpcCall).toContain('p_ticket_position: prize.ticket_position');
    expect(rpcCall).toContain('p_description: prize.description');
    expect(rpcCall).toContain('p_detailed_description: prize.detailed_description ?? null');
    expect(rpcCall).toContain('p_status: "pending"');
    expect(rpcCall).toContain('p_operation: "create"');
    expect(rpcCall).toContain('p_image_url: imageUrl ?? null');
  });

  test('174d obě admin_manage_bonus_prize overload signatury zatím nejsou nikde mazány', () => {
    for (const path of [CONTEST_DETAIL_ADMIN, ADMIN_CONTEST_MANAGEMENT]) {
      const src = read(path);
      expect(src).not.toMatch(/DROP FUNCTION.*admin_manage_bonus_prize/i);
    }
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_CONTEST_DETAIL_BONUS_OVERLOAD=1 a staging env');
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
  const email = 'spec174-' + (role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec174-' + Math.random().toString(36).slice(2, 10) + '!';
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
      title: 'Spec174 overload test contest ' + uniq(),
      status: 'draft',
      ticket_count: 1000,
      ticket_price: 1,
      main_prize: 'Spec174 probe',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('seedContest failed: ' + error?.message);
  createdContestIds.push(data.id);
  return data.id as string;
}

test.describe('174 živé chování — admin_manage_bonus_prize overload resolution', () => {
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

  test('174-orig původní 5-arg volání je stále genuinely nejednoznačné (regrese by znamenala, že overload zmizel)', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: '00000000-0000-0000-0000-000000000000',
      p_description: 'spec174-orig-shape',
      p_ticket_position: 1,
      p_amount: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('is not unique');
  });

  test('174-1 nové volání (s p_image_url/p_detailed_description) už není nejednoznačné a skutečně vybere 9-arg overload', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: contestId,
      p_description: 'spec174-new-shape',
      p_ticket_position: 1,
      p_amount: null,
      p_image_url: 'spec174/marker.png',
      p_detailed_description: 'spec174 marker',
    });
    expect(error).toBeNull();
    expect((data as { success: boolean })?.success).toBe(true);
    const prizeId = (data as { prize_id: string }).prize_id;

    // Proof it's the 9-arg overload: only that one writes image_url/
    // detailed_description at all.
    const row = await db
      .from('bonus_prizes')
      .select('image_url, detailed_description')
      .eq('id', prizeId)
      .single();
    expect(row.data?.image_url).toBe('spec174/marker.png');
    expect(row.data?.detailed_description).toBe('spec174 marker');
  });

  test('174-2 canonical superadmin projde autorizací s novým voláním', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    const { data, error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: contestId,
      p_description: 'spec174-super-auth',
      p_ticket_position: 1,
      p_amount: null,
      p_image_url: null,
      p_detailed_description: null,
    });
    expect(error).toBeNull();
    expect((data as { success: boolean })?.success).toBe(true);
  });

  test('174-3 běžný canonical admin (bez superadmin role) neprojde autorizací s novým voláním', async () => {
    const db = admin();
    const contestId = await seedContest(db);
    const adminUser = await seedUser(db, 'admin');
    const client = await signIn(adminUser.email, adminUser.password);

    const { data, error } = await client.rpc('admin_manage_bonus_prize', {
      p_operation: 'create',
      p_contest_id: contestId,
      p_description: 'spec174-admin-denied',
      p_ticket_position: 1,
      p_amount: null,
      p_image_url: null,
      p_detailed_description: null,
    });
    // The 9-arg overload's guard does RAISE EXCEPTION, but its outer
    // EXCEPTION WHEN OTHERS handler catches it and returns a JSON
    // {success:false, message:...} instead of surfacing a PostgREST error.
    expect(error).toBeNull();
    expect((data as { success: boolean } | null)?.success).toBe(false);
    expect((data as { message?: string } | null)?.message).toContain(
      'Pouze administrátoři mohou spravovat bonusové výhry',
    );

    const rows = await db.from('bonus_prizes').select('id').eq('contest_id', contestId);
    expect(rows.data?.length ?? 0).toBe(0);
  });
});
