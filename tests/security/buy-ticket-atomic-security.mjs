/**
 * buy_ticket_atomic security verification — STAGING ONLY.
 *
 * Covers (migration 20260717190000_buy_ticket_atomic_auth_and_wallet_tx):
 *   1. anon (no JWT) cannot call the RPC (EXECUTE revoked from anon)
 *   2. authenticated caller passing a FOREIGN p_user_id -> { error: 'Forbidden' },
 *      no ticket, no deduction from the foreign wallet
 *   3. happy path: deduction + one wallet_transactions row with correct
 *      user_id / amount / balance_after / type / source / reference_id / metadata
 *   4. double-click + concurrent purchases: unique ticket numbers, exact total
 *      deduction, one wallet_transactions row per ticket
 *   5. insufficient MioCoins -> 'Nedostatek miocoinu', no ticket
 *   6. paused contest -> 'Contest not active'; full contest -> 'Contest full'
 *   7. bonus win (position 2) and main win (last ticket, contest closes)
 *
 * Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, BTX_TEST_PASSWORD.
 * Seed data (users e2e-btx-a/b@onemil.cz, contests 'TEST BTX STAGING ONLY *')
 * is created and cleaned up separately via SQL. Refuses to run outside the
 * staging project ref.
 *
 * Run: node tests/security/buy-ticket-atomic-security.mjs
 */

const URL_BASE = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const PASSWORD = process.env.BTX_TEST_PASSWORD;

if (!URL_BASE || !ANON || !PASSWORD) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / BTX_TEST_PASSWORD');
  process.exit(2);
}
if (!URL_BASE.includes('dxmowysntemfqfnanxua')) {
  console.error('Refusing to run outside staging (dxmowysntemfqfnanxua).');
  process.exit(2);
}

const USER_A = { email: 'e2e-btx-a@onemil.cz', id: '9b100000-0000-4000-8000-00000000000a' };
const USER_B = { email: 'e2e-btx-b@onemil.cz', id: '9b100000-0000-4000-8000-00000000000b' };
const C_MAIN = '9b200000-0000-4000-8000-000000000001';
const C_PAUSED = '9b200000-0000-4000-8000-000000000002';
const C_FULL = '9b200000-0000-4000-8000-000000000003';
const C_CONC = '9b200000-0000-4000-8000-000000000004';

let failures = 0;
function check(name, cond, detail) {
  const ok = Boolean(cond);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -- ' + JSON.stringify(detail)}`);
  if (!ok) failures++;
}

