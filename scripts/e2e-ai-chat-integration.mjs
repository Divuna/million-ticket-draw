/**
 * E2E AI Chat Integration Test (OneMil)
 *
 * Verifies:
 * 1) public.messages(sender='user') does NOT enqueue event_queue (Sofinity chat path removed)
 * 2) After migration + deployed ai-chat + OPENAI_API_KEY: poll for new messages(sender='ai') after user insert
 * 3) sofinity-chat-callback still inserts sender='ai' (fallback=false) and sender='admin' (fallback=true)
 * 4) Callback idempotency (no duplicate messages on repeated callback_id)
 * 5) Loop prevention: ai/admin callback messages are NOT re-enqueued into event_queue
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... INTERNAL_FUNCTION_TOKEN=... node scripts/e2e-ai-chat-integration.mjs
 * Optional:
 *   SUPABASE_URL=https://xkzhjldrojjlrkezorey.supabase.co
 *   SKIP_AI_CHAT_POLL=1   — skip step 2 (OpenAI round-trip) if Edge/migration not ready
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFromProjectRoot } from "./load-env.mjs";

loadEnvFromProjectRoot();

const SB_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_TOKEN = process.env.INTERNAL_FUNCTION_TOKEN || "";
const CALLBACK_URL = `${SB_URL}/functions/v1/sofinity-chat-callback`;
const SKIP_AI_POLL = process.env.SKIP_AI_CHAT_POLL === "1" || process.env.SKIP_AI_CHAT_POLL === "true";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (!SB_URL) {
  console.error("\nERROR: SUPABASE_URL required.");
  console.error("Set SUPABASE_URL in .env.local or environment.\n");
  process.exit(1);
}

if (!SERVICE_KEY) {
  console.error("\nERROR: SUPABASE_SERVICE_ROLE_KEY required.");
  console.error("Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/e2e-ai-chat-integration.mjs\n");
  process.exit(1);
}

if (!INTERNAL_TOKEN) {
  console.error("\nERROR: INTERNAL_FUNCTION_TOKEN required for callback invocation.");
  console.error("Usage: INTERNAL_FUNCTION_TOKEN=<token> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/e2e-ai-chat-integration.mjs\n");
  process.exit(1);
}

const admin = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const state = {
  testUserId: null,
  createdMessageIds: [],
  createdQueueIds: [],
  runId: `E2E_AI_CHAT_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
};

let failures = 0;
function pass(msg) {
  console.log(`PASS  ${msg}`);
}
function fail(msg, details = "") {
  failures += 1;
  console.error(`FAIL  ${msg}${details ? `\n      ${details}` : ""}`);
}
function assert(condition, okMsg, failMsg, details = "") {
  if (condition) pass(okMsg);
  else fail(failMsg, details);
}

async function getTestUserId() {
  const { data, error } = await admin
    .from("users")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error(`Could not resolve test_user_id from public.users: ${error?.message || "no rows"}`);
  }
  return data.id;
}

async function invokeCallback(payload) {
  const res = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function cleanup() {
  try {
    if (state.createdQueueIds.length) {
      await admin.from("event_queue").delete().in("id", state.createdQueueIds);
    }
    if (state.createdMessageIds.length) {
      await admin.from("messages").delete().in("id", state.createdMessageIds);
    }
  } catch (e) {
    console.warn(`WARN  Cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  console.log("======================================================");
  console.log("E2E AI CHAT INTEGRATION TEST");
  console.log("======================================================");
  console.log(`Run ID: ${state.runId}\n`);

  state.testUserId = await getTestUserId();
  pass(`Resolved test_user_id=${state.testUserId}`);

  // 1) User message insert — must NOT create Sofinity user_message queue row
  const userContent = `${state.runId}: E2E_TEST_MESSAGE user -> ai-chat (no event_queue)`;
  const { data: userMsg, error: userMsgErr } = await admin
    .from("messages")
    .insert({
      user_id: state.testUserId,
      sender: "user",
      content: userContent,
      topic: "support",
      event: "e2e_user_message",
      private: true,
      payload: { e2e_run_id: state.runId },
    })
    .select("id, user_id, sender, content, topic, event, private, created_at")
    .single();

  if (userMsgErr || !userMsg?.id) {
    throw new Error(`User message insert failed: ${userMsgErr?.message || "unknown error"}`);
  }
  state.createdMessageIds.push(userMsg.id);
  pass(`Inserted user message id=${userMsg.id}`);

  const expectedSourceRequestId = `message:${userMsg.id}`;
  const { data: qRow, error: qErr } = await admin
    .from("event_queue")
    .select("id, event_name, source_request_id")
    .eq("source_request_id", expectedSourceRequestId)
    .maybeSingle();

  if (qErr) throw new Error(`Queue lookup failed: ${qErr.message}`);
  assert(
    !qRow,
    "No event_queue row for user chat (Sofinity enqueue removed)",
    "Unexpected event_queue row for user message — migration may not be applied",
    qRow ? JSON.stringify(qRow) : "",
  );

  // 2) OpenAI path: DB trigger -> pg_net -> ai-chat (async). Poll for assistant row.
  if (SKIP_AI_POLL) {
    pass("SKIP_AI_CHAT_POLL set — skipping OpenAI reply poll");
  } else {
    let aiFromChat = null;
    const maxAttempts = 40;
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data: rows, error: pollErr } = await admin
        .from("messages")
        .select("id, sender, content, created_at")
        .eq("user_id", state.testUserId)
        .eq("sender", "ai")
        .gt("created_at", userMsg.created_at)
        .order("created_at", { ascending: false })
        .limit(1);

      if (pollErr) throw new Error(`AI poll failed: ${pollErr.message}`);
      if (rows?.length) {
        aiFromChat = rows[0];
        break;
      }
      await sleep(delayMs);
    }

    if (aiFromChat?.id) {
      state.createdMessageIds.push(aiFromChat.id);
      pass(`OpenAI/chat path: assistant message id=${aiFromChat.id}`);
      assert(
        typeof aiFromChat.content === "string" && aiFromChat.content.length > 0,
        "Assistant message has non-empty content",
        "Assistant message content missing",
      );
    } else {
      fail(
        "OpenAI/chat path: no assistant message after poll",
        `Waited ${maxAttempts * (delayMs / 1000)}s. Deploy ai-chat, set OPENAI_API_KEY + INTERNAL_FUNCTION_TOKEN, run migration, and DB app.settings.internal_function_token. Or set SKIP_AI_CHAT_POLL=1.`,
      );
    }
  }

  // 3a) Callback fallback=false => sender=ai
  const aiCallbackId = `${state.runId}_CB_AI`;
  const aiPayload = {
    callback_id: aiCallbackId,
    user_id: state.testUserId,
    content: `${state.runId}: E2E_AI_REPLY`,
    fallback: false,
    topic: "support",
    event: "sofinity_ai_result",
    private: true,
    metadata: { e2e_run_id: state.runId, scenario: "ai" },
  };

  const aiRes = await invokeCallback(aiPayload);
  assert(aiRes.ok && aiRes.body?.success === true, "AI callback accepted", "AI callback failed", JSON.stringify(aiRes));

  const { data: aiMsg, error: aiMsgErr } = await admin
    .from("messages")
    .select("id, sender, user_id, payload")
    .eq("user_id", state.testUserId)
    .eq("sender", "ai")
    .eq("payload->>sofinity_callback_id", aiCallbackId)
    .maybeSingle();

  if (aiMsgErr) throw new Error(`AI message verification failed: ${aiMsgErr.message}`);
  assert(!!aiMsg?.id, "AI message inserted (callback)", "AI message missing (callback)");
  if (aiMsg?.id) state.createdMessageIds.push(aiMsg.id);
  if (aiMsg) {
    assert(aiMsg.payload?.sofinity_fallback === false, "AI payload fallback=false", "AI payload fallback flag incorrect");
  }

  // 3b) Callback fallback=true => sender=admin
  const adminCallbackId = `${state.runId}_CB_ADMIN`;
  const adminPayload = {
    callback_id: adminCallbackId,
    user_id: state.testUserId,
    content: `${state.runId}: E2E_ADMIN_FALLBACK`,
    fallback: true,
    topic: "support",
    event: "sofinity_admin_fallback",
    private: true,
    metadata: { e2e_run_id: state.runId, scenario: "admin_fallback", reason: "needs_human" },
  };

  const adminRes = await invokeCallback(adminPayload);
  assert(adminRes.ok && adminRes.body?.success === true, "Admin fallback callback accepted", "Admin fallback callback failed", JSON.stringify(adminRes));

  const { data: adminMsg, error: adminMsgErr } = await admin
    .from("messages")
    .select("id, sender, user_id, payload")
    .eq("user_id", state.testUserId)
    .eq("sender", "admin")
    .eq("payload->>sofinity_callback_id", adminCallbackId)
    .maybeSingle();

  if (adminMsgErr) throw new Error(`Admin message verification failed: ${adminMsgErr.message}`);
  assert(!!adminMsg?.id, "Admin fallback message inserted", "Admin fallback message missing");
  if (adminMsg?.id) state.createdMessageIds.push(adminMsg.id);
  if (adminMsg) {
    assert(adminMsg.payload?.sofinity_fallback === true, "Admin payload fallback=true", "Admin payload fallback flag incorrect");
  }

  // 4a) Idempotency - repeat AI callback must not create duplicate
  const { count: aiBeforeCount, error: aiBeforeErr } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", state.testUserId)
    .eq("sender", "ai")
    .eq("payload->>sofinity_callback_id", aiCallbackId);
  if (aiBeforeErr) throw new Error(`Idempotency pre-count failed: ${aiBeforeErr.message}`);

  const aiResRepeat = await invokeCallback(aiPayload);
  assert(aiResRepeat.ok && aiResRepeat.body?.success === true, "Repeated callback accepted", "Repeated callback failed", JSON.stringify(aiResRepeat));

  const { count: aiAfterCount, error: aiAfterErr } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", state.testUserId)
    .eq("sender", "ai")
    .eq("payload->>sofinity_callback_id", aiCallbackId);
  if (aiAfterErr) throw new Error(`Idempotency post-count failed: ${aiAfterErr.message}`);

  assert(
    aiAfterCount === aiBeforeCount,
    "Idempotency holds: repeated callback created no duplicate",
    "Idempotency failed: duplicate callback message created",
    `before=${aiBeforeCount}, after=${aiAfterCount}`,
  );

  // 4b) Loop prevention - AI/admin callback messages should not enqueue into event_queue
  const aiSourceRequestId = aiMsg?.id ? `message:${aiMsg.id}` : null;
  const adminSourceRequestId = adminMsg?.id ? `message:${adminMsg.id}` : null;

  if (aiSourceRequestId) {
    const { count, error } = await admin
      .from("event_queue")
      .select("id", { count: "exact", head: true })
      .eq("source_request_id", aiSourceRequestId);
    if (error) throw new Error(`Loop check for AI message failed: ${error.message}`);
    assert(count === 0, "AI callback message not re-enqueued", "AI callback message was re-enqueued", `source_request_id=${aiSourceRequestId}, count=${count}`);
  }

  if (adminSourceRequestId) {
    const { count, error } = await admin
      .from("event_queue")
      .select("id", { count: "exact", head: true })
      .eq("source_request_id", adminSourceRequestId);
    if (error) throw new Error(`Loop check for admin message failed: ${error.message}`);
    assert(count === 0, "Admin message not re-enqueued", "Admin message was re-enqueued", `source_request_id=${adminSourceRequestId}, count=${count}`);
  }

  console.log("\n======================================================");
  if (failures === 0) {
    console.log("RESULT: PASS");
    console.log("All AI chat E2E scenarios passed.");
  } else {
    console.log(`RESULT: FAIL (${failures} check(s) failed)`);
    process.exitCode = 1;
  }
  console.log("======================================================\n");
}

main()
  .catch((e) => {
    console.error(`\nFATAL: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
