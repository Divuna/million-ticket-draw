/**
 * E2E Contest Test — Full OneMil contest engine verification
 *
 * Simulates real user flow: create contest → register → purchase → tickets → bonus → main prize
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/e2e-contest-test.mjs
 *   SUPABASE_URL=https://xxx.supabase.co (optional, defaults to project URL)
 *
 * Requires:
 *   - Service role key for admin operations (contest creation, payment simulation)
 *   - Migration 20260316130000_e2e_contest_ticket_count.sql applied (allows ticket_count >= 100).
 *     Run in Supabase SQL Editor if db push fails due to migration ordering.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env if present
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local", ".env.development"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY)\s*=\s*["']?([^"'\s#]+)/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const SB_URL = process.env.SUPABASE_URL || "https://xkzhjldrojjlrkezorey.supabase.co";
const SB_ANON = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("\nERROR: SUPABASE_SERVICE_ROLE_KEY required.");
  console.error("  Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/e2e-contest-test.mjs\n");
  process.exit(1);
}

const admin = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PURCHASE_FN_URL = `${SB_URL}/functions/v1/purchase-ticket`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function signUp(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Create user failed: ${JSON.stringify(body)}`);

  const signInRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const signInBody = await signInRes.json();
  if (!signInRes.ok || !signInBody.access_token) {
    throw new Error(`SignIn failed: ${JSON.stringify(signInBody)}`);
  }
  return { userId: body.id, token: signInBody.access_token };
}

async function buyTicket(userToken, contestId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(PURCHASE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
        apikey: SB_ANON,
      },
      body: JSON.stringify({ contest_id: contestId }),
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      if (attempt < retries) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(`Invalid response (attempt ${attempt}): ${text.slice(0, 100)}`);
    }
    return { status: res.status, body };
  }
}

async function main() {
  const T0 = Date.now();
  const ts = Date.now();
  const testEmail = `testuser_${ts}@onemil.cz`;
  const testPassword = "TestPass123!";
  let contestId = null;
  let userId = null;
  let userToken = null;

  console.log("═══════════════════════════════════════════════════════════");
  console.log(" E2E CONTEST TEST — OneMil Contest Engine");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: Create test contest ───────────────────────────────────────
  console.log("Step 1 — Create test contest");
  try {
    const { data: contest, error: contestErr } = await admin
      .from("contests")
      .insert({
        title: "TEST BMW M3",
        name: "TEST BMW M3",
        description: "E2E test contest",
        main_prize: "BMW M3 Competition",
        ticket_count: 1000,
        ticket_price: 1,
        status: "active",
      })
      .select("id")
      .single();

    if (contestErr) throw contestErr;
    contestId = contest.id;
    console.log(`  ✓ Contest created: ${contestId}\n`);
  } catch (e) {
    console.error("  ✗ Contest creation failed:", e.message);
    if (e.message?.includes("contests_ticket_count_check")) {
      console.error("\n  → Run scripts/run-e2e-migration.sql in Supabase SQL Editor first.");
    }
    process.exit(1);
  }

  // ── Step 1b: Add bonus prize positions (50, 150, 500) ─────────────────
  console.log("Step 1b — Add bonus prizes at positions 50, 150, 500");
  try {
    for (const pos of [50, 150, 500]) {
      const { error } = await admin.from("bonus_prizes").insert({
        contest_id: contestId,
        description: `Bonus ${pos} MioCoin`,
        ticket_position: pos,
        amount: pos,
        status: "pending",
      });
      if (error) throw error;
    }
    console.log("  ✓ Bonus prizes added\n");
  } catch (e) {
    console.error("  ✗ Bonus prizes failed:", e.message);
    process.exit(1);
  }

  // ── Step 2: Create test user ───────────────────────────────────────────
  console.log("Step 2 — Create test user");
  try {
    const user = await signUp(testEmail, testPassword);
    userId = user.userId;
    userToken = user.token;
    console.log(`  ✓ User created: ${testEmail} (${userId})\n`);

    // Verify profiles and wallets
    const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).single();
    const { data: wallet } = await admin.from("wallets").select("id, balance_coins").eq("user_id", userId).single();
    if (!profile) console.log("  ⚠ profiles: record not found (may be created by trigger)");
    else console.log("  ✓ profiles: exists");
    if (!wallet) console.log("  ⚠ wallets: not yet created (will be created on first payment)");
    else console.log(`  ✓ wallets: exists, balance=${wallet.balance_coins}`);
  } catch (e) {
    console.error("  ✗ User creation failed:", e.message);
    process.exit(1);
  }

  // ── Step 3: Purchase voucher (1200 CZK → 1200 MioCoin) ───────────────────
  console.log("Step 3 — Purchase 1200 CZK voucher (simulate payment)");
  try {
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .insert({
        user_id: userId,
        amount: 1200,
        status: "completed",
        method: "stripe",
      })
      .select("id")
      .single();

    if (payErr) throw payErr;
    console.log(`  ✓ Payment inserted: ${payment.id}`);

    await sleep(500); // allow trigger to run

    const { data: wallet } = await admin.from("wallets").select("balance_coins").eq("user_id", userId).single();
    const balance = Number(wallet?.balance_coins ?? 0);
    if (balance >= 1200) {
      console.log(`  ✓ Wallet balance: ${balance} MioCoin\n`);
    } else {
      console.log(`  ⚠ Wallet balance: ${balance} (expected 1200). Adding more for full test.\n`);
      const needed = 1200 - balance;
      await admin.from("payments").insert({
        user_id: userId,
        amount: needed,
        status: "completed",
        method: "stripe",
      });
      await sleep(500);
    }
  } catch (e) {
    console.error("  ✗ Payment failed:", e.message);
    process.exit(1);
  }

  // ── Step 4: Purchase 10 tickets ────────────────────────────────────────
  console.log("Step 4 — Purchase 10 tickets");
  const RATE_WAIT = 6500;
  let purchased = 0;
  for (let i = 0; i < 10; i++) {
    const { status, body } = await buyTicket(userToken, contestId);
    if (body?.success) purchased++;
    if (status === 429) {
      await sleep(RATE_WAIT);
      i--;
    }
    await sleep(100);
  }
  console.log(`  ✓ Purchased: ${purchased} tickets\n`);

  const { data: tickets4 } = await admin.from("tickets").select("number").eq("contest_id", contestId).eq("user_id", userId).order("number");
  console.log(`  Ticket numbers: ${(tickets4 || []).map((t) => t.number).join(", ")}\n`);

  // ── Step 5: Purchase until ticket 50 (bonus trigger) ────────────────────
  console.log("Step 5 — Purchase until ticket 50 (trigger bonus)");
  const { data: progress5 } = await admin.from("contest_progress").select("tickets_sold").eq("contest_id", contestId).single();
  let currentSold = progress5?.tickets_sold ?? 0;
  const needed5 = 50 - currentSold;

  for (let i = 0; i < needed5; i++) {
    const { status, body } = await buyTicket(userToken, contestId);
    if (body?.success) currentSold++;
    if (status === 429) {
      await sleep(RATE_WAIT);
      i--;
    }
    await sleep(50);
  }
  console.log(`  ✓ Reached ~50 tickets sold\n`);

  const { data: winners5 } = await admin.from("winners").select("id, type").eq("contest_id", contestId);
  const bonusWinner = (winners5 || []).find((w) => w.type === "bonus");
  const { data: bp50 } = await admin.from("bonus_prizes").select("status").eq("contest_id", contestId).eq("ticket_position", 50).single();
  if (bonusWinner || bp50?.status === "won") {
    console.log("  ✓ Bonus prize winner created at position 50\n");
  } else {
    console.log("  ⚠ Bonus winner not yet detected (check winners + bonus_prizes)\n");
  }

  // ── Step 6: Purchase until ticket 1000 (main prize) ─────────────────────
  console.log("Step 6 — Purchase until ticket 1000 (main prize)");
  const { data: progress6 } = await admin.from("contest_progress").select("tickets_sold").eq("contest_id", contestId).single();
  currentSold = progress6?.tickets_sold ?? 0;
  const needed6 = 1000 - currentSold;

  for (let i = 0; i < needed6; i++) {
    const { status, body } = await buyTicket(userToken, contestId);
    if (body?.success) currentSold++;
    if (status === 429) {
      await sleep(RATE_WAIT);
      i--;
    }
    if (i % 100 === 0 && i > 0) process.stdout.write(`  Progress: ${currentSold}/1000\r`);
    await sleep(30);
  }
  console.log(`  ✓ Reached 1000 tickets\n`);

  const { data: mainWinners } = await admin.from("winners").select("id, type").eq("contest_id", contestId).eq("type", "main");
  if (mainWinners?.length >= 1) {
    console.log("  ✓ Main prize winner created\n");
  } else {
    console.log("  ✗ Main prize winner NOT found\n");
  }

  // ── Step 7: Validate system data ────────────────────────────────────────
  console.log("Step 7 — Validate system data");

  const { count: ticketCount } = await admin.from("tickets").select("*", { count: "exact", head: true }).eq("contest_id", contestId);
  const { data: allTickets } = await admin.from("tickets").select("number").eq("contest_id", contestId).order("number");
  const numbers = (allTickets || []).map((t) => t.number);
  const uniqueNumbers = new Set(numbers);
  const sequential = numbers.length === 0 || (numbers[numbers.length - 1] === numbers.length);

  const { data: walletFinal } = await admin.from("wallets").select("balance_coins").eq("user_id", userId).single();
  const { count: winnerCount } = await admin.from("winners").select("*", { count: "exact", head: true }).eq("contest_id", contestId);
  const { data: winnersAll } = await admin.from("winners").select("type").eq("contest_id", contestId);
  const mainCount = (winnersAll || []).filter((w) => w.type === "main").length;
  const bonusCount = (winnersAll || []).filter((w) => w.type === "bonus").length;

  console.log(`  tickets:        ${ticketCount} (expected 1000)`);
  console.log(`  ticket numbers: sequential=${sequential}, unique=${uniqueNumbers.size === numbers.length}`);
  console.log(`  wallets:        balance=${walletFinal?.balance_coins ?? "N/A"}`);
  console.log(`  winners:        total=${winnerCount}, main=${mainCount}, bonus=${bonusCount}`);
  console.log(`  duplicate main: ${mainCount > 1 ? "YES — CRITICAL" : "none"}`);

  const passed =
    ticketCount === 1000 &&
    uniqueNumbers.size === numbers.length &&
    mainCount === 1 &&
    bonusCount >= 1;

  const elapsed = ((Date.now() - T0) / 1000).toFixed(1);
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` RESULT: ${passed ? "PASS ✓" : "ISSUES FOUND"}`);
  console.log(` Time: ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!passed) process.exit(1);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
