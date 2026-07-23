import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  claimPushLogForDelivery,
  dispatchPendingPush,
  type PushLogClaim,
  type PushLogClaimResponse,
  type PushLogRow,
  type PushLogStore,
} from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const ONESIGNAL_APP_ID = "357be038-dbaf-4551-9a16-96d9897197a3";

type SendPushPayload = {
  push_log_id?: string;
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

  if (!internalToken) {
    return jsonResponse({ ok: false, error: "Missing INTERNAL_FUNCTION_TOKEN" }, 500);
  }
  const provided = req.headers.get("x-internal-token");
  if (!provided || provided !== internalToken) {
    return jsonResponse({ ok: false, error: "Unauthorized internal call" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let activePushLogId = "";

  try {
    const body = (await req.json()) as SendPushPayload;
    const pushLogId = typeof body.push_log_id === "string" ? body.push_log_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pushLogId)) {
      return jsonResponse({ ok: false, error: "Invalid push_log_id" }, 400);
    }
    activePushLogId = pushLogId;

    const store: PushLogStore = {
      async claimPending(id): Promise<PushLogClaim> {
        const selectColumns = "id, user_id, player_id, title, message, status";
        const updateAndReturn = async (
          status: "pending" | "processing",
          response: PushLogClaimResponse,
          staleBefore?: string,
        ): Promise<PushLogRow | null> => {
          let query = supabase
            .from("push_log")
            .update({ status: "processing", response })
            .eq("id", id)
            .eq("status", status);
          if (staleBefore) {
            // The stale predicate and claimed_at refresh are one UPDATE.
            // PostgreSQL rechecks it under the row lock, so only one retry wins.
            query = query.lte("response->>claimed_at", staleBefore);
          }
          const { data, error } = await query
            .select(selectColumns)
            .maybeSingle();
          if (error) throw error;
          return data;
        };

        return claimPushLogForDelivery(id, {
          claimPending: (_claimId, response) =>
            updateAndReturn("pending", response),
          claimStaleProcessing: (_claimId, staleBefore, response) =>
            updateAndReturn("processing", response, staleBefore),
          async readStatus(claimId) {
            const { data, error } = await supabase
              .from("push_log")
              .select("status")
              .eq("id", claimId)
              .maybeSingle();
            if (error) throw error;
            return data?.status;
          },
        });
      },
      async markSent(id, response) {
        const { error } = await supabase
          .from("push_log")
          .update({ status: "sent", sent_at: new Date().toISOString(), response })
          .eq("id", id)
          .eq("status", "processing");
        if (error) throw error;
      },
      async markFailed(id, response) {
        const { error } = await supabase
          .from("push_log")
          .update({ status: "failed", sent_at: new Date().toISOString(), response })
          .eq("id", id)
          .in("status", ["pending", "processing"]);
        if (error) throw error;
      },
    };

    const result = await dispatchPendingPush(pushLogId, {
      store,
      oneSignalApiKey,
      oneSignalAppId: ONESIGNAL_APP_ID,
      fetchImpl: fetch,
    });
    console.log("Push result:", result.body);
    return jsonResponse(result.body, result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (activePushLogId) {
      const { error: updateError } = await supabase
        .from("push_log")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
          response: { ok: false, stage: "edge_function", error: message },
        })
        .eq("id", activePushLogId)
        .in("status", ["pending", "processing"]);
      if (updateError) console.error("push_log failure update error:", updateError);
    }
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

