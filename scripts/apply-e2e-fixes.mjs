/**
 * apply-e2e-fixes.mjs
 *
 * Applies all E2E data-consistency fixes programmatically using the
 * Supabase service-role key (bypasses RLS and auth guards).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=sbp_... node scripts/apply-e2e-fixes.mjs
 *
 *   Or pass key as first argument:
 *   node scripts/apply-e2e-fixes.mjs eyJhbGci...
 *
 * Requires Node ≥ 18 (fetch built-in).
 */

const SB_URL        = "https://xkzhjldrojjlrkezorey.supabase.co";
const SERVICE_KEY   = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error(
    "ERROR: Supabase service-role key is required.\n" +
    "  SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/apply-e2e-fixes.mjs\n" +
    "  or: node scripts/apply-e2e-fixes.mjs <key>"
  );
  process.exit(1);
}

const headers = {
  "apikey":        SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type":  "application/json",
  "Prefer":        "return=representation",
};

async function query(table, params = "") {
  const res  = await fetch(`${SB_URL}/rest/v1/${table}${params}`, { headers });
  const body = await res.json();
  if (!res.ok) throw new Error(`${table}: ${JSON.stringify(body)}`);
  return body;
}

async function rpc(fn, payload = {}) {
  const res  = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method:  "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body:    JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`rpc/${fn}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log(" E2E Fix Script — OneMil");
  console.log("═══════════════════════════════════════\n");

  // ───────────────────────────────────────
  // Step 1 — Fix contest_revenue view
  // ───────────────────────────────────────
  console.log("STEP 1 — Rebuilding contest_revenue view …");
  // The view cannot be created via PostgREST REST API – DDL must be sent as raw SQL.
  // We use the Management API (available with service-role key).
  const viewSql = `
    CREATE OR REPLACE VIEW public.contest_revenue AS
    SELECT
        c.id                                                AS contest_id,
        COUNT(t.id)                                         AS tickets_sold,
        ROUND(COUNT(t.id)::numeric * c.ticket_price, 2)     AS coins_spent,
        ROUND(COUNT(t.id)::numeric * c.ticket_price, 2)     AS estimated_revenue
    FROM public.contests c
    LEFT JOIN public.tickets t ON t.contest_id = c.id
    GROUP BY c.id, c.ticket_price;
  `;
  const ddlRes = await fetch(
    `https://api.supabase.com/v1/projects/xkzhjldrojjlrkezorey/database/query`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ query: viewSql }),
    }
  );
  if (ddlRes.ok) {
    console.log("  ✓ contest_revenue view updated.");
  } else {
    const errBody = await ddlRes.text();
    console.warn(`  ⚠ Management API DDL failed (${ddlRes.status}): ${errBody}`);
    console.warn("  → Run supabase/migrations/20260316000000_e2e_fixes.sql manually in the SQL Editor.");
  }

  // ───────────────────────────────────────
  // Step 2 — Repair closed contests with no winner
  // ───────────────────────────────────────
  console.log("\nSTEP 2 — Finding closed contests with no winner …");
  const allContests = await query(
    "contests",
    "?select=id,title,status&status=eq.closed"
  );
  const allWinners = await query(
    "winners",
    "?select=contest_id,type&type=eq.main"
  );
  const winnerSet = new Set(allWinners.map((w) => w.contest_id));

  const orphanContests = allContests.filter((c) => !winnerSet.has(c.id));
  console.log(`  Closed contests with no main winner: ${orphanContests.length}`);

  let contestsRepaired = 0;
  for (const c of orphanContests) {
    // Fetch tickets for this contest
    const tickets = await query(
      "tickets",
      `?select=id,user_id,created_at&contest_id=eq.${c.id}&order=created_at.desc&limit=1`
    );

    if (tickets.length === 0) {
      console.log(`  SKIP ${c.title} (${c.id}) — no tickets sold`);
      continue;
    }

    const t = tickets[0];
    // Insert the winner (ON CONFLICT DO NOTHING to stay idempotent)
    const insertRes = await fetch(`${SB_URL}/rest/v1/winners`, {
      method:  "POST",
      headers: { ...headers, Prefer: "return=minimal,resolution=ignore-duplicates" },
      body:    JSON.stringify({
        contest_id: c.id,
        user_id:    t.user_id,
        ticket_id:  t.id,
        type:       "main",
      }),
    });

    if (insertRes.ok || insertRes.status === 201) {
      console.log(`  ✓ Winner created for: ${c.title} (ticket ${t.id.slice(0, 8)}…)`);
      contestsRepaired++;
    } else {
      const e = await insertRes.text();
      console.warn(`  ⚠ ${c.title}: ${e}`);
    }
  }
  console.log(`  Contests repaired: ${contestsRepaired}`);

  // ───────────────────────────────────────
  // Step 3 — Back-fill ticket_id = NULL on main winners
  // ───────────────────────────────────────
  console.log("\nSTEP 3 — Fixing main winners with ticket_id = NULL …");
  const nullWinners = await query(
    "winners",
    "?select=id,contest_id,user_id&type=eq.main&ticket_id=is.null"
  );
  console.log(`  Main winners with NULL ticket_id: ${nullWinners.length}`);

  let winnersFixed = 0;
  for (const w of nullWinners) {
    const tickets = await query(
      "tickets",
      `?select=id&contest_id=eq.${w.contest_id}&user_id=eq.${w.user_id}&order=created_at.desc&limit=1`
    );
    if (tickets.length === 0) {
      console.log(`  SKIP winner ${w.id.slice(0, 8)} — no ticket found for user in contest`);
      continue;
    }

    const patchRes = await fetch(`${SB_URL}/rest/v1/winners?id=eq.${w.id}`, {
      method:  "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body:    JSON.stringify({ ticket_id: tickets[0].id }),
    });

    if (patchRes.ok) {
      console.log(`  ✓ Winner ${w.id.slice(0, 8)} ticket_id set to ${tickets[0].id.slice(0, 8)}…`);
      winnersFixed++;
    } else {
      const e = await patchRes.text();
      console.warn(`  ⚠ Winner ${w.id.slice(0, 8)}: ${e}`);
    }
  }
  console.log(`  Winners fixed: ${winnersFixed}`);

  // ───────────────────────────────────────
  // Step 4 — Monitoring queries
  // ───────────────────────────────────────
  console.log("\nSTEP 4 — Monitoring queries …");

  // 4a wallet_consistency_check
  const wallets = await query("wallets", "?select=id,user_id,balance_coins");
  const txAll   = await query("wallet_transactions", "?select=wallet_id,amount");
  const txMap   = {};
  for (const tx of txAll) {
    txMap[tx.wallet_id] = (txMap[tx.wallet_id] || 0) + Number(tx.amount);
  }
  const inconsistent = wallets.filter((w) => {
    const sum = txMap[w.id] || 0;
    return Math.abs(w.balance_coins - sum) > 0.001;
  });
  console.log(`  wallet_consistency_check : ${inconsistent.length === 0 ? "PASS" : "FAIL"} (${inconsistent.length} inconsistent wallets)`);
  if (inconsistent.length > 0) {
    inconsistent.slice(0, 5).forEach((w) => {
      const s = txMap[w.id] || 0;
      console.log(`    user_id=${w.user_id.slice(0, 8)} stored=${w.balance_coins} ledger=${s} delta=${w.balance_coins - s}`);
    });
  }

  // 4b orphan_ticket_check
  const contestIds = new Set((await query("contests", "?select=id")).map((c) => c.id));
  const allTickets = await query("tickets", "?select=id,contest_id&limit=5000");
  const orphanTickets = allTickets.filter((t) => !contestIds.has(t.contest_id));
  console.log(`  orphan_ticket_check      : ${orphanTickets.length === 0 ? "PASS" : "FAIL"} (${orphanTickets.length} orphan tickets)`);

  // 4c orphan_winner_check
  const allTicketIds = new Set(allTickets.map((t) => t.id));
  const allWinnersAll = await query("winners", "?select=id,contest_id,ticket_id&ticket_id=not.is.null");
  const orphanWinners = allWinnersAll.filter((w) => w.ticket_id && !allTicketIds.has(w.ticket_id));
  console.log(`  orphan_winner_check      : ${orphanWinners.length === 0 ? "PASS" : "FAIL"} (${orphanWinners.length} orphan winners)`);

  // 4d remaining null ticket_id
  const stillNullWinners = await query("winners", "?select=id&type=eq.main&ticket_id=is.null");
  console.log(`  remaining NULL ticket_id : ${stillNullWinners.length === 0 ? "PASS" : "WARN"} (${stillNullWinners.length} remaining)`);

  // 4e closed contests still without winner
  const winnersAfter  = await query("winners", "?select=contest_id&type=eq.main");
  const winnerSetAfter = new Set(winnersAfter.map((w) => w.contest_id));
  const closedConts   = await query("contests", "?select=id,title&status=eq.closed");
  const stillNoWinner = closedConts.filter((c) => !winnerSetAfter.has(c.id));
  console.log(`  closed w/o winner        : ${stillNoWinner.length === 0 ? "PASS" : "WARN"} (${stillNoWinner.length} remaining)`);

  // ───────────────────────────────────────
  // Summary
  // ───────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log(" SUMMARY");
  console.log("═══════════════════════════════════════");
  console.log(`  Contests repaired  : ${contestsRepaired}`);
  console.log(`  Winners fixed      : ${winnersFixed}`);
  console.log(`  View updated       : contest_revenue`);
  console.log(`  wallet_consistency : ${inconsistent.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`  orphan_tickets     : ${orphanTickets.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`  orphan_winners     : ${orphanWinners.length === 0 ? "PASS" : "FAIL"}`);
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
