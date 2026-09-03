/**
 * Spec 151 — živé chování `admin_update_winner_status` proti reálné DB
 *
 * STAGING ONLY a opt-in. Spouštět až po aplikaci migrace
 * `20260903140000_admin_update_winner_status_atomic.sql` na staging.
 *
 * Scénáře (nález A06):
 *   151a  běžný authenticated uživatel        → zamítnuto, stav se nezmění
 *   151b  admin i superadmin                  → povoleno
 *   151c  jeden krok = stav + historie + zpráva + audit (vše, nebo nic)
 *   151d  bonusová výhra dorovná bonus_prizes (winners → bonus_prizes)
 *   151e  prize-delivery dorovná winners      (bonus_prizes → winners)
 *   151f  neplatný stav je odmítnut a nic nezapíše
 *
 * Test si zakládá VLASTNÍ soutěž, výhru, bonus a uživatele a v `afterAll` je
 * uklízí. Nesahá na existující výhry, peněženky, platby ani soutěže.
 *
 * Required env:
 *   E2E_WINNER_STATUS_ATOMIC=1
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
const ENABLED = process.env.E2E_WINNER_STATUS_ATOMIC === '1';

const ADMIN_DENIED = 'Admin access required';

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_WINNER_STATUS_ATOMIC=1 a staging env');
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
  const email = `spec151-${role ?? 'user'}-${uniq()}@onemil.test`;
  const password = `Spec151-${Math.random().toString(36).slice(2, 10)}!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  if (role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: data.user.id, role });
    if (roleErr) throw new Error(`user_roles seed failed: ${roleErr.message}`);
  }
  return { id: data.user.id, email, password };
}

/** Vytvoří soutěž + volitelný bonus_prize + winner řádek pro daného uživatele. */
async function seedWinner(
  db: SupabaseClient,
  userId: string,
  opts: { withBonusPrize: boolean }
) {
  const { data: contest, error: cErr } = await db
    .from('contests')
    .insert({
      title: `E2E Spec151 ${uniq()}`,
      main_prize: 'E2E spec151 prize',
      ticket_count: 100,
      ticket_price: 10,
      status: 'active',
      next_ticket_number: 1,
      fast_game: false,
      main_image: 'https://placehold.co/800x600/1D2128/E7EBF0?text=E2E151',
    })
    .select('id')
    .single();
  if (cErr || !contest) throw new Error(`contest seed failed: ${cErr?.message}`);
  createdContestIds.push(contest.id as string);

  let prizeId: string | null = null;
  if (opts.withBonusPrize) {
    const { data: prize, error: pErr } = await db
      .from('bonus_prizes')
      .insert({
        contest_id: contest.id,
        ticket_position: 42,
        description: 'E2E spec151 věcná bonusová výhra',
        status: 'won',
      })
      .select('id')
      .single();
    if (pErr || !prize) throw new Error(`bonus_prize seed failed: ${pErr?.message}`);
    prizeId = prize.id as string;
  }

  const { data: winner, error: wErr } = await db
    .from('winners')
    .insert({
      contest_id: contest.id,
      user_id: userId,
      type: opts.withBonusPrize ? 'bonus' : 'main',
      prize_id: prizeId,
      status: 'pending',
      delivered: false,
    })
    .select('id')
    .single();
  if (wErr || !winner) throw new Error(`winner seed failed: ${wErr?.message}`);

  return { contestId: contest.id as string, prizeId, winnerId: winner.id as string };
}

async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return client;
}

const winnerRow = async (db: SupabaseClient, id: string) =>
  (await db.from('winners').select('status, delivered').eq('id', id).single()).data;

const countRows = async (db: SupabaseClient, table: string, col: string, val: string) =>
  (await db.from(table).select('*', { count: 'exact', head: true }).eq(col, val)).count ?? 0;

test.afterAll(async () => {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
  const db = admin();
  for (const contestId of createdContestIds) {
    const { data: ws } = await db.from('winners').select('id').eq('contest_id', contestId);
    for (const w of ws ?? []) {
      await db.from('winner_status_history').delete().eq('winner_id', w.id);
      await db.from('admin_actions').delete().eq('target_id', w.id);
    }
    await db.from('winners').delete().eq('contest_id', contestId);
    await db.from('bonus_prizes').delete().eq('contest_id', contestId);
    await db.from('contests').delete().eq('id', contestId);
  }
  for (const userId of createdUserIds) {
    await db.from('messages').delete().eq('user_id', userId);
    await db.from('user_roles').delete().eq('user_id', userId);
    await db.auth.admin.deleteUser(userId);
  }
});

