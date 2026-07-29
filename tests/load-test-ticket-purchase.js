/**
 * OneMil Contest Engine — Concurrent Load Test
 *
 * Tests buy_ticket_atomic under high concurrency to verify:
 *   - ticket numbers stay unique
 *   - wallet balances never go negative
 *   - no duplicate main winners are created
 *   - all operations are atomic
 *
 * Usage:
 *   node tests/load-test-ticket-purchase.js
 *
 * Requirements:
 *   - Node.js 18+ (native fetch)
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY set in .env
 *     OR hardcoded in CONFIG below for one-off runs.
 *
 * Strategy:
 *   1. Create N ephemeral test users via admin API (each with a fresh wallet).
 *   2. Sign each user in to obtain a JWT.
 *   3. Fire all purchase requests concurrently via Promise.allSettled.
 *   4. Query the DB to verify integrity guarantees.
 *   5. Clean up test users.
 */

import { createClient } from "@supabase/supabase-js";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  supabaseUrl:        process.env.SUPABASE_URL        ?? "https://xkzhjldrojjlrkezorey.supabase.co",
  serviceRoleKey:     process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",   // fill before running
  anonKey:            process.env.SUPABASE_ANON_KEY   ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U",

  // Active contest to target — BMW S 1000 RR
  contestId:          "4d762bfa-3202-4dda-8c66-247f2558d44f",

  // How many concurrent purchases to simulate
  concurrency:        50,    // start with 50; raise to 200/500 after verifying

  // Starting wallet balance per test user (must cover ticket_price × 1 at minimum)
  walletBalance:      200,

  // Edge function endpoint path (relative to supabaseUrl/functions/v1/)
  purchaseEndpoint:   "purchase-ticket",

  // Prefix for ephemeral test accounts — easy to clean up
  testEmailPrefix:    "loadtest-",
  testEmailDomain:    "@onemil-loadtest.invalid",

  // If true, remove all created test users after the run
  cleanup:            true,
};
// ─────────────────────────────────────────────────────────────────────────────

const admin = createClient(CONFIG.supabaseUrl, CONFIG.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, -5);
}

function log(msg) {
  console.log(`[${now()}] ${msg}`);
}

async function queryDb(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/xkzhjldrojjlrkezorey/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONFIG.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) throw new Error(`DB query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Phase 1: Create test users ───────────────────────────────────────────────

async function createTestUser(index) {
  const email = `${CONFIG.testEmailPrefix}${index}${CONFIG.testEmailDomain}`;
  const password = `LoadTest#${index}#2026`;

  // Create auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) throw new Error(`createUser[${index}] auth error: ${authErr.message}`);

  const userId = authData.user.id;

  // Insert public.users row (needed by buy_ticket_atomic → auth.uid() check)
  await admin.from("users").upsert({ id: userId, email, role: "user" });

  // Create wallet with test balance
  const { error: walletErr } = await admin.from("wallets").insert({
    user_id: userId,
    balance_coins: CONFIG.walletBalance,
  });
  if (walletErr) throw new Error(`createUser[${index}] wallet error: ${walletErr.message}`);

  return { userId, email, password, index };
}

// ── Phase 2: Sign each user in and get JWT ───────────────────────────────────

async function signIn(user) {
  const anonClient = createClient(CONFIG.supabaseUrl, CONFIG.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`signIn[${user.index}] failed: ${error.message}`);
  return { ...user, jwt: data.session.access_token };
}

// ── Phase 3: Send purchase request ──────────────────────────────────────────

