/**
 * Full E2E contest flow — test data only, cleaned up after run.
 *
 * Flow: create contest → user + wallet → completed payment → buy_ticket_atomic
 * (via purchase-ticket Edge Function) until full → verify winners / ledger / optional notifications.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/e2e-contest-flow-full.mjs
 *
 * Optional env:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   E2E_TICKET_COUNT   — default 100 (DB constraint contests_ticket_count_check is usually ticket_count >= 100)
 *   E2E_TICKET_PRICE   — default 1 (MioCoin per ticket)
 *   E2E_PAYMENT_AMOUNT — default 500 (must cover ticket_count * ticket_price)
 *   E2E_STEP_TIMEOUT_MS — per-step timeout (ms) for contest / user / wallet (default 180000)
 *   E2E_TICKETS_STEP_TIMEOUT_MS — timeout (ms) for ticket purchase loop (default: generous from ticket_count)
 *
 * Requires migration 20260316130000_e2e_contest_ticket_count.sql (or equivalent) for ticket_count < 1_000_000.
 * For ticket_count=5 you must relax CHECK in DB; this script does not change production schema.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

console.log("[e2e] e2e-contest-flow-full.mjs — script start");

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local", ".env.development"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(
        /^\s*(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*["']?([^"'\s#]+)/,
      );
      if (m) {
        const k = m[1];
        const v = m[2].trim();
        if (k === "VITE_SUPABASE_URL" && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = v;
        else if (k === "VITE_SUPABASE_ANON_KEY" && !process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = v;
        else if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const SB_URL = process.env.SUPABASE_URL || "https://xkzhjldrojjlrkezorey.supabase.co";
const SB_ANON =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TICKET_COUNT = Math.max(1, parseInt(process.env.E2E_TICKET_COUNT || "100", 10));
const TICKET_PRICE = Math.max(1, parseInt(process.env.E2E_TICKET_PRICE || "1", 10));
const PAYMENT_AMOUNT = Math.max(
  TICKET_COUNT * TICKET_PRICE,
  parseInt(process.env.E2E_PAYMENT_AMOUNT || String(Math.max(500, TICKET_COUNT * TICKET_PRICE)), 10),
);

const PURCHASE_FN_URL = `${SB_URL}/functions/v1/purchase-ticket`;
const RATE_LIMIT_SAFE_MS = 1100;

const DEFAULT_STEP_MS = parseInt(process.env.E2E_STEP_TIMEOUT_MS || "180000", 10);
const TICKETS_STEP_TIMEOUT_MS = parseInt(
  process.env.E2E_TICKETS_STEP_TIMEOUT_MS ||
    String(TICKET_COUNT * (RATE_LIMIT_SAFE_MS + 5000) + 300000),
  10,
);

if (!SERVICE_KEY) {
  console.error("\nERROR: SUPABASE_SERVICE_ROLE_KEY required.\n");
  process.exit(1);
}

const admin = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`E2E step timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

/** @type {{ name: string, pass: boolean, detail: string }[]} */
const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  const label = pass ? "PASS" : "FAIL";
  console.log(`  [${label}] ${name}: ${detail}`);
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

async function buyTicket(userToken, contestId) {
  const bodyPayload = { contest_id: contestId };
  console.log("[e2e] purchase-ticket request body", JSON.stringify(bodyPayload));
  const res = await fetch(PURCHASE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
      apikey: SB_ANON,
    },
    body: JSON.stringify(bodyPayload),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function cleanup({ contestId, userId }) {
  console.log("\nCleanup — removing test data…");
  const tryOp = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`  ⚠ ${label}:`, e.message || e);
    }
  };

  if (userId) {
    await tryOp("notifications", async () => {
      await admin.from("notifications").delete().eq("user_id", userId);
    });
    await tryOp("push_log", async () => {
      await admin.from("push_log").delete().eq("user_id", userId);
    });
  }

  if (contestId) {
    const { data: wrows } = await admin.from("winners").select("id").eq("contest_id", contestId);
    const wids = (wrows || []).map((w) => w.id);
    if (wids.length) {
      await tryOp("winner_status_history", async () => {
        await admin.from("winner_status_history").delete().in("winner_id", wids);
      });
    }
    await tryOp("winners", async () => {
      await admin.from("winners").delete().eq("contest_id", contestId);
    });
    await tryOp("tickets", async () => {
      await admin.from("tickets").delete().eq("contest_id", contestId);
    });
    await tryOp("bonus_prizes", async () => {
      await admin.from("bonus_prizes").delete().eq("contest_id", contestId);
    });
    await tryOp("contests", async () => {
      await admin.from("contests").delete().eq("id", contestId);
    });
  }

  if (userId) {
    await tryOp("wallet_transactions", async () => {
      await admin.from("wallet_transactions").delete().eq("user_id", userId);
    });
    await tryOp("payments", async () => {
      await admin.from("payments").delete().eq("user_id", userId);
    });
    await tryOp("wallets", async () => {
      await admin.from("wallets").delete().eq("user_id", userId);
    });
    await tryOp("profiles", async () => {
      await admin.from("profiles").delete().eq("id", userId);
    });
    await tryOp("auth.deleteUser", async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    });
  }
  console.log("  Cleanup finished.\n");
}

