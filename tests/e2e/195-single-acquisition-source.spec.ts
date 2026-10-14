/**
 * Spec 195 — jeden odměňovaný zdroj přivedení hráče (affiliate NEBO hráčské doporučení).
 *
 * STAGING ONLY. Skutečný souběh: přihlášený hráč zavolá současně
 * set_my_referrer_by_code i record_affiliate_customer_ref se STEJNÝM kódem
 * (přesně to se děje po registraci s ?ref=, kdy Register.tsx uloží kód do obou
 * pending klíčů). Vznikne právě jeden zdroj, druhé volání vrátí čitelný stav
 * `already_attributed_to_other_source` a nic nezapíše.
 * Jednotlivá pravidla: `supabase/tests/single_acquisition_source_scenarios.sql`.
 *
 * Required env: VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const MIGRATION = 'supabase/migrations/20260927100000_single_player_acquisition_source.sql';

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const rand = () => Math.random().toString(36).slice(2, 10);
const createdUserIds: string[] = [];

async function createUser(db: SupabaseClient): Promise<{ id: string; email: string; password: string }> {
  const email = `spec195-${Date.now()}-${rand()}@onemil.test`;
  const password = `Spec195-${rand()}!A1`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  const { error: e2 } = await db.from('users').upsert({ id: data.user.id, email }, { onConflict: 'id' });
  if (e2) throw new Error(`public.users seed failed: ${e2.message}`);
  return { id: data.user.id, email, password };
}

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return c;
}

/** Stejný kód existuje jako hráčský doporučovací kód i jako affiliate ref_code. */
async function sharedCode(db: SupabaseClient): Promise<string> {
  const code = `S195${rand().toUpperCase()}`;
  const referrer = await createUser(db);
  const { error: e1 } = await db.from('referral_codes').upsert({ user_id: referrer.id, code }, { onConflict: 'user_id' });
  if (e1) throw new Error(`referral_codes: ${e1.message}`);
  const { error: e2 } = await db.from('affiliate_accounts').insert({
    name: `Spec195 ${rand()}`, email: `spec195-aff-${rand()}@onemil.test`, ref_code: code,
    modes: ['influencer'], status: 'approved', commission_rate_customer: 5, commission_rate_company: 5,
  });
  if (e2) throw new Error(`affiliate_accounts: ${e2.message}`);
  return code;
}

async function sources(db: SupabaseClient, userId: string) {
  const { count: ref } = await db.from('referrals').select('referred_user_id', { count: 'exact', head: true }).eq('referred_user_id', userId);
  const { count: aff } = await db.from('affiliate_customer_refs').select('user_id', { count: 'exact', head: true }).eq('user_id', userId);
  return { ref: ref ?? 0, aff: aff ?? 0 };
}

test.describe('195 jeden zdroj přivedení hráče (staging DB + kontrakt)', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    for (const id of createdUserIds) await db.auth.admin.deleteUser(id);
  });

  test('195a: souběh affiliate × hráčské doporučení se stejným kódem → vždy přesně jeden zdroj', async () => {
    test.setTimeout(240_000);
    test.skip(!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE || !SUPABASE_ANON, 'staging-only');
    const db = admin();
    const winners: string[] = [];

    for (let round = 0; round < 10; round++) {
      const code = await sharedCode(db);
      const player = await createUser(db);
      // dva nezávislé klienty = dvě nezávislá HTTP spojení / DB transakce
      const [c1, c2] = await Promise.all([signedIn(player.email, player.password), signedIn(player.email, player.password)]);
      const referral = () => c1.rpc('set_my_referrer_by_code', { p_code: code, p_source: 'signup' });
      const affiliate = () => c2.rpc('record_affiliate_customer_ref', { p_ref_code: code });
      const [ref, aff] = round % 2 === 0
        ? await Promise.all([referral(), affiliate()])
        : (await Promise.all([affiliate(), referral()])).reverse() as [Awaited<ReturnType<typeof referral>>, Awaited<ReturnType<typeof affiliate>>];

      expect(ref.error).toBeNull();
      expect(aff.error).toBeNull();
      const refStatus = ref.data as string;
      const affStatus = (aff.data as { status: string }).status;
      const s = await sources(db, player.id);
      expect(s.ref + s.aff).toBe(1);
      if (s.ref === 1) {
        expect(refStatus).toBe('accepted');
        expect(affStatus).toBe('already_attributed_to_other_source');
        winners.push('referral');
      } else {
        expect(affStatus).toBe('recorded');
        expect(refStatus).toBe('rejected:already_attributed_to_other_source');
        winners.push('affiliate');
      }

      // opakování obou požadavků nic nezmění
      const again = await Promise.all([referral(), affiliate()]);
      for (const r of again) expect(r.error).toBeNull();
      expect(await sources(db, player.id)).toEqual(s);
    }
    console.log('195a winners:', winners.join(','));
  });

  test('195b: kontrakt — obě funkce berou zámek zdroje a hlídají druhý systém, pojistné triggery existují', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('PERFORM public._acquisition_source_lock(v_me);');
    expect(sql).toContain('PERFORM public._acquisition_source_lock(v_uid);');
    expect(sql).toContain("RETURN 'rejected:already_attributed_to_other_source';");
    expect(sql).toContain("RETURN jsonb_build_object('status', 'already_attributed_to_other_source');");
    expect(sql).toContain('before insert or update of referred_user_id on public.referrals');
    expect(sql).toContain('before insert or update of user_id on public.affiliate_customer_refs');
    // vnitřní first-touch a self-referral zůstávají
    expect(sql).toContain("RETURN 'rejected:already_has_referrer';");
    expect(sql).toContain("RETURN jsonb_build_object('status', 'already_attributed'); END IF;");
    expect(sql).toContain("RETURN jsonb_build_object('status', 'self_referral'); END IF;");
    expect(sql).toContain("RETURN 'rejected:self_referral';");
    // zákaznická UI zná nový stav (žádná technická chyba)
    const ui = readFileSync('src/components/ReferralSection.tsx', 'utf8');
    expect(ui).toContain("'rejected:already_attributed_to_other_source'");
  });
});
