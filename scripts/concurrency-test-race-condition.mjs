/**
 * Concurrency Test — Race Condition (Ticket Limit)
 *
 * Verifies the contest engine prevents selling more tickets than the contest limit
 * under concurrent load.
 *
 * Setup:
 *   - Contest: TEST RACE CONDITION, ticket_count: 100, ticket_price: 1
 *   - 50 concurrent users, each attempts 5 tickets = 250 total attempts
 *   - Expected: max 100 tickets in DB, never >100
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/concurrency-test-race-condition.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?([^"'\s#]+)/);
      if (m && !process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = m[2].trim();
    }
  }
}

const SB_URL = process.env.SUPABASE_URL || "https://xkzhjldrojjlrkezorey.supabase.co";
const SB_ANON = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("\nERROR: SUPABASE_SERVICE_ROLE_KEY required.\n");
  process.exit(1);
}

const admin = createClient(SB_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const PURCHASE_URL = `${SB_URL}/functions/v1/purchase-ticket`;

const NUM_USERS = 50;
const TICKETS_PER_USER = 5;
const TOTAL_ATTEMPTS = NUM_USERS * TICKETS_PER_USER; // 250
const CONTEST_LIMIT = 100;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createUser(index) {
  const email = `racecond_${Date.now()}_${index}@onemil.cz`;
  const password = `RaceTest#${index}#2026`;
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authErr) throw new Error(`createUser[${index}]: ${authErr.message}`);
  const userId = authData.user.id;
  await admin.from("users").upsert({ id: userId, email, role: "user" });
  await admin.from("payments").insert({
    user_id: userId,
    amount: 10,
    status: "completed",
    method: "stripe",
  });
  await sleep(200);
  return { userId, email, password, index };
}

async function signIn(user) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error(`signIn[${user.index}]: ${JSON.stringify(body)}`);
  return { ...user, jwt: body.access_token };
}

async function purchaseTicket(user, contestId) {
  const res = await fetch(PURCHASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.jwt}`,
      "Content-Type": "application/json",
      apikey: SB_ANON,
    },
    body: JSON.stringify({ contest_id: contestId }),
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { ok: res.ok, status: res.status, body, userId: user.userId };
}

async function main() {
  const T0 = Date.now();
  let contestId = null;

  console.log("═══════════════════════════════════════════════════════════");
  console.log(" CONCURRENCY TEST — Race Condition (Ticket Limit)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Create contest ──
  console.log("Step 1 — Create contest TEST RACE CONDITION (ticket_count: 100)");
  const { data: contest, error: contestErr } = await admin.from("contests").insert({
    title: "TEST RACE CONDITION",
    name: "TEST RACE CONDITION",
    description: "Concurrency test",
    main_prize: "Test Prize",
    ticket_count: CONTEST_LIMIT,
    ticket_price: 1,
    status: "active",
  }).select("id").single();
  if (contestErr) throw contestErr;
  contestId = contest.id;
  console.log(`  ✓ Contest: ${contestId}\n`);

  // ── 2. Create 50 users ──
  console.log("Step 2 — Create 50 test users");
  const users = [];
  for (let i = 0; i < NUM_USERS; i++) {
    try {
      users.push(await createUser(i));
      if (i % 10 === 9) await sleep(500);
    } catch (e) {
      console.error(`  ✗ User ${i}: ${e.message}`);
    }
  }
  console.log(`  ✓ Created ${users.length} users\n`);

  if (users.length === 0) throw new Error("No users created");

  // ── 3. Sign in all ──
  console.log("Step 3 — Sign in all users");
  const signed = await Promise.allSettled(users.map(signIn));
  const authenticated = signed.filter((r) => r.status === "fulfilled").map((r) => r.value);
  console.log(`  ✓ Authenticated: ${authenticated.length}\n`);

  // ── 4. Build 250 purchase requests (50 users × 5 each) ──
  const requests = [];
  for (const u of authenticated) {
    for (let t = 0; t < TICKETS_PER_USER; t++) {
      requests.push({ user: u, contestId });
    }
  }
  console.log(`Step 4 — Fire ${requests.length} concurrent purchase requests`);
  const results = await Promise.allSettled(
    requests.map((r) => purchaseTicket(r.user, r.contestId))
  );
  const settled = results.map((r) =>
    r.status === "fulfilled" ? r.value : { ok: false, status: 0, body: {} }
  );
  const successes = settled.filter((r) => r.ok && r.body?.success);
  const failures = settled.filter((r) => !r.ok || !r.body?.success);
  const errSample = {};
  failures.slice(0, 10).forEach((f) => {
    const msg = f.body?.error || `HTTP ${f.status}`;
    errSample[msg] = (errSample[msg] || 0) + 1;
  });
  if (Object.keys(errSample).length > 0) {
    console.log(`  Sample errors: ${JSON.stringify(errSample)}`);
  }
  console.log(`  ✓ Requests: ${requests.length}, Successful: ${successes.length}\n`);

  // ── 5. Validate DB ──
  console.log("Step 5 — Validate database");

  const { data: tickets } = await admin.from("tickets").select("number").eq("contest_id", contestId).order("number");
  const numbers = (tickets || []).map((t) => t.number);
  const totalTickets = numbers.length;
  const maxTicket = numbers.length ? Math.max(...numbers) : 0;
  const uniqueNumbers = new Set(numbers);
  const duplicateCount = numbers.length - uniqueNumbers.size;
  const sequential = numbers.length === 0 || (numbers[numbers.length - 1] === numbers.length);

  const { data: winners } = await admin.from("winners").select("id, type").eq("contest_id", contestId);
  const mainWinners = (winners || []).filter((w) => w.type === "main");
  const bonusWinners = (winners || []).filter((w) => w.type === "bonus");

  const overLimit = totalTickets > CONTEST_LIMIT;

  // ── Report ──
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" CONCURRENCY TEST REPORT");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("Configuration:");
  console.log(`  Contest limit     : ${CONTEST_LIMIT} tickets`);
  console.log(`  Users             : ${NUM_USERS}`);
  console.log(`  Attempts per user : ${TICKETS_PER_USER}`);
  console.log(`  Total attempts    : ${TOTAL_ATTEMPTS}\n`);

  console.log("Results:");
  console.log(`  Total tickets     : ${totalTickets} ${totalTickets <= CONTEST_LIMIT ? "✓" : "✗ OVER LIMIT"}`);
  console.log(`  Max ticket number : ${maxTicket}`);
  console.log(`  Duplicate tickets : ${duplicateCount} ${duplicateCount === 0 ? "✓" : "✗"}`);
  console.log(`  Sequential        : ${sequential ? "✓" : "✗"}`);
  console.log(`  Main winners      : ${mainWinners.length}`);
  console.log(`  Bonus winners     : ${bonusWinners.length}\n`);

  const passed =
    totalTickets <= CONTEST_LIMIT &&
    duplicateCount === 0 &&
    mainWinners.length <= 1;

  console.log("═══════════════════════════════════════════════════════════");
  console.log(` RESULT: ${passed ? "PASS ✓" : "FAIL ✗"}`);
  console.log(` Time: ${((Date.now() - T0) / 1000).toFixed(1)}s`);
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