async function purchaseTicket(user) {
  const t0 = Date.now();
  try {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/functions/v1/${CONFIG.purchaseEndpoint}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.jwt}`,
          "Content-Type": "application/json",
          apikey: CONFIG.anonKey,
        },
        body: JSON.stringify({ contest_id: CONFIG.contestId }),
      }
    );
    const body = await res.json();
    const elapsed = Date.now() - t0;
    return { userId: user.userId, index: user.index, ok: res.ok, status: res.status, body, elapsed };
  } catch (err) {
    return { userId: user.userId, index: user.index, ok: false, status: 0, body: { error: err.message }, elapsed: Date.now() - t0 };
  }
}

// ── Phase 4: Integrity verification ─────────────────────────────────────────

async function verifyIntegrity(userIds) {
  const results = {};

  // 1. Duplicate ticket numbers
  const dupeTickets = await queryDb(`
    SELECT contest_id, number, COUNT(*) cnt
    FROM public.tickets
    WHERE contest_id = '${CONFIG.contestId}'
    GROUP BY contest_id, number
    HAVING COUNT(*) > 1
    LIMIT 10
  `);
  results.duplicateTickets = Array.isArray(dupeTickets) ? dupeTickets.length : 0;

  // 2. Multiple main winners
  const dupeWinners = await queryDb(`
    SELECT contest_id, COUNT(*) cnt
    FROM public.winners
    WHERE contest_id = '${CONFIG.contestId}' AND type = 'main'
    GROUP BY contest_id
    HAVING COUNT(*) > 1
    LIMIT 5
  `);
  results.duplicateMainWinners = Array.isArray(dupeWinners) ? dupeWinners.length : 0;

  // 3. Negative wallet balances for test users
  const negativeWallets = await queryDb(`
    SELECT user_id, balance_coins
    FROM public.wallets
    WHERE user_id = ANY(ARRAY['${userIds.join("','")}']::uuid[])
      AND balance_coins < 0
    LIMIT 10
  `);
  results.negativeWallets = Array.isArray(negativeWallets) ? negativeWallets.length : 0;
  results.negativeWalletDetails = negativeWallets;

  // 4. Tickets created this run
  const ticketCount = await queryDb(`
    SELECT COUNT(*) cnt
    FROM public.tickets
    WHERE contest_id = '${CONFIG.contestId}'
      AND user_id = ANY(ARRAY['${userIds.join("','")}']::uuid[])
  `);
  results.ticketsCreated = ticketCount?.cnt ?? ticketCount?.[0]?.cnt ?? 0;

  // 5. Wallet balance consistency check (no deduction without a ticket)
  const walletCheck = await queryDb(`
    SELECT w.user_id,
           w.balance_coins,
           ${CONFIG.walletBalance} - COUNT(t.id) AS expected_balance
    FROM public.wallets w
    LEFT JOIN public.tickets t
           ON t.user_id = w.user_id AND t.contest_id = '${CONFIG.contestId}'
    WHERE w.user_id = ANY(ARRAY['${userIds.join("','")}']::uuid[])
    GROUP BY w.user_id, w.balance_coins
    HAVING ABS(w.balance_coins - (${CONFIG.walletBalance} - COUNT(t.id))) > 0.001
    LIMIT 10
  `);
  results.walletMismatches = Array.isArray(walletCheck) ? walletCheck.length : 0;
  results.walletMismatchDetails = walletCheck;

  return results;
}

// ── Phase 5: Cleanup ─────────────────────────────────────────────────────────

async function cleanupUsers(users) {
  log(`Cleaning up ${users.length} test users…`);
  let cleaned = 0;
  for (const u of users) {
    try {
      // Delete tickets
      await admin.from("tickets").delete().eq("user_id", u.userId).eq("contest_id", CONFIG.contestId);
      // Delete winners (if test user won)
      await admin.from("winners").delete().eq("user_id", u.userId).eq("contest_id", CONFIG.contestId);
      // Delete wallet
      await admin.from("wallets").delete().eq("user_id", u.userId);
      // Delete public user row
      await admin.from("users").delete().eq("id", u.userId);
      // Delete auth user
      await admin.auth.admin.deleteUser(u.userId);
      cleaned++;
    } catch (err) {
      log(`  Cleanup failed for ${u.email}: ${err.message}`);
    }
  }
  log(`  Removed ${cleaned}/${users.length} test users.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!CONFIG.serviceRoleKey) {
    console.error("\n[ERROR] Set SUPABASE_SERVICE_ROLE_KEY before running.\n");
    process.exit(1);
  }

  const N = CONFIG.concurrency;
  console.log("\n" + "═".repeat(60));
  console.log(" OneMil — Concurrent Ticket Purchase Load Test");
  console.log("═".repeat(60));
  log(`Target contest : ${CONFIG.contestId}`);
  log(`Concurrency    : ${N} simultaneous purchases`);
  log(`Wallet balance : ${CONFIG.walletBalance} coins per user (ticket_price = 1)`);
  console.log("═".repeat(60) + "\n");

  // ── 1. Create test users ──
  log(`Phase 1: Creating ${N} test users…`);
  const t1 = Date.now();
  const users = [];
  for (let i = 0; i < N; i++) {
    try {
      const u = await createTestUser(i);
      users.push(u);
    } catch (err) {
      log(`  [WARN] Failed to create user ${i}: ${err.message}`);
    }
    if (i % 10 === 9) log(`  Created ${i + 1}/${N}…`);
  }
  log(`Phase 1 done: ${users.length} users ready in ${Date.now() - t1}ms`);

  if (users.length === 0) {
    console.error("[ERROR] No test users created — aborting.");
    process.exit(1);
  }

  // ── 2. Authenticate all users ──
  log(`Phase 2: Signing in ${users.length} users…`);
  const t2 = Date.now();
  const authenticated = (
    await Promise.allSettled(users.map(signIn))
  )
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  log(`Phase 2 done: ${authenticated.length}/${users.length} authenticated in ${Date.now() - t2}ms`);

  // ── 3. Fire concurrent purchases ──
  log(`Phase 3: Firing ${authenticated.length} concurrent purchase requests…`);
  const t3 = Date.now();
  const purchaseResults = await Promise.allSettled(
    authenticated.map(purchaseTicket)
  );
  const elapsed = Date.now() - t3;
  const settled = purchaseResults.map((r) =>
    r.status === "fulfilled" ? r.value : { ok: false, status: 0, body: { error: r.reason?.message }, elapsed: 0 }
  );

  log(`Phase 3 done in ${elapsed}ms`);

  // ── Statistics ──
  const successes  = settled.filter((r) => r.ok && r.body?.success);
  const failures   = settled.filter((r) => !r.ok || !r.body?.success);
  const errMessages = {};
  failures.forEach((r) => {
    const msg = r.body?.error ?? `HTTP ${r.status}`;
    errMessages[msg] = (errMessages[msg] ?? 0) + 1;
  });
  const elapsedTimes = settled.filter((r) => r.elapsed > 0).map((r) => r.elapsed).sort((a, b) => a - b);
  const p50 = elapsedTimes[Math.floor(elapsedTimes.length * 0.50)] ?? 0;
  const p95 = elapsedTimes[Math.floor(elapsedTimes.length * 0.95)] ?? 0;
  const p99 = elapsedTimes[Math.floor(elapsedTimes.length * 0.99)] ?? 0;
  const avgMs = elapsedTimes.length ? Math.round(elapsedTimes.reduce((a, b) => a + b, 0) / elapsedTimes.length) : 0;

  // Check for duplicate ticket numbers among successful purchases
  const ticketNumbers = successes.map((r) => r.body.ticket_number).filter(Boolean);
  const uniqueTickets = new Set(ticketNumbers);
  const duplicateTicketNumbers = ticketNumbers.length - uniqueTickets.size;

  // ── 4. DB integrity check ──
  log("Phase 4: Running database integrity verification…");
  const userIds = users.map((u) => u.userId);
  const integrity = await verifyIntegrity(userIds);

  // ── Report ──
  console.log("\n" + "═".repeat(60));
  console.log(" LOAD TEST RESULTS");
  console.log("═".repeat(60));
  console.log(`\nPurchase Statistics`);
  console.log(`  Requests sent          : ${authenticated.length}`);
  console.log(`  Successful purchases   : ${successes.length}`);
  console.log(`  Failed requests        : ${failures.length}`);
  console.log(`  Total elapsed          : ${elapsed}ms`);
  console.log(`  p50 latency            : ${p50}ms`);
  console.log(`  p95 latency            : ${p95}ms`);
  console.log(`  p99 latency            : ${p99}ms`);
  console.log(`  avg latency            : ${avgMs}ms`);

  if (Object.keys(errMessages).length > 0) {
    console.log(`\nError breakdown:`);
    Object.entries(errMessages).sort(([, a], [, b]) => b - a).forEach(([msg, cnt]) => {
      console.log(`  ${cnt}x  "${msg}"`);
    });
  }

  console.log(`\nDuplicate Detection (client-side)`);
  console.log(`  Unique ticket numbers  : ${uniqueTickets.size}`);
  console.log(`  Duplicate ticket#      : ${duplicateTicketNumbers === 0 ? "NONE ✓" : `${duplicateTicketNumbers} DUPLICATES DETECTED ✗`}`);

  console.log(`\nDatabase Integrity Checks`);
  const checks = [
    ["Duplicate ticket rows (DB)",    integrity.duplicateTickets     === 0],
    ["Duplicate main winners (DB)",   integrity.duplicateMainWinners === 0],
    ["Negative wallet balances",      integrity.negativeWallets      === 0],
    ["Wallet/ticket mismatch",        integrity.walletMismatches     === 0],
  ];
  checks.forEach(([label, pass]) => {
    console.log(`  ${pass ? "PASS ✓" : "FAIL ✗"}  ${label}`);
  });
  if (integrity.walletMismatchDetails?.length > 0) {
    console.log("\n  Wallet mismatch details:", JSON.stringify(integrity.walletMismatchDetails, null, 2));
  }
  if (integrity.negativeWalletDetails?.length > 0) {
    console.log("\n  Negative wallet details:", JSON.stringify(integrity.negativeWalletDetails, null, 2));
  }

  const allPassed = checks.every(([, pass]) => pass) && duplicateTicketNumbers === 0;
  console.log(`\n${"═".repeat(60)}`);
  console.log(` Overall: ${allPassed ? "ALL CHECKS PASSED ✓" : "FAILURES DETECTED ✗ — investigate before launch"}`);
  console.log("═".repeat(60) + "\n");

  // ── 5. Cleanup ──
  if (CONFIG.cleanup) {
    log("Phase 5: Cleaning up test data…");
    await cleanupUsers(users);
  } else {
    log("Cleanup skipped (CONFIG.cleanup = false). Test user emails start with: " + CONFIG.testEmailPrefix);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
