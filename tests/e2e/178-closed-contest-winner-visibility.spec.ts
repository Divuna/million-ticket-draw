/**
 * Spec 178 — Výherce vidí název uzavřené soutěže, cizí uživatel ne
 *
 * Regresní zámek k migraci
 * `20260918110000_contests_winner_can_read_own_contest.sql`.
 *
 * Do opravy pustila `contests` public SELECT policy jen
 * status IN ('active','pending','paused'), takže po uzavření soutěže výherci
 * na stránce Výhry zmizel název soutěže a zobrazilo se obecné "Soutěž".
 *
 * Nová policy `contests_winner_select_own` je úzká: řádek uzavřené soutěže
 * uvidí jen ten, kdo v ní má vlastní winner záznam. Tenhle spec drží obě
 * strany — že výherce vidí a že nevýherce nevidí.
 *
 * Staging-only, self-contained: zakládá si vlastní uzavřenou soutěž
 * a dva throwaway uživatele, na konci vše uklidí.
 *
 * 178a výherce přečte skutečný title uzavřené soutěže
 * 178b jiný běžný uživatel tutéž uzavřenou soutěž nevidí
 * 178c anonymní návštěvník ji nevidí
 * 178d nevýherce dál normálně vidí aktivní soutěž (public chování nedotčeno)
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging = SUPABASE_URL.includes(STAGING_REF) && !!ANON_KEY && !!SERVICE_ROLE;

const RUN_ID        = Date.now();
const TITLE_PREFIX  = `E2E Spec178 ${RUN_ID}`;
const CLOSED_TITLE  = `${TITLE_PREFIX} closed`;
const ACTIVE_TITLE  = `${TITLE_PREFIX} active`;
const PASSWORD      = 'Spec178!Visibility7';
const WINNER_EMAIL  = `spec178-winner-${RUN_ID}@onemil.cz`;
const OTHER_EMAIL   = `spec178-other-${RUN_ID}@onemil.cz`;

const ctx: {
  winnerId?: string;
  otherId?: string;
  closedContestId?: string;
  activeContestId?: string;
} = {};

const svc = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const anon = (): SupabaseClient =>
  createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

async function createUser(db: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error || !data?.user) throw new Error(`createUser(${email}): ${error?.message}`);
  await (db as any).from('users').upsert({ id: data.user.id, email, role: 'user' }, { onConflict: 'id' });
  return data.user.id;
}

/** Klient přihlášený jako daný uživatel — RLS se vyhodnocuje pod jeho identitou. */
async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

test.describe.serial('178 — viditelnost uzavřené soutěže pro výherce', () => {
  test.skip(!isStaging, 'staging-only — vyžaduje staging URL, anon key a service role');

  test.beforeAll(async () => {
    if (!isStaging) return;
    const db = svc();

    ctx.winnerId = await createUser(db, WINNER_EMAIL);
    ctx.otherId  = await createUser(db, OTHER_EMAIL);

    // Uzavřená soutěž + tiket + winner záznam pro výherce.
    const { data: closed, error: closedErr } = await (db as any)
      .from('contests')
      .insert({
        title: CLOSED_TITLE, name: CLOSED_TITLE,
        main_prize: 'Spec178 hlavní výhra',
        main_image: 'https://example.invalid/spec178.png',
        rules_pdf_url: 'https://example.invalid/spec178-rules.pdf',
        ticket_count: 1, ticket_price: 1, status: 'closed', next_ticket_number: 2,
      })
      .select('id').single();
    if (closedErr) throw new Error(`closed contest: ${closedErr.message}`);
    ctx.closedContestId = closed.id as string;

    const { data: ticket, error: ticketErr } = await (db as any)
      .from('tickets')
      .insert({ contest_id: ctx.closedContestId, user_id: ctx.winnerId, number: 1 })
      .select('id').single();
    if (ticketErr) throw new Error(`ticket: ${ticketErr.message}`);

    const { error: winnerErr } = await (db as any).from('winners').insert({
      contest_id: ctx.closedContestId, user_id: ctx.winnerId, ticket_id: ticket.id, type: 'main',
    });
    if (winnerErr) throw new Error(`winner: ${winnerErr.message}`);

    // Aktivní soutěž pro kontrolu, že public chování zůstalo nedotčené.
    const { data: active, error: activeErr } = await (db as any)
      .from('contests')
      .insert({
        title: ACTIVE_TITLE, name: ACTIVE_TITLE,
        main_prize: 'Spec178 aktivní výhra',
        main_image: 'https://example.invalid/spec178.png',
        rules_pdf_url: 'https://example.invalid/spec178-rules.pdf',
        ticket_count: 10, ticket_price: 1, status: 'active', next_ticket_number: 1,
      })
      .select('id').single();
    if (activeErr) throw new Error(`active contest: ${activeErr.message}`);
    ctx.activeContestId = active.id as string;
  });

  test.afterAll(async () => {
    if (!isStaging) return;
    const db = svc();
    if (ctx.closedContestId) {
      await (db as any).from('winners').delete().eq('contest_id', ctx.closedContestId);
      await (db as any).from('tickets').delete().eq('contest_id', ctx.closedContestId);
    }
    await (db as any).from('contests').delete().like('title', `${TITLE_PREFIX}%`);
    for (const id of [ctx.winnerId, ctx.otherId]) {
      if (id) await db.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  test('178a: výherce přečte skutečný title uzavřené soutěže', async () => {
    const client = await signedInClient(WINNER_EMAIL);

    const { data, error } = await (client as any)
      .from('contests')
      .select('id, title, main_prize')
      .eq('id', ctx.closedContestId!);

    expect(error, JSON.stringify(error)).toBeNull();
    expect(data ?? [], 'výherce musí uzavřenou soutěž vidět').toHaveLength(1);
    expect(data[0].title, 'musí přijít skutečný název, ne fallback').toBe(CLOSED_TITLE);
    expect(data[0].main_prize).toBe('Spec178 hlavní výhra');

    await client.auth.signOut();
  });

  test('178b: jiný běžný uživatel uzavřenou soutěž nevidí', async () => {
    const client = await signedInClient(OTHER_EMAIL);

    const { data, error } = await (client as any)
      .from('contests')
      .select('id, title')
      .eq('id', ctx.closedContestId!);

    expect(error, JSON.stringify(error)).toBeNull();
    expect(data ?? [], 'nevýherce nesmí uzavřenou soutěž číst').toHaveLength(0);

    await client.auth.signOut();
  });

  test('178c: anonymní návštěvník uzavřenou soutěž nevidí', async () => {
    const { data, error } = await (anon() as any)
      .from('contests')
      .select('id, title')
      .eq('id', ctx.closedContestId!);

    expect(error, JSON.stringify(error)).toBeNull();
    expect(data ?? [], 'anon nesmí uzavřenou soutěž číst').toHaveLength(0);
  });

  test('178d: aktivní soutěž zůstává veřejně viditelná i pro nevýherce', async () => {
    const client = await signedInClient(OTHER_EMAIL);

    const { data, error } = await (client as any)
      .from('contests')
      .select('id, title')
      .eq('id', ctx.activeContestId!);

    expect(error, JSON.stringify(error)).toBeNull();
    expect(data ?? [], 'public chování aktivních soutěží se nesmí změnit').toHaveLength(1);
    expect(data[0].title).toBe(ACTIVE_TITLE);

    await client.auth.signOut();
  });
});