test.describe('admin_update_winner_status — živé chování', () => {
  test('151a běžný uživatel nesmí měnit stav výhry', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const { winnerId } = await seedWinner(db, owner.id, { withBonusPrize: false });

    const intruder = await seedUser(db);
    const client = await clientFor(intruder.email, intruder.password);

    const res = await client.rpc('admin_update_winner_status', {
      p_winner_id: winnerId,
      p_new_status: 'delivered',
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain(ADMIN_DENIED);

    // Zamítnutí musí být skutečné — nic se nezměnilo.
    const row = await winnerRow(db, winnerId);
    expect(row?.status).toBe('pending');
    expect(row?.delivered).toBe(false);
    expect(await countRows(db, 'winner_status_history', 'winner_id', winnerId)).toBe(0);
  });

  test('151b admin i superadmin smí měnit stav', async () => {
    skipIfNotEnabled();
    const db = admin();

    for (const role of ['admin', 'superadmin'] as const) {
      const owner = await seedUser(db);
      const { winnerId } = await seedWinner(db, owner.id, { withBonusPrize: false });
      const actor = await seedUser(db, role);
      const client = await clientFor(actor.email, actor.password);

      const res = await client.rpc('admin_update_winner_status', {
        p_winner_id: winnerId,
        p_new_status: 'shipped',
      });

      expect(res.error, `${role} musí smět měnit stav`).toBeNull();
      expect((await winnerRow(db, winnerId))?.status).toBe('shipped');
    }
  });

  test('151c jeden krok zapíše stav + historii + zprávu + audit', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const { winnerId } = await seedWinner(db, owner.id, { withBonusPrize: false });
    const adminUser = await seedUser(db, 'admin');
    const client = await clientFor(adminUser.email, adminUser.password);

    const res = await client.rpc('admin_update_winner_status', {
      p_winner_id: winnerId,
      p_new_status: 'delivered',
      p_message: 'E2E spec151 zpráva o předání',
    });
    expect(res.error).toBeNull();

    const row = await winnerRow(db, winnerId);
    expect(row?.status).toBe('delivered');
    expect(row?.delivered, 'delivered se má zvednout při přechodu na delivered').toBe(true);

    expect(await countRows(db, 'winner_status_history', 'winner_id', winnerId)).toBe(1);
    expect(await countRows(db, 'admin_actions', 'target_id', winnerId)).toBe(1);

    const { data: msgs } = await db
      .from('messages')
      .select('content, sender, read')
      .eq('user_id', owner.id);
    expect(msgs?.length).toBe(1);
    expect(msgs?.[0].content).toBe('E2E spec151 zpráva o předání');
    expect(msgs?.[0].sender).toBe('admin');
  });

  test('151d bonusová výhra dorovná bonus_prizes (winners → bonus_prizes)', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const { winnerId, prizeId } = await seedWinner(db, owner.id, { withBonusPrize: true });
    const adminUser = await seedUser(db, 'admin');
    const client = await clientFor(adminUser.email, adminUser.password);

    const res = await client.rpc('admin_update_winner_status', {
      p_winner_id: winnerId,
      p_new_status: 'delivered',
    });
    expect(res.error).toBeNull();

    const { data: prize } = await db
      .from('bonus_prizes')
      .select('status')
      .eq('id', prizeId!)
      .single();
    expect(prize?.status, 'bonus_prizes se musí dorovnat na delivered').toBe('delivered');
  });

  test('151e prize-delivery dorovná winners (bonus_prizes → winners)', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const { winnerId, prizeId } = await seedWinner(db, owner.id, { withBonusPrize: true });
    const adminUser = await seedUser(db, 'superadmin');
    const client = await clientFor(adminUser.email, adminUser.password);

    const res = await client.rpc('update_bonus_prize_delivery_status', {
      p_prize_id: prizeId!,
      p_status: 'delivered',
      p_admin_notes: 'E2E spec151 předáno osobně',
    });
    expect(res.error).toBeNull();

    // Toto byl jádro nálezu A06: dřív zůstal winners netknutý a zákazník
    // na /wins viděl dál „čeká“.
    const row = await winnerRow(db, winnerId);
    expect(row?.status, 'winners musí být dorovnán z prize-delivery').toBe('delivered');
    expect(row?.delivered).toBe(true);
  });

  test('151f neplatný stav je odmítnut a nic nezapíše', async () => {
    skipIfNotEnabled();
    const db = admin();
    const owner = await seedUser(db);
    const { winnerId } = await seedWinner(db, owner.id, { withBonusPrize: false });
    const adminUser = await seedUser(db, 'admin');
    const client = await clientFor(adminUser.email, adminUser.password);

    const res = await client.rpc('admin_update_winner_status', {
      p_winner_id: winnerId,
      p_new_status: 'totally-invalid-status',
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain('Neplatný stav výhry');

    const row = await winnerRow(db, winnerId);
    expect(row?.status).toBe('pending');
    expect(await countRows(db, 'winner_status_history', 'winner_id', winnerId)).toBe(0);
    expect(await countRows(db, 'admin_actions', 'target_id', winnerId)).toBe(0);
  });
});
