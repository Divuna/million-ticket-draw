/**
 * Spec 155 — chybějící datum narození nesmí nic zablokovat (živá DB)
 *
 * STAGING ONLY a opt-in. Spouštět až po aplikaci migrace
 * `20260903180000_guardian_notice_drop_age_dependency.sql` na staging.
 *
 * Scénáře:
 *   155a  účet bez date_of_birth normálně vznikne a je použitelný
 *   155b  chybějící date_of_birth neblokuje nákup tiketu (soutěž)
 *   155c  chybějící date_of_birth neblokuje vznik výhry (trigger na winners)
 *   155d  upozornění na zákonného zástupce se řídí atributem ceny, ne věkem
 *   155e  cena bez guardian_required žádné upozornění negeneruje
 *   155f  guardian RPC zůstává service_role-only (běžný uživatel ji nezavolá)
 *
 * Test si zakládá VLASTNÍ soutěž, ceny a uživatele a v `afterAll` je uklízí.
 * Nesahá na existující uživatele, jejich date_of_birth, soutěže ani výhry.
 *
 * Required env:
 *   E2E_MISSING_DOB=1
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
const ENABLED = process.env.E2E_MISSING_DOB === '1';

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_MISSING_DOB=1 a staging env');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdContestIds: string[] = [];
const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seedUser(db: SupabaseClient) {
  const email = `spec155-${uniq()}@onemil.test`;
  const password = `Spec155-${Math.random().toString(36).slice(2, 10)}!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function seedContest(db: SupabaseClient, ticketCount = 100) {
  const { data, error } = await db
    .from('contests')
    .insert({
      title: `E2E Spec155 ${uniq()}`,
      main_prize: 'E2E spec155 prize',
      ticket_count: ticketCount,
      ticket_price: 1,
      status: 'active',
      next_ticket_number: 1,
      fast_game: false,
      main_image: 'https://placehold.co/800x600/1D2128/E7EBF0?text=E2E155',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`contest seed failed: ${error?.message}`);
  createdContestIds.push(data.id as string);
  return data.id as string;
}

async function seedBonusPrize(
  db: SupabaseClient,
  contestId: string,
  position: number,
  guardianRequired: boolean
) {
  const { data, error } = await db
    .from('bonus_prizes')
    .insert({
      contest_id: contestId,
      ticket_position: position,
      description: `E2E spec155 věcná cena ${position}`,
      status: 'pending',
      guardian_required: guardianRequired,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`bonus_prize seed failed: ${error?.message}`);
  return data.id as string;
}

const dobOf = async (db: SupabaseClient, userId: string) =>
  (await db.from('profiles').select('date_of_birth').eq('id', userId).maybeSingle()).data
    ?.date_of_birth ?? null;

const guardianMessages = async (db: SupabaseClient, userId: string) =>
  (
    await db
      .from('messages')
      .select('content')
      .eq('user_id', userId)
      .ilike('content', '%zákonného zástupce%')
  ).data ?? [];

test.afterAll(async () => {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
  const db = admin();
  for (const contestId of createdContestIds) {
    await db.from('winners').delete().eq('contest_id', contestId);
    await db.from('tickets').delete().eq('contest_id', contestId);
    await db.from('bonus_prizes').delete().eq('contest_id', contestId);
    await db.from('contests').delete().eq('id', contestId);
  }
  for (const userId of createdUserIds) {
    await db.from('messages').delete().eq('user_id', userId);
    await db.from('notifications').delete().eq('user_id', userId);
    await db.from('winners').delete().eq('user_id', userId);
    await db.auth.admin.deleteUser(userId);
  }
});

test.describe('chybějící date_of_birth nic neblokuje', () => {
  test('155a účet vznikne bez data narození a profil existuje', async () => {
    skipIfNotEnabled();
    const db = admin();
    const user = await seedUser(db);

    const { data: profile } = await db
      .from('profiles')
      .select('id, date_of_birth')
      .eq('id', user.id)
      .maybeSingle();

    expect(profile, 'registrační trigger musí profil založit').not.toBeNull();
    expect(profile?.date_of_birth, 'datum narození se nesbírá').toBeNull();

    const { data: wallet } = await db
      .from('wallets')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    expect(wallet, 'peněženka musí vzniknout i bez data narození').not.toBeNull();
  });

  test('155b nákup tiketu není blokován chybějícím datem narození', async () => {
    skipIfNotEnabled();
    const db = admin();
    const user = await seedUser(db);
    const contestId = await seedContest(db);
    await db.from('wallets').update({ balance_coins: 50 }).eq('user_id', user.id);
    expect(await dobOf(db, user.id)).toBeNull();

    const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(signInErr).toBeNull();

    const { data, error } = await client.rpc('buy_ticket_atomic', { p_contest_id: contestId });
    expect(error).toBeNull();
    expect((data as any)?.success, `nákup selhal: ${JSON.stringify(data)}`).toBe(true);
    expect((data as any)?.ticket_number).toBe(1);
  });

  test('155c výhra vznikne i bez data narození (trigger nic neshodí)', async () => {
    skipIfNotEnabled();
    const db = admin();
    const user = await seedUser(db);
    const contestId = await seedContest(db);
    const prizeId = await seedBonusPrize(db, contestId, 7, true);

    const { data: ticket } = await db
      .from('tickets')
      .insert({ contest_id: contestId, user_id: user.id, number: 7 })
      .select('id')
      .single();

    // Trigger on_guardian_prize_winner běží právě zde.
    const { data: winner, error } = await db
      .from('winners')
      .insert({
        contest_id: contestId,
        user_id: user.id,
        ticket_id: ticket!.id,
        prize_id: prizeId,
        type: 'bonus',
      })
      .select('id')
      .single();

    expect(error, 'chybějící datum narození nesmí zablokovat vznik výhry').toBeNull();
    expect(winner).not.toBeNull();
  });

  test('155d upozornění na zástupce se řídí atributem ceny, ne věkem', async () => {
    skipIfNotEnabled();
    const db = admin();
    const user = await seedUser(db);
    const contestId = await seedContest(db);
    const prizeId = await seedBonusPrize(db, contestId, 11, true);
    expect(await dobOf(db, user.id), 'test má smysl jen bez data narození').toBeNull();

    const { data: ticket } = await db
      .from('tickets')
      .insert({ contest_id: contestId, user_id: user.id, number: 11 })
      .select('id')
      .single();
    await db.from('winners').insert({
      contest_id: contestId,
      user_id: user.id,
      ticket_id: ticket!.id,
      prize_id: prizeId,
      type: 'bonus',
    });

    const msgs = await guardianMessages(db, user.id);
    expect(msgs.length, 'cena se zástupcem musí upozornění vygenerovat').toBe(1);
  });

  test('155e cena bez guardian_required žádné upozornění negeneruje', async () => {
    skipIfNotEnabled();
    const db = admin();
    const user = await seedUser(db);
    const contestId = await seedContest(db);
    const prizeId = await seedBonusPrize(db, contestId, 13, false);

    const { data: ticket } = await db
      .from('tickets')
      .insert({ contest_id: contestId, user_id: user.id, number: 13 })
      .select('id')
      .single();
    await db.from('winners').insert({
      contest_id: contestId,
      user_id: user.id,
      ticket_id: ticket!.id,
      prize_id: prizeId,
      type: 'bonus',
    });

    expect((await guardianMessages(db, user.id)).length).toBe(0);
  });

  test('155f guardian RPC zůstává service_role-only', async () => {
    skipIfNotEnabled();
    const db = admin();
    const user = await seedUser(db);
    const contestId = await seedContest(db);
    const prizeId = await seedBonusPrize(db, contestId, 17, true);

    const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.signInWithPassword({ email: user.email, password: user.password });

    // Úklid věkové závislosti nesmí rozvolnit oprávnění.
    const res = await client.rpc('create_guardian_notification_if_needed', {
      p_prize_id: prizeId,
      p_user_id: user.id,
      p_contest_id: contestId,
    });
    expect(res.error, 'běžný uživatel nesmí RPC zavolat').not.toBeNull();

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonRes = await anon.rpc('create_guardian_notification_if_needed', {
      p_prize_id: prizeId,
      p_user_id: user.id,
      p_contest_id: contestId,
    });
    expect(anonRes.error, 'anonym nesmí RPC zavolat').not.toBeNull();
  });
});
