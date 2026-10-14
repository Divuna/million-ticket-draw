/**
 * Spec 148 — živé chování guardů `pause_contest` / `resume_contest` proti reálné DB
 *
 * STAGING ONLY a opt-in. Spouštět až po aplikaci migrace
 * `20260902120000_contest_pause_resume_closed_final_guard.sql` na staging.
 *
 * Ověřuje čtyři scénáře z auditu A05:
 *   148a  běžný authenticated uživatel        → zamítnuto (obě RPC)
 *   148b  admin i superadmin                  → povoleno
 *   148c  uzavřená soutěž (`closed`)          → nesmí být znovu aktivována ani pozastavena
 *   148d  povolený přechod active → paused → active → funguje
 *
 * Test si zakládá VLASTNÍ testovací soutěže i uživatele a v `afterAll` je uklízí.
 * Nikdy nesahá na existující soutěže, wallets, payments, winners ani bonus_prizes.
 *
 * Required env:
 *   E2E_CONTEST_CONTROL_GUARD=1
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
const ENABLED = process.env.E2E_CONTEST_CONTROL_GUARD === '1';

const ADMIN_DENIED = 'Admin access required';
const CLOSED_RESUME_DENIED = 'Uzavřenou soutěž nelze znovu aktivovat.';
const CLOSED_PAUSE_DENIED = 'Uzavřenou soutěž nelze pozastavit.';

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(
      true,
      'staging-only opt-in — vyžaduje E2E_CONTEST_CONTROL_GUARD=1 a staging Supabase env'
    );
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdContestIds: string[] = [];

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Vytvoří potvrzeného uživatele; `role` volitelně zapíše do kanonické user_roles. */
async function seedUser(db: SupabaseClient, role?: 'admin' | 'superadmin') {
  const email = `spec148-${role ?? 'user'}-${uniq()}@onemil.test`;
  const password = `Spec148-${Math.random().toString(36).slice(2, 10)}!`;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);

  if (role) {
    const { error: roleError } = await db
      .from('user_roles')
      .insert({ user_id: data.user.id, role });
    if (roleError) throw new Error(`user_roles seed failed: ${roleError.message}`);
  }

  return { id: data.user.id, email, password };
}

async function seedContest(db: SupabaseClient, status: string) {
  const { data, error } = await db
    .from('contests')
    .insert({
      title: `E2E Spec148 ${status} ${uniq()}`,
      main_prize: 'E2E spec148 guard test prize',
      ticket_count: 100,
      ticket_price: 10,
      status,
      next_ticket_number: 1,
      fast_game: false,
      main_image: 'https://placehold.co/800x600/1D2128/E7EBF0?text=E2E+Spec148',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`contest seed failed: ${error?.message}`);
  createdContestIds.push(data.id as string);
  return data.id as string;
}

/** Přihlášený klient dané identity — RPC pak běží pod rolí `authenticated`. */
async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return client;
}

async function statusOf(db: SupabaseClient, contestId: string): Promise<string> {
  const { data } = await db.from('contests').select('status').eq('id', contestId).single();
  return String(data?.status ?? '');
}

test.afterAll(async () => {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
  const db = admin();
  for (const contestId of createdContestIds) {
    await db.from('contests').delete().eq('id', contestId);
  }
  for (const userId of createdUserIds) {
    await db.from('user_roles').delete().eq('user_id', userId);
    await db.auth.admin.deleteUser(userId);
  }
});

test.describe('pause_contest / resume_contest — živé guardy', () => {
  test('148a běžný authenticated uživatel nesmí pozastavit ani aktivovat soutěž', async () => {
    skipIfNotEnabled();
    const db = admin();

    const activeContest = await seedContest(db, 'active');
    const pausedContest = await seedContest(db, 'paused');
    const user = await seedUser(db); // bez role → běžný zákazník
    const client = await clientFor(user.email, user.password);

    const pauseResult = await client.rpc('pause_contest', { contest_id: activeContest });
    expect(pauseResult.error).not.toBeNull();
    expect(pauseResult.error?.message).toContain(ADMIN_DENIED);

    const resumeResult = await client.rpc('resume_contest', { contest_id: pausedContest });
    expect(resumeResult.error).not.toBeNull();
    expect(resumeResult.error?.message).toContain(ADMIN_DENIED);

    // Zamítnutí musí být skutečné — stav soutěží se nesmí změnit.
    expect(await statusOf(db, activeContest)).toBe('active');
    expect(await statusOf(db, pausedContest)).toBe('paused');
  });

  test('148b admin i superadmin smí pozastavit a znovu aktivovat', async () => {
    skipIfNotEnabled();
    const db = admin();

    for (const role of ['admin', 'superadmin'] as const) {
      const contestId = await seedContest(db, 'active');
      const actor = await seedUser(db, role);
      const client = await clientFor(actor.email, actor.password);

      const pauseResult = await client.rpc('pause_contest', { contest_id: contestId });
      expect(pauseResult.error, `${role} musí smět pozastavit`).toBeNull();
      expect(await statusOf(db, contestId)).toBe('paused');

      const resumeResult = await client.rpc('resume_contest', { contest_id: contestId });
      expect(resumeResult.error, `${role} musí smět obnovit`).toBeNull();
      expect(await statusOf(db, contestId)).toBe('active');
    }
  });

  test('148c uzavřenou soutěž nelze znovu aktivovat ani pozastavit ani jako superadmin', async () => {
    skipIfNotEnabled();
    const db = admin();

    const closedContest = await seedContest(db, 'closed');
    const superadmin = await seedUser(db, 'superadmin');
    const client = await clientFor(superadmin.email, superadmin.password);

    const resumeResult = await client.rpc('resume_contest', { contest_id: closedContest });
    expect(resumeResult.error, 'closed soutěž nesmí jít znovu aktivovat').not.toBeNull();
    expect(resumeResult.error?.message).toContain(CLOSED_RESUME_DENIED);
    expect(await statusOf(db, closedContest)).toBe('closed');

    const pauseResult = await client.rpc('pause_contest', { contest_id: closedContest });
    expect(pauseResult.error, 'closed soutěž nesmí jít pozastavit').not.toBeNull();
    expect(pauseResult.error?.message).toContain(CLOSED_PAUSE_DENIED);
    expect(await statusOf(db, closedContest)).toBe('closed');
  });

  test('148d povolený přechod active → paused → active funguje', async () => {
    skipIfNotEnabled();
    const db = admin();

    const contestId = await seedContest(db, 'active');
    const adminUser = await seedUser(db, 'admin');
    const client = await clientFor(adminUser.email, adminUser.password);

    expect(await statusOf(db, contestId)).toBe('active');

    const pauseResult = await client.rpc('pause_contest', { contest_id: contestId });
    expect(pauseResult.error).toBeNull();
    expect(await statusOf(db, contestId)).toBe('paused');

    const resumeResult = await client.rpc('resume_contest', { contest_id: contestId });
    expect(resumeResult.error).toBeNull();
    expect(await statusOf(db, contestId)).toBe('active');
  });
});
