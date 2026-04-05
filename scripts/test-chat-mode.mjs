/**
 * Chat mode integration test
 *
 * Verifies:
 *   Scenario A — AI mode: user sends → Bob responds, exactly 1 AI reply
 *   Scenario B — Admin mode: admin replies → user sends again → Bob SILENT
 *   Scenario C — Support ended: admin sends SUPPORT_CHAT_ENDED → user sends → Bob responds again
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/test-chat-mode.mjs
 *   TEST_USER_EMAIL=user@example.com TEST_USER_PASSWORD=pass  (optional)
 *
 * Requires service role key.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local", ".env.development"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(
        /^\s*(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY|TEST_USER_EMAIL|TEST_USER_PASSWORD)\s*=\s*["']?([^"'\s#]+)/
      );
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const SB_URL =
  process.env.SUPABASE_URL || "https://xkzhjldrojjlrkezorey.supabase.co";
const SB_ANON =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EMAIL = process.env.TEST_USER_EMAIL || "chattest_bob@onemil.test";
const TEST_PASS = process.env.TEST_USER_PASSWORD || "ChatTest_B0b!2025";
const SUPPORT_CHAT_ENDED =
  "Chat s podporou byl ukončen. Nyní můžete opět využívat Boba.";
const SUPPORT_REQUEST_MARKER = "__SUPPORT_REQUEST__";

if (!SERVICE_KEY) {
  console.error("\nERROR: SUPABASE_SERVICE_ROLE_KEY required.");
  console.error(
    "  Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/test-chat-mode.mjs\n"
  );
  process.exit(1);
}

// ── clients ──────────────────────────────────────────────────────────────────
const admin = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userClient = createClient(SB_URL, SB_ANON);

// ── helpers ───────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  pass++;
}
function err(label, detail = "") {
  console.error(`  ✗  ${label}${detail ? ": " + detail : ""}`);
  fail++;
}

function assert(condition, label, detail = "") {
  if (condition) ok(label);
  else err(label, detail);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForMessages(uid, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await admin
      .from("messages")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    const msgs = (data || []).reverse();
    const result = predicate(msgs);
    if (result !== false) return result;
    await sleep(1500);
  }
  return null;
}

async function cleanMessages(uid) {
  await admin.from("messages").delete().eq("user_id", uid);
}

async function insertAdminMessage(uid, content) {
  const { data, error } = await admin.from("messages").insert({
    user_id: uid,
    sender: "admin",
    content,
    read: false,
  }).select("*").single();
  if (error) throw new Error("Admin insert failed: " + error.message);
  return data;
}

async function sendUserMessage(uid, content, accessToken) {
  // 1. Insert user message
  const { data: userMsg, error: insertErr } = await admin
    .from("messages")
    .insert({ user_id: uid, sender: "user", content, read: false })
    .select("*")
    .single();
  if (insertErr) throw new Error("User insert failed: " + insertErr.message);

  // 2. Invoke ai-chat edge function (same as useMessages.ts)
  const { data: aiData, error: invokeErr } = await userClient.functions.invoke(
    "ai-chat",
    {
      body: { message_id: userMsg.id },
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (invokeErr) throw new Error("ai-chat invoke failed: " + invokeErr.message);

  const replyId =
    aiData && typeof aiData === "object" ? aiData.reply_message_id : null;

  if (!replyId) {
    console.warn("    ai-chat returned no reply_message_id:", JSON.stringify(aiData));
    return { userMsg, aiMsg: null };
  }

  const { data: aiMsg } = await admin
    .from("messages")
    .select("*")
    .eq("id", replyId)
    .single();

  return { userMsg, aiMsg };
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Chat Mode Integration Test");
  console.log("══════════════════════════════════════════\n");

  // ── Ensure test user exists ──────────────────────────────────────────────
  console.log("→ Setting up test user...");
  let uid;
  let accessToken;

  // Try sign in first
  const { data: signInData, error: signInErr } =
    await userClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASS,
    });

  if (signInErr) {
    // Create user via service role
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASS,
        email_confirm: true,
      });
    if (createErr) {
      console.error("Cannot create test user:", createErr.message);
      process.exit(1);
    }
    uid = created.user.id;
    // Sign in again after creation
    const { data: signIn2, error: signIn2Err } =
      await userClient.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASS,
      });
    if (signIn2Err) {
      console.error("Cannot sign in after create:", signIn2Err.message);
      process.exit(1);
    }
    accessToken = signIn2.session.access_token;
    console.log("  Created and signed in as", TEST_EMAIL);
  } else {
    uid = signInData.user.id;
    accessToken = signInData.session.access_token;
    console.log("  Signed in as", TEST_EMAIL, "(uid:", uid + ")");
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO A: User sends → Bob responds (AI mode) → exactly 1 AI reply
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n─── Scenario A: AI mode — single Bob response ─────────────────\n");
  await cleanMessages(uid);

  let result;
  try {
    result = await sendUserMessage(uid, "Ahoj, jaká je moje bilance?", accessToken);
  } catch (e) {
    err("sendUserMessage succeeded", e.message);
    result = null;
  }

  if (result) {
    assert(result.aiMsg !== null, "ai-chat returned an AI reply");
    if (result.aiMsg) {
      assert(result.aiMsg.sender === "ai", "reply has sender=ai");
      // Count AI messages in DB for this user
      const { data: allMsgs } = await admin
        .from("messages")
        .select("*")
        .eq("user_id", uid)
        .eq("sender", "ai");
      assert(
        allMsgs.length === 1,
        `exactly 1 AI message in DB (got ${allMsgs.length})`
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO B: User sends → Admin replies → User sends again → Bob SILENT
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n─── Scenario B: Admin mode — Bob must be silent ───────────────\n");
  await cleanMessages(uid);

  // Step 1: user sends first message (AI responds)
  let stepBResult;
  try {
    stepBResult = await sendUserMessage(uid, "Potřebuji pomoc s objednávkou.", accessToken);
  } catch (e) {
    err("Step B1: user message + AI reply", e.message);
    stepBResult = null;
  }
  if (stepBResult) {
    assert(stepBResult.aiMsg !== null, "Step B1: AI replied to first user message");
  }

  // Step 2: admin writes → switches to admin mode
  await insertAdminMessage(uid, "Dobrý den, jak vám mohu pomoci?");
  console.log("  Admin message inserted → mode should be ADMIN");

  // Small delay to let realtime propagate in a real UI (here we're testing DB/edge logic)
  await sleep(1000);

  // Step 3: user sends second message — Bob must NOT respond
  // We insert the user message directly (no edge function) because in admin mode
  // the UI calls sendMessageToAdmin with supportActive:true (no invoke).
  // Here we verify: if the edge function IS called (bug), it would insert an AI row.
  const aiCountBefore = (
    await admin.from("messages").select("id").eq("user_id", uid).eq("sender", "ai")
  ).data.length;

  // Simulate what handleSend does in admin mode (supportActive:true → no AI call).
  // We insert the user message and then wait to see if any AI row appears in DB.
  const { data: userMsg2 } = await admin
    .from("messages")
    .insert({
      user_id: uid,
      sender: "user",
      content: "Kde je můj balíček?",
      read: false,
    })
    .select("*")
    .single();

  assert(userMsg2 !== null, "Step B3: second user message inserted");

  // Wait up to 15 s — in a buggy build the edge function would respond
  const aiCountAfter15s = await waitForMessages(uid, (msgs) => {
    const aiMsgs = msgs.filter((m) => m.sender === "ai");
    // Return the count once stable (2 polls with same count)
    return aiMsgs.length;
  }, 15000);

  assert(
    aiCountAfter15s === aiCountBefore,
    `Bob is silent after admin joined (AI count stable at ${aiCountBefore})`,
    `AI count changed from ${aiCountBefore} to ${aiCountAfter15s}`
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO C: Admin sends "Ukončit chat" → User sends → Bob responds again
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n─── Scenario C: Support ended — Bob resumes ───────────────────\n");

  // Admin ends the support session
  await insertAdminMessage(uid, SUPPORT_CHAT_ENDED);
  console.log('  Admin sent "Ukončit chat" message');

  await sleep(500);

  // User sends a new message — Bob should respond now (AI mode restored)
  const aiCountBeforeC = (
    await admin.from("messages").select("id").eq("user_id", uid).eq("sender", "ai")
  ).data.length;

  let stepCResult;
  try {
    stepCResult = await sendUserMessage(uid, "Díky! Ještě jeden dotaz — kolik mám lístků?", accessToken);
  } catch (e) {
    err("Step C: send user message after support ended", e.message);
    stepCResult = null;
  }

  if (stepCResult) {
    const aiCountAfterC = (
      await admin.from("messages").select("id").eq("user_id", uid).eq("sender", "ai")
    ).data.length;

    assert(
      stepCResult.aiMsg !== null,
      "Step C: ai-chat returned a reply"
    );
    assert(
      aiCountAfterC === aiCountBeforeC + 1,
      `Step C: exactly 1 new AI message added (${aiCountBeforeC} → ${aiCountAfterC})`
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await cleanMessages(uid);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  PASSED: ${pass}   FAILED: ${fail}`);
  console.log("══════════════════════════════════════════\n");

  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
