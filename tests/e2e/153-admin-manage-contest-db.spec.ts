/**
 * Spec 153 — živé chování `admin_manage_contest` proti reálné DB
 *
 * STAGING ONLY a opt-in. Spouštět až po aplikaci migrace
 * `20260903160000_admin_manage_contest_hardening.sql` na staging.
 *
 * Scénáře:
 *   153a  běžný authenticated uživatel        → zamítnuto
 *   153b  admin i superadmin                  → povoleno (i účet s role-driftem)
 *   153c  vynechané parametry nic nepřepíšou  → hlavní příčina nálezu
 *   153d  ticket_count u soutěže s tiketem    → zamítnuto (nahoru i dolů)
 *   153e  shodný ticket_count projde          → formulář musí dál ukládat
 *   153f  ticket_count bez tiketů projde      → koncept lze dál zvětšovat
 *   153g  přímý UPDATE tabulky                → zamítnuto triggerem
 *   153h  closed soutěž nelze oživit          → zámek z 20260902120000
 *   153i  audit se zapsal
 *
 * Test si zakládá VLASTNÍ soutěže a uživatele a v `afterAll` je uklízí.
 * Nesahá na existující soutěže, tikety, výhry, peněženky ani platby.
 *
 * Required env:
 *   E2E_ADMIN_MANAGE_CONTEST=1
 *   VITE_SUPABASE_URL      - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_ADMIN_MANAGE_CONTEST === '1';

const ADMIN_DENIED = 'Pouze administrátoři mohou spravovat soutěže';
const SIZE_LOCKED = 'Počet tiketů nelze změnit';

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_ADMIN_MANAGE_CONTEST=1 a staging env');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdContestIds: string[] = [];
const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seedUser(db: SupabaseClient, role?: 'admin' | 'superadmin') {
  const email = `spec153-${role ?? 'user'}-${uniq()}@onemil.test`;
  const password = `Spec153-${Math.random().toString(36).slice(2, 10)}!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  if (role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: data.user.id, role });
    if (roleErr) throw new Error(`user_roles seed failed: ${roleErr.message}`);
  }
  return { id: data.user.id, email, password };
}

async function seedContest(
  db: SupabaseClient,
  opts: { ticketCount?: number; status?: string; withTicket?: boolean; userId?: string } = {}
) {
  const ticketCount = opts.ticketCount ?? 100;
  const { data: contest, error } = await db
    .from('contests')
    .insert({
      title: `E2E Spec153 ${uniq()}`,
      main_prize: 'E2E spec153 prize',
      ticket_count: ticketCount,
      ticket_price: 10,
      status: opts.status ?? 'active',
      next_ticket_number: 1,
      fast_game: false,
      main_image: 'https://placehold.co/800x600/1D2128/E7EBF0?text=E2E153',
    })
    .select('id')
    .single();
  if (error || !contest) throw new Error(`contest seed failed: ${error?.message}`);
  const contestId = contest.id as string;
  createdContestIds.push(contestId);

  if (opts.withTicket && opts.userId) {
    const { error: tErr } = await db
      .from('tickets')
      .insert({ contest_id: contestId, user_id: opts.userId, number: 1 });
    if (tErr) throw new Error(`ticket seed failed: ${tErr.message}`);
    await db.from('contests').update({ next_ticket_number: 2 }).eq('id', contestId);
  }

  return contestId;
}

async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return client;
}

const contestRow = async (db: SupabaseClient, id: string) =>
  (
    await db
      .from('contests')
      .select('title, description, status, ticket_count, ticket_price')
      .eq('id', id)
      .single()
  ).data;

test.afterAll(async () => {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
  const db = admin();
  for (const contestId of createdContestIds) {
    await db.from('admin_actions').delete().eq('target_id', contestId);
    await db.from('tickets').delete().eq('contest_id', contestId);
    await db.from('bonus_prizes').delete().eq('contest_id', contestId);
    await db.from('contests').delete().eq('id', contestId);
  }
  for (const userId of createdUserIds) {
    await db.from('user_roles').delete().eq('user_id', userId);
    await db.auth.admin.deleteUser(userId);
  }
});

test.describe('admin_manage_contest — živé chování', () => {
  test('153a běžný uživatel nesmí spravovat soutěže', async () => {
    skipIfNotEnabled();
    const db = admin();
    const contestId = await seedContest(db);
    const intruder = await seedUser(db);
    const client = await clientFor(intruder.email, intruder.password);

    const res = await client.rpc('admin_manage_contest', {
      p_operation: 'update',
      p_contest_id: contestId,
      p_title: 'HACKED',
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain(ADMIN_DENIED);
    expect((await contestRow(db, contestId))?.title).not.toBe('HACKED');
  });

  test('153b admin i superadmin smí — i s driftem v legacy users.role', async () => {
    skipIfNotEnabled();
    const db = admin();

    for (const role of ['admin', 'superadmin'] as const) {
      const contestId = await seedContest(db);
      const actor = await seedUser(db, role);

      // Simulace produkčního driftu: kanonická user_roles říká admin,
      // legacy public.users.role říká 'user'. Starý guard by odmítl.
      await db.from('users').update({ role: 'user' }).eq('id', actor.id);

      const client = await clientFor(actor.email, actor.password);
      const res = await client.rpc('admin_manage_contest', {
        p_operation: 'update',
        p_contest_id: contestId,
        p_title: `Spec153 ${role} OK`,
      });

      expect(res.error, `${role} musí projít i při driftu users.role`).toBeNull();
      expect((await contestRow(db, contestId))?.title).toBe(`Spec153 ${role} OK`);
    }
  });

  test('153c vynechané parametry nic nepřepíšou', async () => {
    skipIfNotEnabled();
    const db = admin();
    const contestId = await seedContest(db, { ticketCount: 250, status: 'active' });
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);

    // Přesně tvar volání z ContestDetailAdmin.saveNotes před opravou.
    const res = await client.rpc('admin_manage_contest', {
      p_operation: 'update',
      p_contest_id: contestId,
      p_description: 'jen poznámka',
    });
    expect(res.error).toBeNull();

    const row = await contestRow(db, contestId);
    expect(row?.description).toBe('jen poznámka');
    // Jádro nálezu: dřív se tady objevilo 1000000 / 1 / 'draft'.
    expect(row?.ticket_count, 'velikost soutěže se nesmí změnit').toBe(250);
    expect(Number(row?.ticket_price), 'cena se nesmí změnit').toBe(10);
    expect(row?.status, 'status se nesmí změnit').toBe('active');
  });

  test('153d ticket_count nelze změnit, když existuje tiket', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);

    for (const newCount of [50, 500]) {
      const contestId = await seedContest(db, {
        ticketCount: 100,
        withTicket: true,
        userId: owner.id,
      });

      const res = await client.rpc('admin_manage_contest', {
        p_operation: 'update',
        p_contest_id: contestId,
        p_ticket_count: newCount,
      });

      expect(res.error, `změna na ${newCount} musí být odmítnuta`).not.toBeNull();
      expect(res.error?.message).toContain(SIZE_LOCKED);
      expect((await contestRow(db, contestId))?.ticket_count).toBe(100);
    }
  });

  test('153e shodný ticket_count projde a uloží ostatní pole', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);
    const contestId = await seedContest(db, {
      ticketCount: 100,
      withTicket: true,
      userId: owner.id,
    });

    // Formulář posílá ticket_count vždy — beze změny hodnoty musí projít.
    const res = await client.rpc('admin_manage_contest', {
      p_operation: 'update',
      p_contest_id: contestId,
      p_ticket_count: 100,
      p_title: 'Spec153 stejná velikost',
    });

    expect(res.error).toBeNull();
    const row = await contestRow(db, contestId);
    expect(row?.title).toBe('Spec153 stejná velikost');
    expect(row?.ticket_count).toBe(100);
  });

  test('153f ticket_count lze měnit, dokud nejsou tikety', async () => {
    skipIfNotEnabled();
    const db = admin();
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);
    const contestId = await seedContest(db, { ticketCount: 100, status: 'pending' });

    const res = await client.rpc('admin_manage_contest', {
      p_operation: 'update',
      p_contest_id: contestId,
      p_ticket_count: 777,
    });

    expect(res.error).toBeNull();
    expect((await contestRow(db, contestId))?.ticket_count).toBe(777);
  });

  test('153g přímý UPDATE tabulky trigger také zablokuje', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);
    const contestId = await seedContest(db, {
      ticketCount: 100,
      withTicket: true,
      userId: owner.id,
    });

    // Politika contests_admin_update dovoluje adminovi přímý UPDATE —
    // invariant proto musí držet trigger, ne jen RPC.
    const res = await client.from('contests').update({ ticket_count: 5 }).eq('id', contestId);

    expect(res.error, 'přímý UPDATE musí trigger odmítnout').not.toBeNull();
    expect(res.error?.message).toContain(SIZE_LOCKED);
    expect((await contestRow(db, contestId))?.ticket_count).toBe(100);

    // Service role (obchází RLS) musí narazit na stejný trigger.
    const svc = await db.from('contests').update({ ticket_count: 5 }).eq('id', contestId);
    expect(svc.error, 'trigger platí i pro service_role').not.toBeNull();
  });

  test('153h uzavřenou soutěž nelze oživit', async () => {
    skipIfNotEnabled();
    const db = admin();
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);
    const contestId = await seedContest(db, { status: 'closed' });

    const res = await client.rpc('admin_manage_contest', {
      p_operation: 'update',
      p_contest_id: contestId,
      p_status: 'active',
    });

    expect(res.error, 'closed je konečný stav').not.toBeNull();
    expect(res.error?.message).toContain('Uzavřenou soutěž nelze vrátit');
    expect((await contestRow(db, contestId))?.status).toBe('closed');
  });

  test('153i audit se zapisuje', async () => {
    skipIfNotEnabled();
    const db = admin();
    const actor = await seedUser(db, 'admin');
    const client = await clientFor(actor.email, actor.password);
    const contestId = await seedContest(db);

    const res = await client.rpc('admin_manage_contest', {
      p_operation: 'update',
      p_contest_id: contestId,
      p_title: 'Spec153 audit',
    });
    expect(res.error).toBeNull();

    const { data: actions } = await db
      .from('admin_actions')
      .select('action_type, target_table, admin_id')
      .eq('target_id', contestId);

    expect(actions?.length).toBe(1);
    expect(actions?.[0].action_type).toBe('contest_update');
    expect(actions?.[0].target_table).toBe('contests');
    expect(actions?.[0].admin_id).toBe(actor.id);
  });
});
