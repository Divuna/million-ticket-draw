import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RequestBody = {
  action?: string;
  reward_code?: string;
  order_id?: string;
  external_order_id?: string;
  order_total_czk?: number | string;
  customer_email?: string;
  status?: string;
  order_status?: string;
  coins?: unknown;
  miocoins?: unknown;
  miocoin_amount?: unknown;
  reward_amount?: unknown;
  reward_coins?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function extractApiKey(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const apiKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  return apiKey || null;
}

function publicAppUrl() {
  const configured = Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_APP_URL");
  if (configured && /^https:\/\/[^/\s]+/i.test(configured) && !/localhost|lovable|preview/i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }

  return "https://onemil.cz";
}

function rewardLink(code: string) {
  return `${publicAppUrl()}/profile?miocoin_code=${encodeURIComponent(code)}`;
}

function hasForbiddenRewardAmount(body: RequestBody) {
  return (
    body.coins !== undefined ||
    body.miocoins !== undefined ||
    body.miocoin_amount !== undefined ||
    body.reward_amount !== undefined ||
    body.reward_coins !== undefined
  );
}

function normalizeAction(body: RequestBody) {
  const explicit = body.action?.trim().toLowerCase();
  if (explicit) return explicit;
  if (body.order_total_czk !== undefined) return "create_order_reward";
  if (body.status !== undefined || body.order_status !== undefined) return "update_order_status";
  if (body.reward_code !== undefined) return "activate_reward_code";
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ status: "error", error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return jsonResponse({ status: "error", error: "Missing Authorization header" }, 401);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ status: "error", error: "Invalid JSON body" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: partnerId, error: resolveError } = await supabaseAdmin.rpc(
      "resolve_partner_by_api_key",
      { p_key: apiKey },
    );

    if (resolveError || !partnerId) {
      console.error("API key resolution failed:", resolveError);
      return jsonResponse({ status: "error", error: "Invalid or expired API key" }, 401);
    }

    const { data: keyData, error: keyError } = await supabaseAdmin
      .from("partner_api_keys")
      .select("id")
      .eq("partner_id", partnerId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (keyError) {
      console.error("Failed to get key_id:", keyError);
    }

    const action = normalizeAction(body);

    if (action === "create_order_reward" || action === "create_order") {
      if (hasForbiddenRewardAmount(body)) {
        return jsonResponse(
          {
            status: "error",
            error: "Do not send coins, miocoins, or final reward amount. OneMil calculates the reward.",
          },
          400,
        );
      }

      const externalOrderId = body.external_order_id ?? body.order_id;
      const orderTotal = Number(body.order_total_czk);

      if (!externalOrderId) {
        return jsonResponse({ status: "error", error: "Missing order_id or external_order_id" }, 400);
      }

      if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
        return jsonResponse({ status: "error", error: "Invalid order_total_czk" }, 400);
      }

      if (!body.customer_email) {
        return jsonResponse({ status: "error", error: "Missing customer_email" }, 400);
      }

      const { data, error } = await supabaseAdmin.rpc("create_partner_order_reward", {
        p_partner_id: partnerId,
        p_external_order_id: externalOrderId,
        p_order_total_czk: orderTotal,
        p_customer_email: body.customer_email,
        p_metadata: { api_action: "create_order_reward" },
      });

      if (error) {
        console.error("Order reward creation failed:", error);
        return jsonResponse({ status: "error", error: error.message || "Order reward creation failed" }, 400);
      }

      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) {
        return jsonResponse({ status: "error", error: result?.error || "Order reward creation failed" }, 400);
      }

      await supabaseAdmin.rpc("log_partner_api_key_usage", {
        p_partner_id: partnerId,
        p_key_id: keyData?.id ?? null,
      });

      return jsonResponse({
        status: result.status,
        code: result.code,
        link: rewardLink(result.code),
        coins: result.coins,
        external_order_id: result.external_order_id,
        customer_email: result.customer_email,
        duplicate: Boolean(result.duplicate),
      });
    }

    if (action === "update_order_status" || action === "update_status") {
      if (hasForbiddenRewardAmount(body)) {
        return jsonResponse(
          {
            status: "error",
            error: "Do not send coins, miocoins, or final reward amount. OneMil calculates the reward.",
          },
          400,
        );
      }

      const externalOrderId = body.external_order_id ?? body.order_id;
      const orderStatus = body.order_status ?? body.status;

      if (!externalOrderId) {
        return jsonResponse({ status: "error", error: "Missing order_id or external_order_id" }, 400);
      }

      if (!orderStatus) {
        return jsonResponse({ status: "error", error: "Missing status or order_status" }, 400);
      }

      const { data, error } = await supabaseAdmin.rpc("update_partner_order_reward_status", {
        p_partner_id: partnerId,
        p_external_order_id: externalOrderId,
        p_order_status: orderStatus,
      });

      if (error) {
        console.error("Order status update failed:", error);
        return jsonResponse({ status: "error", error: error.message || "Order status update failed" }, 400);
      }

      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) {
        return jsonResponse({ status: "error", error: result?.error || "Order status update failed" }, 400);
      }

      await supabaseAdmin.rpc("log_partner_api_key_usage", {
        p_partner_id: partnerId,
        p_key_id: keyData?.id ?? null,
      });

      return jsonResponse({
        status: result.status,
        code: result.code,
        link: rewardLink(result.code),
        coins: result.coins,
        external_order_id: result.external_order_id,
        customer_email: result.customer_email,
        already_redeemed: Boolean(result.already_redeemed),
      });
    }

    if (action === "activate_reward_code") {
      const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
      if (req.headers.get("x-internal-token") !== internalToken) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      if (!body.reward_code) {
        return jsonResponse({ status: "error", error: "Missing reward_code" }, 400);
      }

      const { data: activationResult, error: activationError } = await supabaseAdmin.rpc(
        "activate_partner_reward_sql",
        {
          p_api_key: apiKey,
          p_partner_id: partnerId,
          p_reward_code: body.reward_code,
        },
      );

      if (activationError) {
        console.error("Activation failed:", activationError);
        return jsonResponse({ status: "error", error: activationError.message || "Activation failed" }, 400);
      }

      await supabaseAdmin.rpc("log_partner_api_key_usage", {
        p_partner_id: partnerId,
        p_key_id: keyData?.id ?? null,
      });

      const result = typeof activationResult === "string"
        ? JSON.parse(activationResult)
        : activationResult;

      return jsonResponse({
        status: "ok",
        coins: result?.coins ?? null,
        activation_id: result?.activation_id ?? null,
      });
    }

    return jsonResponse({ status: "error", error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ status: "error", error: "Internal server error" }, 500);
  }
});
