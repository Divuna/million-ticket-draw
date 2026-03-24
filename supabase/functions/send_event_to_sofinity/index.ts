import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const PROJECT_ID = "defababe-004b-4c63-9ff1-311540b0a3c9";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const internalToken = req.headers.get("x-internal-token");
    const expectedToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");

    if (!internalToken || internalToken !== expectedToken) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    const sofinityUrl = Deno.env.get("SOFINITY_URL");
    const sofinityKey = Deno.env.get("SOFINITY_API_KEY");

    if (!sofinityUrl || !sofinityKey) {
      console.error("[send_event_to_sofinity] Missing SOFINITY_URL or SOFINITY_API_KEY");
      return new Response(
        JSON.stringify({ success: false, error: "Missing Sofinity configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract event data from the worker payload
    const event = body.event ?? body;
    const eventName = event.event_name ?? "unknown";
    const userId = event.user_id ?? null;
    const contestId = event.contest_id ?? null;
    const metadata = event.metadata ?? {};
    const sourceSystem = event.source_system ?? "onemil";

    // Build Sofinity EventLogs payload (matching sofinity-forwarder format)
    const sofinityPayload = {
      project_id: PROJECT_ID,
      event_name: eventName,
      metadata: {
        ...metadata,
        source_event_id: event.id ?? null,
      },
      source_system: sourceSystem,
      user_id: userId,
      contest_id: contestId,
    };

    console.log("[send_event_to_sofinity] Sending to Sofinity", {
      event_id: event.id,
      event_name: eventName,
      user_id: userId,
      message_content: metadata.message_content ?? null,
    });

    const res = await fetch(`${sofinityUrl}/rest/v1/EventLogs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sofinityKey}`,
        "apikey": sofinityKey,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(sofinityPayload),
    });

    const resBody = await res.text();

    console.log("[send_event_to_sofinity] Sofinity response", {
      event_id: event.id,
      status: res.status,
      body: resBody.slice(0, 500),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: resBody, http_status: res.status }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, sofinity_response: resBody }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send_event_to_sofinity] Exception:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
