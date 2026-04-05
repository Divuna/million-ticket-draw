import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token, x-signature, x-timestamp",
};

type CallbackBody = {
  event_name?: string;
  payload?: {
    correlation_id?: string;
    user_id?: string;
    content?: string;
    reason?: "low_confidence" | "error";
  } | null;
  callback_id?: string;
  user_id?: string;
  content?: string;
  /** Legacy Sofinity worker field — treated as content when content is missing */
  response?: string;
  /** Legacy alias — treated as callback_id when callback_id is missing */
  message_id?: string;
  fallback?: boolean;
  topic?: string | null;
  event?: string | null;
  private?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MESSAGE_TABLE = "messages";

/** Loose UUID check for DB lookups by `messages.id` (avoids throwing on invalid uuid). */
function isProbablyMessageUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function userIdFromPayloadField(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

type ServiceSupabase = ReturnType<typeof createClient>;

async function resolveUserIdFromMessageRow(
  supabase: ServiceSupabase,
  messageId: string,
): Promise<string | null> {
  if (!isProbablyMessageUuid(messageId)) return null;
  const { data, error } = await supabase
    .from(MESSAGE_TABLE)
    .select("user_id")
    .eq("id", messageId)
    .maybeSingle();
  if (error) {
    logWarning("resolveUserIdFromMessageRow lookup failed", { messageId, error: error.message });
    return null;
  }
  const uid = data?.user_id;
  return typeof uid === "string" && uid.trim().length > 0 ? uid.trim() : null;
}

/**
 * Prefer payload user_id; if missing/empty, resolve from `messages.id` when id is a UUID
 * (correlation_id / callback_id often equals the originating user message id).
 */
async function resolveEffectiveUserId(
  supabase: ServiceSupabase,
  payloadUserId: unknown,
  correlationOrMessageId: string | null,
): Promise<string | null> {
  const direct = userIdFromPayloadField(payloadUserId);
  if (direct) return direct;
  if (!correlationOrMessageId) return null;
  const fromRow = await resolveUserIdFromMessageRow(supabase, correlationOrMessageId);
  if (fromRow) return fromRow;
  logWarning("user_id missing and could not resolve from messages.id", {
    correlationOrMessageId,
  });
  return null;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(message);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, msgData);
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function logWarning(message: string, context?: Record<string, unknown>) {
  console.warn(`[sofinity-chat-callback] ${message}`, context ?? {});
}

function logError(message: string, context?: Record<string, unknown>) {
  console.error(`[sofinity-chat-callback] ${message}`, context ?? {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
    const callbackSecret = Deno.env.get("SOFINITY_CALLBACK_SECRET") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: "Missing Supabase env" }, 500);
    }

    const rawBody = await req.text();
    const providedInternal = req.headers.get("x-internal-token") ?? "";
    const providedTimestamp = req.headers.get("x-timestamp") ?? "";
    const providedSignature = req.headers.get("x-signature") ?? "";

    let authorized = false;

    if (internalToken && providedInternal === internalToken) {
      authorized = true;
    } else if (callbackSecret && providedTimestamp && providedSignature) {
      const timestampMs = Number(providedTimestamp);
      if (!Number.isFinite(timestampMs)) {
        return jsonResponse({ success: false, error: "Invalid x-timestamp" }, 401);
      }

      const skewMs = Math.abs(Date.now() - timestampMs);
      if (skewMs > 5 * 60 * 1000) {
        return jsonResponse({ success: false, error: "Expired signature timestamp" }, 401);
      }

      const expected = await hmacSha256Hex(
        callbackSecret,
        `${providedTimestamp}.${rawBody}`,
      );
      authorized = timingSafeHexEqual(expected, providedSignature);
    }

    if (!authorized) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const body = JSON.parse(rawBody) as CallbackBody;
    if (!body || typeof body !== "object") {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ai_response: insert AI reply (minimal contract)
    if (body.event_name === "ai_response") {
      if (!body.payload || typeof body.payload !== "object") {
        return jsonResponse({ success: false, error: "Missing payload" }, 400);
      }
      const { correlation_id, content, user_id: payloadUserId } = body.payload;
      if (
        typeof correlation_id !== "string" ||
        correlation_id.length === 0 ||
        typeof content !== "string" ||
        content.length === 0
      ) {
        logWarning("Missing or invalid ai_response payload fields", { correlation_id, hasContent: !!content });
        return jsonResponse({ success: false, error: "Missing correlation_id or content" }, 400);
      }

      const user_id = await resolveEffectiveUserId(supabase, payloadUserId, correlation_id);
      console.log("Sofinity user_id:", user_id);

      if (!user_id) {
        logWarning("ai_response skipped insert: no user_id after payload + DB resolution", {
          correlation_id,
        });
        return jsonResponse({ success: true, event_name: "ai_response", correlation_id }, 200);
      }

      const { error: insertAiError } = await supabase.from(MESSAGE_TABLE).insert({
        user_id,
        sender: "ai",
        content,
        read: false,
      });

      if (insertAiError) {
        logError("ai_response insert failed", { error: insertAiError.message, correlation_id, user_id });
        return jsonResponse({ success: false, error: insertAiError.message }, 500);
      }

      console.log("[sofinity-chat-callback] ai_response insert success", { correlation_id, user_id });
      return jsonResponse({ success: true, event_name: "ai_response", correlation_id }, 200);
    }

    // ai_fallback + legacy queue completion path
    if (body.event_name === "ai_fallback") {
      const correlation_id =
        body.payload && typeof body.payload.correlation_id === "string" && body.payload.correlation_id.length > 0
          ? body.payload.correlation_id
          : null;
      const payloadUserId = body.payload?.user_id;
      const content =
        body.payload && typeof body.payload.content === "string" && body.payload.content.length > 0
          ? body.payload.content
          : null;
      const fallbackReason =
        body.payload &&
        (body.payload.reason === "low_confidence" || body.payload.reason === "error")
          ? body.payload.reason
          : null;

      if (!correlation_id) {
        logWarning("Missing payload.correlation_id", { event_name: body.event_name });
        return jsonResponse({ success: false, error: "Missing payload.correlation_id" }, 400);
      }
      if (!content) {
        logWarning("Missing payload.content", { event_name: body.event_name, correlation_id });
        return jsonResponse({ success: false, error: "Missing payload.content" }, 400);
      }

      const { data: existing, error: existingError } = await supabase
        .from(MESSAGE_TABLE)
        .select("id, user_id")
        .eq("payload->>sofinity_correlation_id", correlation_id)
        .eq("payload->>source_event", body.event_name)
        .maybeSingle();

      if (existingError) {
        logError("Failed to check existing message", {
          event_name: body.event_name,
          correlation_id,
          error: existingError.message,
        });
        return jsonResponse({ success: false, error: existingError.message }, 500);
      }

      const user_id = existing?.user_id && typeof existing.user_id === "string" && existing.user_id.trim().length > 0
        ? existing.user_id.trim()
        : await resolveEffectiveUserId(supabase, payloadUserId, correlation_id);
      console.log("Sofinity user_id:", user_id);

      let insertedMessageId: string | null = null;
      if (!existing?.id) {
        if (!user_id) {
          logWarning("ai_fallback skipped insert: no user_id after payload + DB resolution", {
            correlation_id,
          });
        } else {
          const sender = body.event_name === "ai_fallback" ? "admin" : "ai";
          const { data: inserted, error: insertError } = await supabase
            .from(MESSAGE_TABLE)
            .insert({
              user_id,
              sender,
              content,
              private: true,
              event: "sofinity_ai_result",
              payload: {
                sofinity_correlation_id: correlation_id,
                original_message_id: correlation_id,
                source_event: body.event_name,
                requires_manual_reply: body.event_name === "ai_fallback",
                ...(fallbackReason ? { reason: fallbackReason } : {}),
              },
            })
            .select("id")
            .single();

          // Important for retry flow: non-200 so Sofinity can retry.
          if (insertError) {
            logError("Failed to insert callback message", {
              event_name: body.event_name,
              correlation_id,
              user_id,
              sender,
              error: insertError.message,
            });
            return jsonResponse({ success: false, error: insertError.message }, 500);
          }
          insertedMessageId = inserted.id;
        }
      } else {
        insertedMessageId = existing.id;
      }

      const processedAt = new Date().toISOString();
      const { error: queueError } = await supabase
        .from("event_queue")
        .update({
          status: "completed",
          processed_at: processedAt,
        })
        .or(`source_request_id.eq.message:${correlation_id},metadata->>message_id.eq.${correlation_id}`);

      if (queueError) {
        logError("Failed to mark event_queue completed", {
          event_name: body.event_name,
          correlation_id,
          error: queueError.message,
        });
        return jsonResponse({ success: false, error: queueError.message }, 500);
      }

      // For ai_fallback, notify all admins using existing notifications pipeline.
      if (body.event_name === "ai_fallback") {
        const { data: adminRoles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admin", "superadmin"]);

        if (rolesError) {
          logError("Failed to load admin roles for fallback notification", {
            correlation_id,
            error: rolesError.message,
          });
          return jsonResponse({ success: false, error: rolesError.message }, 500);
        }

        const adminUserIds = Array.from(new Set((adminRoles ?? []).map((r) => r.user_id).filter(Boolean)));
        if (adminUserIds.length > 0) {
          const notificationRows = adminUserIds.map((adminUserId) => ({
            user_id: adminUserId,
            type: "info",
            title: "AI chat fallback requires manual reply",
            message: `User ${user_id ?? correlation_id} requires manual reply (${fallbackReason ?? "error"}).`,
            status: "queued",
          }));

          const { error: notifError } = await supabase
            .from("notifications")
            .insert(notificationRows);

          if (notifError) {
            logError("Failed to create fallback notifications", {
              correlation_id,
              admins_count: adminUserIds.length,
              error: notifError.message,
            });
            return jsonResponse({ success: false, error: notifError.message }, 500);
          }
        }
      }

      return jsonResponse(
        {
          success: true,
          event_name: body.event_name,
          idempotent: Boolean(existing?.id),
          message_id: insertedMessageId,
          correlation_id,
          ...(fallbackReason ? { reason: fallbackReason } : {}),
        },
        200,
      );
    }

    const { fallback, metadata } = body;

    // Canonical contract: callback_id, user_id, content
    // Legacy Sofinity worker: message_id, response (+ optional user_id in metadata)
    const callback_id =
      typeof body.callback_id === "string" && body.callback_id.length > 0
        ? body.callback_id
        : typeof body.message_id === "string" && body.message_id.length > 0
          ? body.message_id
          : null;

    const content =
      typeof body.content === "string" && body.content.length > 0
        ? body.content
        : typeof body.response === "string" && body.response.length > 0
          ? body.response
          : null;

    const meta = metadata ?? {};
    const payloadUserIdLegacy =
      userIdFromPayloadField(body.user_id) ?? userIdFromPayloadField(meta.user_id);

    if (!callback_id) {
      logWarning("Missing callback_id/message_id for legacy payload");
      return jsonResponse({ success: false, error: "Missing callback_id (or message_id)" }, 400);
    }

    if (!content) {
      logWarning("Missing content/response for legacy payload", { callback_id });
      return jsonResponse({ success: false, error: "Missing content (or response)" }, 400);
    }

    const { data: existing, error: existingError } = await supabase
      .from(MESSAGE_TABLE)
      .select("id, user_id")
      .eq("payload->>sofinity_callback_id", callback_id)
      .maybeSingle();

    if (existingError) {
      logError("Legacy existing message lookup failed", {
        callback_id,
        error: existingError.message,
      });
      return jsonResponse({ success: false, error: existingError.message }, 500);
    }

    const user_id = existing?.user_id && typeof existing.user_id === "string" && existing.user_id.trim().length > 0
      ? existing.user_id.trim()
      : await resolveEffectiveUserId(supabase, payloadUserIdLegacy, callback_id);
    console.log("Sofinity user_id:", user_id);

    // Routing: ONLY fallback flag (never confidence / heuristics)
    const sender = fallback === true ? "admin" : "ai";

    if (existing?.id) {
      return jsonResponse({ success: true, idempotent: true, message_id: existing.id }, 200);
    }

    if (!user_id) {
      logWarning("Legacy callback skipped insert: no user_id after payload + DB resolution", {
        callback_id,
      });
      return jsonResponse(
        { success: true, idempotent: false, message_id: null, sender },
        200,
      );
    }

    const payload = {
      sofinity_callback_id: callback_id,
      ...(metadata ?? {}),
    };

    const { data: inserted, error: insertError } = await supabase
      .from(MESSAGE_TABLE)
      .insert({
        user_id,
        sender,
        content,
        private: true,
        event: "sofinity_ai_result",
        payload,
      })
      .select("id")
      .single();

    if (insertError) {
      logError("Legacy callback insert failed", {
        callback_id,
        user_id,
        sender,
        error: insertError.message,
      });
      return jsonResponse({ success: false, error: insertError.message }, 500);
    }

    return jsonResponse(
      { success: true, idempotent: false, message_id: inserted.id, sender },
      200,
    );
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
