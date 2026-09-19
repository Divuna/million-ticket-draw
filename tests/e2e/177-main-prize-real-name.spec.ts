/**
 * Spec 177 — Hlavní výhra vrací skutečný název ceny, ne zástupný text
 *
 * Regresní zámek k migraci
 * `20260918100000_main_prize_uses_contest_main_prize.sql`.
 *
 * Do opravy vracela `assign_contest_ticket_atomic` pro poslední tiket natvrdo
 * zapsaný řetězec 'Hlavni vyhra' (bez diakritiky), takže výherní modal ukázal
 * zástupný text místo skutečné ceny ze soutěže.
 *
 * Staging-only, self-contained: zakládá si vlastní jednotiketovou soutěž,
 * na konci ji uklidí. Nekupuje nic za MioCoiny a nesahá na cizí data.
 *
 * 177a poslední tiket vrátí contests.main_prize (ne 'Hlavni vyhra')
 * 177b bonusová výhra dál vrací název bonusové ceny (nedotčená větev)
 * 177c prázdný (mezerový) main_prize spadne na bezpečný fallback
 *
 * Pozn. k 177c: `contests.main_prize` je NOT NULL, takže soutěž s NULL
 * názvem vůbec nemůže vzniknout. Dosažitelná je jen varianta s prázdným
 * / mezerovým řetězcem, kterou fallback `nullif(btrim(...), '')` řeší —
 * proto test používá '   ', ne NULL.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging = SUPABASE_URL.includes(STAGING_REF) && !!SERVICE_ROLE;

const RUN_ID       = Date.now();
const TITLE_PREFIX = `E2E Spec177 ${RUN_ID}`;
const MAIN_PRIZE   = 'Skutečná hlavní výhra ěščřž';
const RULES_PDF    = 'https://example.invalid/spec177-rules.pdf';

const svc = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/** Soutěž, kde je hned první tiket zároveň posledním = hlavní výhra. */
async function createOneTicketContest(
  db: SupabaseClient,
  suffix: string,
  mainPrize: string | null,
): Promise<string> {
  const { data, error } = await (db as any)
    .from('contests')
    .insert({
      title: `${TITLE_PREFIX} ${suffix}`,
      name: `${TITLE_PREFIX} ${suffix}`,
      main_prize: mainPrize,
      main_image: 'https://example.invalid/spec177.png',
      rules_pdf_url: RULES_PDF,
      ticket_count: 1,
      ticket_price: 1,
      status: 'active',
      next_ticket_number: 1,
    })
    .select('id')
    .single();
  expect(error, `contest insert: ${JSON.stringify(error)}`).toBeNull();
  return data.id as string;
}

async function anyUserId(db: SupabaseClient): Promise<string> {
  const { data } = await (db as any)
    .from('users').select('id').eq('email', 'spec100-fixture@onemil.cz').maybeSingle();
  expect(data?.id, 'staging fixture uživatel musí existovat').toBeTruthy();
  return data.id as string;
}

test.describe.serial('177 — hlavní výhra vrací skutečný název', () => {
  test.skip(!isStaging, 'staging-only — vyžaduje staging URL a service role');

  test.afterAll(async () => {
    if (!isStaging) return;
    const db = svc();
    const { data: rows } = await (db as any)
      .from('contests').select('id').like('title', `${TITLE_PREFIX}%`);
    for (const row of rows ?? []) {
      await (db as any).from('winners').delete().eq('contest_id', row.id);
      await (db as any).from('tickets').delete().eq('contest_id', row.id);
      await (db as any).from('bonus_prizes').delete().eq('contest_id', row.id);
    }
    await (db as any).from('contests').delete().like('title', `${TITLE_PREFIX}%`);
  });

  test('177a: poslední tiket vrátí contests.main_prize, ne hardcoded text', async () => {
    const db = svc();
    const userId    = await anyUserId(db);
    const contestId = await createOneTicketContest(db, 'a', MAIN_PRIZE);

    const { data, error } = await (db as any).rpc('assign_contest_ticket_atomic', {
      p_user_id: userId,
      p_contest_id: contestId,
    });
    expect(error, JSON.stringify(error)).toBeNull();

    expect(data?.success).toBe(true);
    expect(data?.ticket_number).toBe(1);
    expect(data?.won_type, 'poslední tiket musí být hlavní výhra').toBe('main');

    // Jádro regrese: skutečný název ceny, ne zástupný řetězec.
    expect(data?.won_prize).toBe(MAIN_PRIZE);
    expect(data?.won_prize, 'nesmí se vrátit hardcoded placeholder').not.toBe('Hlavni vyhra');
  });

  test('177b: bonusová výhra dál vrací název bonusové ceny', async () => {
    const db = svc();
    const userId = await anyUserId(db);

    // Dvoutiketová soutěž: bonus na #1, hlavní výhra až na #2.
    const { data: contest, error: contestErr } = await (db as any)
      .from('contests')
      .insert({
        title: `${TITLE_PREFIX} b`,
        name: `${TITLE_PREFIX} b`,
        main_prize: MAIN_PRIZE,
        main_image: 'https://example.invalid/spec177.png',
        rules_pdf_url: RULES_PDF,
        ticket_count: 2,
        ticket_price: 1,
        status: 'active',
        next_ticket_number: 1,
      })
      .select('id')
      .single();
    expect(contestErr, JSON.stringify(contestErr)).toBeNull();

    const { error: bonusErr } = await (db as any).from('bonus_prizes').insert({
      contest_id: contest.id,
      ticket_position: 1,
      description: 'Spec177 bonusová cena',
      status: 'pending',
    });
    expect(bonusErr, JSON.stringify(bonusErr)).toBeNull();

    const { data, error } = await (db as any).rpc('assign_contest_ticket_atomic', {
      p_user_id: userId,
      p_contest_id: contest.id,
    });
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data?.won_type).toBe('bonus');
    expect(data?.won_prize, 'bonusová větev zůstává beze změny').toBe('Spec177 bonusová cena');
  });

  test('177c: prázdný main_prize použije bezpečný fallback', async () => {
    const db = svc();
    const userId    = await anyUserId(db);
    // NOT NULL sloupec prázdný řetězec připouští — tohle je reálně
    // dosažitelný vstup do fallbacku, na rozdíl od NULL.
    const contestId = await createOneTicketContest(db, 'c', '   ');

    const { data, error } = await (db as any).rpc('assign_contest_ticket_atomic', {
      p_user_id: userId,
      p_contest_id: contestId,
    });
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data?.won_type).toBe('main');

    // Samotné `toBeTruthy()` by tu neobstálo: '   ' je truthy, takže by test
    // prošel i s rozbitým fallbackem. Ověřujeme proto, že se fallback opravdu
    // uplatnil a výhra nikdy nezůstane bez názvu.
    expect(String(data?.won_prize).trim(), 'výhra nesmí zůstat bez názvu').not.toBe('');
    expect(data?.won_prize, 'prázdný main_prize musí spadnout na fallback').toBe('Hlavni vyhra');
  });
});