async function main() {
  const ts = Date.now();
  const testEmail = `e2e_flow_${ts}@onemil-test.invalid`;
  const testPassword = "E2EFlowTest123!";
  let contestId = null;
  let userId = null;
  let userToken = null;

  console.log("══════════════════════════════════════════════════════════════");
  console.log(" E2E CONTEST FLOW (full) — test data only");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  ticket_count=${TICKET_COUNT} ticket_price=${TICKET_PRICE} payment=${PAYMENT_AMOUNT}`);
  if (TICKET_COUNT < 100) {
    console.log("  NOTE: ticket_count < 100 may violate contests_ticket_count_check unless DB allows it.\n");
  } else {
    console.log("");
  }

  /** Used in verification (step 5); set during create-contest step */
  let bonusPositions = [];

  try {
    // 1) Contest + bonus prizes (two positions inside range)
    console.log("[e2e] STEP create contest — starting");
    await withTimeout(
      (async () => {
        let bonusPosA = Math.min(TICKET_COUNT, Math.max(2, Math.floor(TICKET_COUNT * 0.4)));
        let bonusPosB = Math.min(TICKET_COUNT, Math.max(bonusPosA + 1, Math.floor(TICKET_COUNT * 0.8)));
        if (bonusPosB <= bonusPosA) bonusPosB = Math.min(TICKET_COUNT, bonusPosA + 1);
        bonusPositions =
          TICKET_COUNT < 4
            ? [Math.min(2, TICKET_COUNT)].filter((p) => p >= 1)
            : [...new Set([bonusPosA, bonusPosB])].filter((p) => p >= 1 && p <= TICKET_COUNT);

        const { data: contest, error: cErr } = await admin
          .from("contests")
          .insert({
            title: `E2E_FLOW_${ts}`,
            name: `E2E_FLOW_${ts}`,
            description: "Automated E2E — safe to delete",
            main_prize: "E2E main prize",
            ticket_count: TICKET_COUNT,
            ticket_price: TICKET_PRICE,
            status: "active",
            next_ticket_number: 1,
          })
          .select("id")
          .single();

        if (cErr) {
          console.error("Contest insert failed:", cErr.message);
          if (String(cErr.message).includes("ticket_count") || String(cErr.code) === "23514") {
            console.error("→ If ticket_count too small, set E2E_TICKET_COUNT=100 or apply e2e migration.\n");
          }
          process.exit(1);
        }
        contestId = contest.id;
        console.log(`Step 1 — Contest created: ${contestId}`);

        for (const pos of [bonusPosA, bonusPosB]) {
          const { error: bpErr } = await admin.from("bonus_prizes").insert({
            contest_id: contestId,
            description: `E2E bonus @${pos}`,
            ticket_position: pos,
            amount: pos,
            status: "pending",
          });
          if (bpErr) throw new Error(`bonus_prizes: ${bpErr.message}`);
        }
        console.log(`  Bonus prizes at ticket positions ${bonusPosA}, ${bonusPosB}\n`);
      })(),
      DEFAULT_STEP_MS,
      "create contest",
    );

    // 2) User
    console.log("[e2e] STEP create user — starting");
    const u = await withTimeout(signUp(testEmail, testPassword), DEFAULT_STEP_MS, "create user");
    userId = u.userId;
    userToken = u.token;
    console.log(`Step 2 — User ${testEmail} (${userId})\n`);

    // payments.user_id FK → public.users: ensure row exists (signUp only creates auth.users)
    const { error: pubUserErr } = await admin.from("users").upsert(
      { id: userId, email: testEmail, role: "user" },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (pubUserErr) throw new Error(`public.users: ${pubUserErr.message}`);

    // 3) Payment → wallet (trigger)
    console.log("[e2e] STEP wallet — starting");
    await withTimeout(
      (async () => {
        const { data: pay, error: pErr } = await admin
          .from("payments")
          .insert({
            user_id: userId,
            amount: PAYMENT_AMOUNT,
            status: "completed",
            method: "stripe",
          })
          .select("id")
          .single();
        if (pErr) throw new Error(`payments: ${pErr.message}`);
        await sleep(800);

        const { data: wallet0 } = await admin.from("wallets").select("id, balance_coins").eq("user_id", userId).maybeSingle();
        const balanceAfterPay = Number(wallet0?.balance_coins ?? 0);
        check(
          "Wallet exists after payment",
          !!wallet0 && balanceAfterPay >= TICKET_COUNT * TICKET_PRICE,
          `balance=${balanceAfterPay} need>=${TICKET_COUNT * TICKET_PRICE}`,
        );

        const { count: payCount } = await admin
          .from("payments")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "completed");
        check("Payments row(s) for user", (payCount ?? 0) >= 1, `count=${payCount} payment_id=${pay.id}`);
      })(),
      DEFAULT_STEP_MS,
      "wallet",
    );

    // 4) Buy until full
    console.log("[e2e] STEP tickets — starting");
    await withTimeout(
      (async () => {
        console.log(`Step 4 — Purchasing ${TICKET_COUNT} tickets (rate-limit safe spacing)…`);
        let bought = 0;
        let lastBody = null;
        for (let i = 0; i < TICKET_COUNT; i++) {
          const { status, body } = await buyTicket(userToken, contestId);
          lastBody = body;
          if (status === 429) {
            await sleep(6000);
            i--;
            continue;
          }
          if (body?.success === true) bought++;
          else {
            console.error(`  Stop at ticket ${i + 1}: status=${status}`, JSON.stringify(body).slice(0, 200));
            break;
          }
          await sleep(RATE_LIMIT_SAFE_MS);
          if ((i + 1) % 20 === 0) process.stdout.write(`  … ${i + 1}/${TICKET_COUNT}\r`);
        }
        console.log(`\n  Purchased successes: ${bought}/${TICKET_COUNT}\n`);
        check(
          "All tickets purchased via RPC",
          bought === TICKET_COUNT,
          bought === TICKET_COUNT ? "ok" : `got ${bought}, last_response=${JSON.stringify(lastBody).slice(0, 120)}`,
        );
      })(),
      TICKETS_STEP_TIMEOUT_MS,
      "tickets",
    );

    // 5) Verify contest / tickets / winners
    const { data: cFinal } = await admin.from("contests").select("status, ticket_count").eq("id", contestId).single();
    const { count: tCount } = await admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("contest_id", contestId);

    const { data: winners } = await admin.from("winners").select("id, type, prize_id").eq("contest_id", contestId);
    const mains = (winners || []).filter((w) => w.type === "main");
    const bonuses = (winners || []).filter((w) => w.type === "bonus");

    check("Contest status = closed", cFinal?.status === "closed", `status=${cFinal?.status}`);
    check(
      "Tickets count = ticket_count",
      (tCount ?? 0) === TICKET_COUNT,
      `tickets=${tCount} expected=${TICKET_COUNT}`,
    );
    check("Exactly 1 MAIN winner", mains.length === 1, `main_count=${mains.length}`);
    const expectedBonusWinners = bonusPositions.length;
    check(
      "Bonus winners match bonus_prizes count",
      bonuses.length === expectedBonusWinners,
      `bonus_count=${bonuses.length} expected=${expectedBonusWinners} (positions ${bonusPositions.join(",")})`,
    );

    // 6) Wallet ledger
    const { data: txs } = await admin
      .from("wallet_transactions")
      .select("id, amount, type, source")
      .eq("user_id", userId)
      .eq("source", "buy_ticket_atomic");

    const purchaseTxs = (txs || []).filter((t) => t.type === "ticket_purchase");
    check(
      "wallet_transactions ticket_purchase rows",
      purchaseTxs.length === TICKET_COUNT,
      `count=${purchaseTxs.length} expected=${TICKET_COUNT}`,
    );

    const sumDebits = purchaseTxs.reduce((s, t) => s + Number(t.amount), 0);
    const expectedDebits = -TICKET_COUNT * TICKET_PRICE;
    check(
      "Sum of ticket purchase amounts",
      Math.abs(sumDebits - expectedDebits) < 0.0001,
      `sum=${sumDebits} expected=${expectedDebits}`,
    );

    const { data: walletF } = await admin.from("wallets").select("balance_coins").eq("user_id", userId).maybeSingle();
    const finalBal = Number(walletF?.balance_coins ?? 0);
    const expectedBal = PAYMENT_AMOUNT + expectedDebits;
    check(
      "Wallet balance = payment - spends",
      Math.abs(finalBal - expectedBal) < 0.0001,
      `balance=${finalBal} expected=${expectedBal}`,
    );

    // 7) Notifications (pipeline: event_logs → notifications; may be empty if only audit_logs written)
    const { count: notifCount } = await admin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    let evCount = null;
    try {
      const r = await admin
        .from("event_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      evCount = r.count;
      if (r.error) evCount = `err:${r.error.message}`;
    } catch (e) {
      evCount = `err:${e.message}`;
    }

    check(
      "notifications row(s) for user",
      (notifCount ?? 0) >= 1,
      `notifications=${notifCount} event_logs=${evCount} (contest flow may only write audit_logs, not event_logs)`,
    );

    // Summary
    const failed = checks.filter((c) => !c.pass);
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log(failed.length === 0 ? " OVERALL: ALL CHECKS PASS" : ` OVERALL: ${failed.length} CHECK(S) FAILED`);
    console.log("══════════════════════════════════════════════════════════════");
    if (failed.length) {
      console.log("\nInconsistencies:");
      failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    }
    console.log("");

    if (failed.length) process.exitCode = 1;
  } finally {
    await cleanup({ contestId, userId });
  }

  console.log("DONE");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
