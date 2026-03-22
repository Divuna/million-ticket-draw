/**
 * load-test-100.mjs
 *
 * Load test: 100 users × 10 tickets = 1,000 ticket purchases in parallel.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/load-test-100.mjs
 *
 * Target: BMW S 1000 RR contest (ticket_price = 1, 1,000,000 total tickets).
 *
 * Phases:
 *   1. Create 100 test users via auth signup (parallel).
 *   2. Fund each wallet: 10 coins (= enough for 10 tickets @ price 1).
 *   3. Round-1: each user buys 5 tickets in parallel  (rate limiter: 5/5 s).
 *   4. Wait 6 s for rate-limiter window to reset.
 *   5. Round-2: each user buys 5 more tickets in parallel.
 *   6. Verify: tickets, wallet_transactions, balances, contest_progress.
 *   7. Print report.
 *
 * Constraints honoured:
 *   - No schema changes.
 *   - No RLS changes.
 *   - Wallet balance topped up via service-role UPDATE (test setup only);
 *     buy_ticket_atomic and all wallet logic left completely unchanged.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ──────────────────────────────────────────────────────────────────
const SB_URL      = "https://xkzhjldrojjlrkezorey.supabase.co";
const SB_ANON     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";
// Pass service-role key as first argument (after script name) or via env var.
// Pass --no-fund to skip wallet top-up (tests concurrency/stability only).
const NO_FUND     = process.argv.includes("--no-fund");
// process.argv: [node, scriptPath, arg1, arg2, ...]
// Find first user arg that is a JWT (starts with "eyJ") or a Supabase service key
const SERVICE_KEY = process.argv.slice(2).find((a) => a.startsWith("eyJ") || a.startsWith("sbp_"))
                    || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONTEST_ID  = "4d762bfa-3202-4dda-8c66-247f2558d44f"; // BMW S 1000 RR
const NUM_USERS   = 100;
const TICKETS_PER_USER = 10;         // = ROUND1_TICKETS + ROUND2_TICKETS
const ROUND1_TICKETS   = 5;
const ROUND2_TICKETS   = 5;
const WALLET_TOPUP     = 10;         // coins per user (= ticket_price × 10)
const RATE_LIMIT_WAIT  = 6500;       // ms between rounds (rate limiter resets at 5 s)
const PURCHASE_FN_URL  = `${SB_URL}/functions/v1/purchase-ticket`;

if (!SERVICE_KEY && !NO_FUND) {
  console.error(
    "\nERROR: SUPABASE_SERVICE_ROLE_KEY not provided.\n" +
    "  Full test (1000 tickets) : SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/load-test-100.mjs\n" +
    "  Stability test only      : node scripts/load-test-100.mjs --no-fund\n"
  );
  process.exit(1);
}

// Admin client: service-role when available, anon for public-readable queries otherwise
const adminClient = createClient(SB_URL, SERVICE_KEY || SB_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function signUp(email, password) {
  if (SERVICE_KEY) {
    // Admin API: no rate limit, bypasses email confirmation
    const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method:  "POST",
      headers: {
        apikey:          SERVICE_KEY,
        Authorization:   `Bearer ${SERVICE_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`admin createUser failed for ${email}: ${JSON.stringify(body)}`);
    const userId = body.id;

    // Sign in to get a user-scoped access token (admin API only returns user data)
    const signInRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method:  "POST",
      headers: { apikey: SB_ANON, "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const signInBody = await signInRes.json();
    if (!signInRes.ok || !signInBody.access_token) {
      throw new Error(`signIn failed for ${email}: ${JSON.stringify(signInBody)}`);
    }
    return { userId, token: signInBody.access_token };
  }

  // Fallback: public signup (subject to rate limit)
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method:  "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`signup failed for ${email}: ${JSON.stringify(body)}`);
  }
  return { userId: body.user.id, token: body.access_token };
}

async function buyTicket(userToken, contestId) {
  const res = await fetch(PURCHASE_FN_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${userToken}`,
      apikey:          SB_ANON,
    },
    body: JSON.stringify({ contest_id: contestId }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

function summarise(label, results) {
  const ok         = results.filter((r) => r.body?.success === true).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const errors     = results.filter((r) => r.body?.success !== true && r.status !== 429);
  console.log(`  ${label}: OK=${ok}  rate_limited=${rateLimited}  errors=${errors.length}`);
  if (errors.length > 0 && errors.length <= 10) {
    errors.forEach((e) =>
      console.log(`    ↳ status=${e.status}  err="${e.body?.error ?? JSON.stringify(e.body)}"`)
    );
  } else if (errors.length > 10) {
    errors.slice(0, 5).forEach((e) =>
      console.log(`    ↳ status=${e.status}  err="${e.body?.error ?? JSON.stringify(e.body)}"`)
    );
    console.log(`    ↳ … and ${errors.length - 5} more`);
  }
  return { ok, rateLimited, errorCount: errors.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const T0 = Date.now();
  console.log("════════════════════════════════════════════════");
  console.log(" LOAD TEST  —  100 users × 10 tickets");
  console.log("════════════════════════════════════════════════");

  // ── Snapshot: contest state before test ─────────────────────────────────
  // contests has a public read policy — anon key is sufficient
  const contestSnap = await fetch(
    `${SB_URL}/rest/v1/contests?select=next_ticket_number&id=eq.${CONTEST_ID}`,
    { headers: { apikey: SB_ANON } }
  ).then((r) => r.json());
  const nextBefore = contestSnap?.[0]?.next_ticket_number ?? "?";
  console.log(`\n[Before] contest next_ticket_number = ${nextBefore}`);

  let totalTicketsBefore = null;
  if (SERVICE_KEY) {
    const { count } = await adminClient
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("contest_id", CONTEST_ID);
    totalTicketsBefore = count;
  }
  console.log(`[Before] tickets in DB for contest   = ${totalTicketsBefore ?? "(skipped without service key)"}`);

  // ── Phase 1: Create 100 test users ──────────────────────────────────────
  console.log(`\n── Phase 1: Creating ${NUM_USERS} test users …`);
  const ts    = Date.now();
  const users = [];
  const failed = [];

  const signupBatch = Array.from({ length: NUM_USERS }, (_, i) => ({
    email: `lt100_${ts}_u${String(i).padStart(3, "0")}@onemiltest.dev`,
    pw:    `Load1234!`,
  }));

  // Parallel signup in chunks of 20 to avoid overwhelming auth rate limiter
  const CHUNK = 20;
  for (let i = 0; i < signupBatch.length; i += CHUNK) {
    const chunk = signupBatch.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map((u) => signUp(u.email, u.pw))
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        users.push({ ...r.value, email: chunk[idx].email });
      } else {
        failed.push({ email: chunk[idx].email, err: r.reason?.message });
      }
    });
    process.stdout.write(`  ${users.length}/${NUM_USERS} created\r`);
    if (i + CHUNK < signupBatch.length) await sleep(300); // brief pause between chunks
  }
  console.log(`  Created: ${users.length}  Failed: ${failed.length}          `);
  if (failed.length > 0) {
    failed.slice(0, 3).forEach((f) => console.log(`  ↳ ${f.email}: ${f.err}`));
  }

  if (users.length === 0) {
    console.error("No users created. Aborting.");
    process.exit(1);
  }

  // ── Phase 2: Fund wallets ────────────────────────────────────────────────
  let funded = 0;
  if (NO_FUND) {
    console.log("\n── Phase 2: SKIPPED (--no-fund mode — purchases will return Insufficient balance)");
    console.log("   This run validates concurrency, rate-limiting, and system stability only.");
  } else {
    console.log(`\n── Phase 2: Funding ${users.length} wallets with ${WALLET_TOPUP} coins each …`);

    // Fetch wallet IDs for all created users
    const userIds = users.map((u) => u.userId);
    const { data: wallets, error: wErr } = await adminClient
      .from("wallets")
      .select("id, user_id, balance_coins")
      .in("user_id", userIds);

    if (wErr) throw new Error(`Failed to fetch wallets: ${wErr.message}`);

    const walletMap = {};
    (wallets ?? []).forEach((w) => { walletMap[w.user_id] = w; });

    // Users may not have wallets yet (trigger creates them on first auth event).
    const missingWalletUsers = users.filter((u) => !walletMap[u.userId]);
    if (missingWalletUsers.length > 0) {
      console.log(`  Creating ${missingWalletUsers.length} missing wallets …`);
      const { error: insertErr } = await adminClient.from("wallets").upsert(
        missingWalletUsers.map((u) => ({ user_id: u.userId, balance_coins: 0 })),
        { onConflict: "user_id" }
      );
      if (insertErr) console.warn(`  Wallet upsert warning: ${insertErr.message}`);
      const { data: wallets2 } = await adminClient
        .from("wallets")
        .select("id, user_id, balance_coins")
        .in("user_id", userIds);
      (wallets2 ?? []).forEach((w) => { walletMap[w.user_id] = w; });
    }

    // Top up balances
    for (let i = 0; i < users.length; i += CHUNK) {
      const chunk = users.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (u) => {
          const w = walletMap[u.userId];
          if (!w) { console.warn(`  No wallet for ${u.email}`); return; }
          const { error } = await adminClient
            .from("wallets")
            .update({ balance_coins: w.balance_coins + WALLET_TOPUP })
            .eq("id", w.id);
          if (error) console.warn(`  Fund error ${u.email}: ${error.message}`);
          else funded++;
        })
      );
    }
    console.log(`  Funded: ${funded}/${users.length}`);
  }

  // ── Phase 3: Round 1 — 5 tickets per user ───────────────────────────────
  console.log(`\n── Phase 3 (Round 1): ${users.length} users × ${ROUND1_TICKETS} tickets in parallel …`);
  const t1Start = Date.now();

  const round1Tasks = users.flatMap((u) =>
    Array.from({ length: ROUND1_TICKETS }, () =>
      buyTicket(u.token, CONTEST_ID).catch((err) => ({ status: 0, body: { error: err.message } }))
    )
  );
  const round1Results = await Promise.all(round1Tasks);
  const t1Elapsed = Date.now() - t1Start;

  const r1 = summarise(`Round-1 (${users.length * ROUND1_TICKETS} requests, ${t1Elapsed} ms)`, round1Results);

  // ── Phase 4: Wait for rate limiter window ────────────────────────────────
  console.log(`\n── Phase 4: Waiting ${RATE_LIMIT_WAIT / 1000}s for rate-limiter window reset …`);
  await sleep(RATE_LIMIT_WAIT);

  // ── Phase 5: Round 2 — 5 more tickets per user ──────────────────────────
  console.log(`── Phase 5 (Round 2): ${users.length} users × ${ROUND2_TICKETS} tickets in parallel …`);
  const t2Start = Date.now();

  const round2Tasks = users.flatMap((u) =>
    Array.from({ length: ROUND2_TICKETS }, () =>
      buyTicket(u.token, CONTEST_ID).catch((err) => ({ status: 0, body: { error: err.message } }))
    )
  );
  const round2Results = await Promise.all(round2Tasks);
  const t2Elapsed = Date.now() - t2Start;

  const r2 = summarise(`Round-2 (${users.length * ROUND2_TICKETS} requests, ${t2Elapsed} ms)`, round2Results);

  const totalOk = r1.ok + r2.ok;

  // ── Phase 6: Verification ────────────────────────────────────────────────
  console.log("\n── Phase 6: Verification …");
  await sleep(1000); // brief settle time

  // a) Tickets created
  const { count: totalTicketsAfter } = await adminClient
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("contest_id", CONTEST_ID);
  const newTickets = (totalTicketsAfter ?? 0) - (totalTicketsBefore ?? 0);
  console.log(`  Tickets in DB after  : ${totalTicketsAfter}`);
  console.log(`  New tickets created  : ${newTickets}  (expected ≤ ${NUM_USERS * TICKETS_PER_USER})`);

  // b) Duplicate ticket numbers — fetch recent tickets and check in JS
  const { data: recentTickets } = await adminClient
    .from("tickets")
    .select("id, number, user_id, created_at")
    .eq("contest_id", CONTEST_ID)
    .order("created_at", { ascending: false })
    .limit(1500);

  const ticketNumbers = (recentTickets ?? []).map((t) => t.number);
  const numSet = new Set(ticketNumbers);
  const hasDuplicates = numSet.size < ticketNumbers.length;
  console.log(`  Duplicate ticket numbers : ${hasDuplicates ? "YES — CRITICAL" : "NONE ✓"}`);

  // c) Contest next_ticket_number
  const contestSnapAfter = await fetch(
    `${SB_URL}/rest/v1/contests?select=next_ticket_number&id=eq.${CONTEST_ID}`,
    { headers: { apikey: SB_ANON } }
  ).then((r) => r.json());
  const nextAfterVal = contestSnapAfter?.[0]?.next_ticket_number;
  const expectedNext = (Number(nextBefore) || 1) + newTickets;
  const nextOk = Number(nextAfterVal) === expectedNext;
  console.log(`  next_ticket_number before: ${nextBefore}`);
  console.log(`  next_ticket_number after : ${nextAfterVal}`);
  console.log(`  next_ticket_number check : ${nextOk ? "OK ✓" : "MISMATCH — check for race condition"}`);

  // d) Wallet balances — negative check
  const testUserIds = users.map((u) => u.userId);
  const { data: walletsAfter } = await adminClient
    .from("wallets")
    .select("user_id, balance_coins")
    .in("user_id", testUserIds);

  const negativeBalances = (walletsAfter ?? []).filter((w) => Number(w.balance_coins) < 0);
  console.log(`  Negative wallet balances : ${negativeBalances.length === 0 ? "NONE ✓" : negativeBalances.length + " — CRITICAL"}`);

  // e) Wallet transactions — count for test users
  const { count: txCount } = await adminClient
    .from("wallet_transactions")
    .select("*", { count: "exact", head: true })
    .in("user_id", testUserIds)
    .lt("amount", 0); // ticket purchases are debits

  console.log(`  Wallet debit transactions: ${txCount ?? "N/A"}  (expected ≈ ${newTickets})`);
  const missingTx = txCount !== null ? Math.max(0, newTickets - txCount) : "unknown";
  console.log(`  Missing wallet_transactions: ${missingTx}`);

  // f) contest_progress view
  const { data: progress } = await adminClient
    .from("contest_progress")
    .select("contest_id, tickets_total, tickets_sold, tickets_remaining, sold_percent")
    .eq("contest_id", CONTEST_ID)
    .single();
  console.log(`  contest_progress.tickets_sold : ${progress?.tickets_sold ?? "N/A"}`);
  console.log(`  contest_progress.sold_percent : ${progress?.sold_percent ?? "N/A"}%`);

  // g) Race condition detection: verify max(ticket.number) + 1 === next_ticket_number
  const { data: maxTicketRow } = await adminClient
    .from("tickets")
    .select("number")
    .eq("contest_id", CONTEST_ID)
    .order("number", { ascending: false })
    .limit(1);
  const maxNum = maxTicketRow?.[0]?.number ?? 0;
  const raceOk = maxNum + 1 === Number(nextAfterVal);
  console.log(`  max(ticket.number) + 1 === next : ${raceOk ? "OK ✓" : "RACE CONDITION DETECTED"} (max=${maxNum}, next=${nextAfterVal})`);

  // ── Final report ─────────────────────────────────────────────────────────
  const totalElapsed = Date.now() - T0;

  console.log("\n════════════════════════════════════════════════");
  console.log(" LOAD TEST REPORT");
  console.log("════════════════════════════════════════════════");
  console.log(`  Mode                  : ${NO_FUND ? "stability (--no-fund)" : "full test"}`);
  console.log(`  Users created         : ${users.length} / ${NUM_USERS}`);
  console.log(`  Wallets funded        : ${NO_FUND ? "N/A (skipped)" : funded}`);
  console.log(`  Tickets created       : ${newTickets} / ${NUM_USERS * TICKETS_PER_USER}`);
  console.log(`  Round-1 successes     : ${r1.ok} / ${users.length * ROUND1_TICKETS}`);
  console.log(`  Round-2 successes     : ${r2.ok} / ${users.length * ROUND2_TICKETS}`);
  console.log(`  Rate-limited requests : ${r1.rateLimited + r2.rateLimited}`);
  console.log(`  Error requests        : ${r1.errorCount + r2.errorCount}`);
  console.log(`  Duplicate tickets     : ${hasDuplicates ? "YES — CRITICAL" : "NONE"}`);
  console.log(`  Negative balances     : ${negativeBalances.length}`);
  console.log(`  next_ticket_number    : ${nextOk && raceOk ? "correct" : "MISMATCH"}`);
  console.log(`  Missing wallet tx     : ${missingTx}`);
  console.log(`  Round-1 duration      : ${t1Elapsed} ms  (throughput: ${Math.round((r1.ok / t1Elapsed) * 1000)} ok/s)`);
  console.log(`  Round-2 duration      : ${t2Elapsed} ms  (throughput: ${Math.round((r2.ok / t2Elapsed) * 1000)} ok/s)`);
  console.log(`  Total wall-clock time : ${totalElapsed} ms`);

  const passed =
    !hasDuplicates &&
    negativeBalances.length === 0 &&
    nextOk &&
    raceOk &&
    newTickets === totalOk;

  console.log(`\n  RESULT: ${passed ? "PASS ✓" : "ISSUES FOUND"}`);
  if (!passed) {
    if (hasDuplicates)               console.log("  ⚠ Duplicate ticket numbers detected.");
    if (negativeBalances.length > 0) console.log(`  ⚠ ${negativeBalances.length} wallet(s) went negative.`);
    if (!nextOk)                     console.log("  ⚠ next_ticket_number mismatch.");
    if (!raceOk)                     console.log("  ⚠ Race condition: max ticket number doesn't align with next_ticket_number.");
    if (newTickets !== totalOk)      console.log(`  ⚠ DB tickets (${newTickets}) ≠ successful API calls (${totalOk}).`);
  }
  console.log("════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