async function signIn(email) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function rpc(jwt, payload) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/buy_ticket_atomic`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

async function rest(jwt, path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });
  return res.json();
}

const jwtA = await signIn(USER_A.email);
const jwtB = await signIn(USER_B.email);

// ── 1. anon cannot call the RPC ──────────────────────────────────────────────
{
  const r = await rpc(null, { p_contest_id: C_MAIN, p_user_id: USER_A.id });
  check('anon call is rejected (401/permission denied)',
    r.status === 401 || r.status === 403 ||
    (r.status >= 400 && JSON.stringify(r.body).includes('permission denied')),
    r);
}

// ── 2. foreign p_user_id -> Forbidden, no side effects on B ─────────────────
{
  const r = await rpc(jwtB, { p_contest_id: C_MAIN, p_user_id: USER_A.id });
  check('foreign user_id returns Forbidden', r.body?.success === false && r.body?.error === 'Forbidden', r);
  const walletA = await rest(jwtA, `wallets?user_id=eq.${USER_A.id}&select=balance_coins`);
  check('victim wallet untouched (50)', Number(walletA?.[0]?.balance_coins) === 50, walletA);
}

// ── 3+7. happy path on MAIN contest: plain, bonus, main win ─────────────────
{
  const r1 = await rpc(jwtA, { p_contest_id: C_MAIN, p_user_id: USER_A.id });
  check('ticket 1 success, no win', r1.body?.success === true && r1.body?.ticket_number === 1 && r1.body?.won_type === null, r1);

  const r2 = await rpc(jwtA, { p_contest_id: C_MAIN, p_user_id: USER_A.id });
  check('ticket 2 is BONUS win', r2.body?.success === true && r2.body?.won_type === 'bonus', r2);

  const r3 = await rpc(jwtA, { p_contest_id: C_MAIN, p_user_id: USER_A.id });
  check('ticket 3 is MAIN win', r3.body?.success === true && r3.body?.won_type === 'main', r3);

  const r4 = await rpc(jwtA, { p_contest_id: C_MAIN, p_user_id: USER_A.id });
  check('contest closed after main win', r4.body?.success === false && r4.body?.error === 'Contest not active', r4);

  const wallet = await rest(jwtA, `wallets?user_id=eq.${USER_A.id}&select=balance_coins`);
  check('wallet A = 47 after 3 tickets', Number(wallet?.[0]?.balance_coins) === 47, wallet);

  const txs = await rest(jwtA,
    `wallet_transactions?user_id=eq.${USER_A.id}&type=eq.ticket_purchase&metadata->>contest_id=eq.${C_MAIN}&select=*&order=created_at.asc`);
  check('3 wallet_transactions rows for MAIN contest', Array.isArray(txs) && txs.length === 3, txs);
  if (Array.isArray(txs) && txs.length === 3) {
    const balances = txs.map((t) => Number(t.balance_after)).sort((x, y) => y - x);
    check('amounts are -1', txs.every((t) => Number(t.amount) === -1), txs);
    check('balance_after chain 49,48,47', JSON.stringify(balances) === JSON.stringify([49, 48, 47]), balances);
    check('source=buy_ticket_atomic + wallet_id + user_id set',
      txs.every((t) => t.source === 'buy_ticket_atomic' && t.wallet_id && t.user_id === USER_A.id), txs);
    check('metadata has contest_id + ticket_number',
      txs.every((t) => t.metadata?.contest_id === C_MAIN && Number.isInteger(t.metadata?.ticket_number)), txs);
    // reference_id must be a distinct ticket id per row. Customers cannot read
    // raw tickets on staging (admin-only RLS), so the authoritative
    // reference_id -> tickets.id join is verified via SQL in the runbook;
    // here we assert non-null uniqueness and, when tickets are readable,
    // the full match.
    const refs = txs.map((t) => t.reference_id);
    check('reference_id set and unique per transaction',
      refs.every((r) => typeof r === 'string') && new Set(refs).size === refs.length, txs);
    const tickets = await rest(jwtA, `tickets?contest_id=eq.${C_MAIN}&user_id=eq.${USER_A.id}&select=id,number`);
    if (Array.isArray(tickets) && tickets.length > 0) {
      const ticketIds = new Set(tickets.map((t) => t.id));
      check('reference_id points to the purchased ticket rows',
        refs.every((r) => ticketIds.has(r)), { txs, tickets });
    }
  }

  const winners = await rest(jwtA, `winners?contest_id=eq.${C_MAIN}&select=type`);
  const types = (winners ?? []).map((w) => w.type).sort();
  check('winners = [bonus, main]', JSON.stringify(types) === JSON.stringify(['bonus', 'main']), winners);
}

// ── 5. insufficient funds (user B, balance 0.4) ─────────────────────────────
{
  const r = await rpc(jwtB, { p_contest_id: C_CONC, p_user_id: USER_B.id });
  check('insufficient MioCoins rejected', r.body?.success === false && r.body?.error === 'Nedostatek miocoinu', r);
  const wb = await rest(jwtB, `wallets?user_id=eq.${USER_B.id}&select=balance_coins`);
  check('B wallet untouched (0.4)', Number(wb?.[0]?.balance_coins) === 0.4, wb);
  const tb = await rest(jwtB, `wallet_transactions?user_id=eq.${USER_B.id}&type=eq.ticket_purchase&select=id`);
  check('no ticket_purchase transaction for B', Array.isArray(tb) && tb.length === 0, tb);
}

// ── 6. paused + full contests ───────────────────────────────────────────────
{
  const rp = await rpc(jwtA, { p_contest_id: C_PAUSED, p_user_id: USER_A.id });
  check('paused contest rejected', rp.body?.success === false && rp.body?.error === 'Contest not active', rp);
  const rf = await rpc(jwtA, { p_contest_id: C_FULL, p_user_id: USER_A.id });
  check('full contest rejected', rf.body?.success === false && rf.body?.error === 'Contest full', rf);
}

// ── 4. double-click + concurrency on CONC contest ───────────────────────────
{
  const before = await rest(jwtA, `wallets?user_id=eq.${USER_A.id}&select=balance_coins`);
  const startBalance = Number(before?.[0]?.balance_coins);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => rpc(jwtA, { p_contest_id: C_CONC, p_user_id: USER_A.id })),
  );
  const oks = results.filter((r) => r.body?.success === true);
  const numbers = oks.map((r) => r.body.ticket_number);
  check('5 concurrent purchases all succeed', oks.length === 5, results.map((r) => r.body));
  check('ticket numbers unique', new Set(numbers).size === numbers.length, numbers);

  const after = await rest(jwtA, `wallets?user_id=eq.${USER_A.id}&select=balance_coins`);
  check(`exactly ${oks.length} MioCoins deducted concurrently`,
    Number(after?.[0]?.balance_coins) === startBalance - oks.length, { startBalance, after });

  const txs = await rest(jwtA,
    `wallet_transactions?user_id=eq.${USER_A.id}&type=eq.ticket_purchase&metadata->>contest_id=eq.${C_CONC}&select=amount,balance_after,reference_id`);
  check('one wallet tx per concurrent ticket', Array.isArray(txs) && txs.length === oks.length, txs);
  if (Array.isArray(txs) && txs.length === oks.length) {
    const balancesDesc = txs.map((t) => Number(t.balance_after)).sort((x, y) => y - x);
    const expected = Array.from({ length: oks.length }, (_, i) => startBalance - 1 - i);
    check('concurrent balance_after chain is consistent',
      JSON.stringify(balancesDesc) === JSON.stringify(expected), { balancesDesc, expected });
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
