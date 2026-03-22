import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const ONESIGNAL_APP_ID = "357be038-dbaf-4551-9a16-96d9897197a3";

type SendPushPayload = {
  player_id?: string;
  title?: string;
  message?: string;
  push_log_id?: string;
  user_id?: string;
};

function normalizePlayerId(playerId: unknown): string | null {
  if (typeof playerId !== "string") return null;
  const value = playerId.trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  if (value.length < 10) return null;
  return value;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return { raw: input || null };
  }
}

/** Insert push_log row BEFORE OneSignal call. Uses SUPABASE_SERVICE_ROLE_KEY (service role). */
async function insertPushLogPending(
  supabase: ReturnType<typeof createClient>,
  payload: {
    userId?: string | null;
    playerId?: string | null;
    title?: string;
    message?: string;
  },
): Promise<string | null> {
  const now = new Date().toISOString();
  const row = {
    user_id: payload.userId ?? null,
    player_id: payload.playerId ?? null,
    title: payload.title ?? null,
    message: payload.message ?? null,
    status: "pending",
    created_at: now,
  };
  const { data, error } = await supabase.from("push_log").insert(row).select("id").single();
  if (error) {
    console.error("push_log insert error:", error);
    return null;
  }
  return data?.id ?? null;
}

/** Update push_log after OneSignal response. Uses SUPABASE_SERVICE_ROLE_KEY (service role). */
async function updatePushLogResult(
  supabase: ReturnType<typeof createClient>,
  pushLogId: string,
  status: "sent" | "failed",
  response: unknown,
): Promise<void> {
  const sentAt = new Date().toISOString();
  await supabase
    .from("push_log")
    .update({ status, sent_at: sentAt, response: response as Record<string, unknown> })
    .eq("id", pushLogId);
}

/** Insert push_log with status='failed' for early-error paths (no OneSignal call). */
async function insertPushLogFailed(
  supabase: ReturnType<typeof createClient>,
  payload: {
    userId?: string | null;
    playerId?: string | null;
    title?: string;
    message?: string;
    response: unknown;
  },
): Promise<string | null> {
  const now = new Date().toISOString();
  const row = {
    user_id: payload.userId ?? null,
    player_id: payload.playerId ?? null,
    title: payload.title ?? null,
    message: payload.message ?? null,
    status: "failed",
    created_at: now,
    sent_at: now,
    response: payload.response as Record<string, unknown>,
  };
  const { data, error } = await supabase.from("push_log").insert(row).select("id").single();
  if (error) {
    console.error("push_log insert (failed) error:", error);
    return null;
  }
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const oneSignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing Supabase runtime env" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Optional internal token check. If token is configured, enforce it.
  if (internalToken) {
    const provided = req.headers.get("x-internal-token");
    if (!provided || provided !== internalToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized internal call" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // Uses SUPABASE_SERVICE_ROLE_KEY for all push_log inserts/updates (bypasses RLS)
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = (await req.json()) as SendPushPayload;
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    const title = typeof body.title === "string" ? body.title : "";
    const message = typeof body.message === "string" ? body.message : "";
    const playerId = normalizePlayerId(body.player_id);

    if (!playerId) {
      const response = {
        ok: false,
        error: "Invalid player_id (null/empty/format)",
        player_id: body.player_id ?? null,
      };
      const pushLogId = await insertPushLogFailed(supabase, {
        userId,
        playerId: body.player_id ?? null,
        title,
        message,
        response,
      });
      console.log("Push result:", response);
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid player_id", push_log_id: pushLogId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!oneSignalApiKey) {
      const response = {
        ok: false,
        error: "Missing ONESIGNAL_REST_API_KEY",
        app_id: ONESIGNAL_APP_ID,
      };
      const pushLogId = await insertPushLogFailed(supabase, {
        userId,
        playerId,
        title,
        message,
        response,
      });
      console.log("Push result:", response);
      return new Response(
        JSON.stringify({ ok: false, error: "Missing ONESIGNAL_REST_API_KEY", push_log_id: pushLogId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Insert push_log BEFORE calling OneSignal (status = 'pending')
    const pushLogId = await insertPushLogPending(supabase, { userId, playerId, title, message });

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: [playerId],
      headings: { en: title },
      contents: { en: message },
    };

    const oneSignalRes = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        Authorization: `Basic ${oneSignalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawText = await oneSignalRes.text();
    const parsedBody = safeJsonParse(rawText);
    const ok = oneSignalRes.ok;

    // 2. Update push_log after OneSignal: status = 'sent' | 'failed', response in metadata (json)
    const response = {
      ok,
      status_code: oneSignalRes.status,
      body: parsedBody,
      payload,
    };
    if (pushLogId) {
      await updatePushLogResult(supabase, pushLogId, ok ? "sent" : "failed", response);
    }
    console.log("Push result:", response);

    return new Response(
      JSON.stringify({
        ok,
        push_log_id: pushLogId,
        status_code: oneSignalRes.status,
        response: parsedBody,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

