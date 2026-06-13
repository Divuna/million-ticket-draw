import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STAGING_PROJECT_REF = "dxmowysntemfqfnanxua";
const DEFAULT_PUBLIC_APP_URL = "https://onemil.cz";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrderCreateBody = {
  order_id?: string;
  external_order_id?: string;
  order_total_czk?: number | string;
  customer_email?: string;
  coins?: unknown;
  miocoins?: unknown;
  mio_coins?: unknown;
  reward_coins?: unknown;
};

type OrderStatusBody = {
  order_id?: string;
  external_order_id?: string;
  status?: string;
  order_status?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractApiKey(req: Request): string | null {
  const authHeader = req.headers.get("Authorization")?.trim();
  if (!authHeader) return null;
  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader;
}

function getOrderId(body: { order_id?: string; external_order_id?: string }) {
  const orderId = body.order_id?.trim();
  const externalOrderId = body.external_order_id?.trim();

  if (orderId && externalOrderId && orderId !== externalOrderId) {
    return { error: "order_id_external_order_id_mismatch" };
  }

  return { orderId: orderId || externalOrderId || "" };
}

function hasClientSuppliedRewardAmount(body: OrderCreateBody) {
  return (
    body.coins !== undefined ||
    body.miocoins !== undefined ||
    body.mio_coins !== undefined ||
    body.reward_coins !== undefined
  );
}

async function readJson(req: Request) {
  try {
    return { body: await req.json() };
  } catch {
    return { error: "invalid_json" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ status: "error", error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl.includes(STAGING_PROJECT_REF)) {
    console.error("partner-api-v1 refused non-staging project", { supabaseUrl });
    return jsonResponse({ status: "error", error: "staging_only" }, 503);
  }

  if (!serviceRoleKey) {
    return jsonResponse({ status: "error", error: "server_not_configured" }, 500);
  }

  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return jsonResponse({ status: "error", error: "missing_authorization" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: partnerId, error: resolveError } = await supabase.rpc(
    "resolve_partner_by_api_key",
    { p_key: apiKey },
  );

  if (resolveError || !partnerId) {
    console.error("partner-api-v1 API key resolution failed", resolveError);
    return jsonResponse({ status: "error", error: "invalid_api_key" }, 401);
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const isStatusUpdate = path.endsWith("/orders/status") || path.endsWith("/status");
  const isOrderCreate = path.endsWith("/orders") || path.endsWith("/order") || path.endsWith("/partner-api-v1");

  const { body, error: jsonError } = await readJson(req);
  if (jsonError) {
    return jsonResponse({ status: "error", error: jsonError }, 400);
  }

  const endpoint = isStatusUpdate ? "partner-api-v1/orders/status" : "partner-api-v1/orders";
  await supabase.rpc("log_partner_api_key_usage", {
    p_partner_id: partnerId,
    p_endpoint: endpoint,
    p_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    p_user_agent: req.headers.get("user-agent") || null,
  });

  if (isStatusUpdate) {
    const statusBody = body as OrderStatusBody;
    const orderResult = getOrderId(statusBody);
    if (orderResult.error) {
      return jsonResponse({ status: "error", error: orderResult.error }, 400);
    }

    const orderStatus = (statusBody.order_status ?? statusBody.status ?? "").trim();
    if (!orderResult.orderId) {
      return jsonResponse({ status: "error", error: "missing_order_id" }, 400);
    }
    if (!orderStatus) {
      return jsonResponse({ status: "error", error: "missing_order_status" }, 400);
    }

    const { data, error } = await supabase.rpc("partner_api_v1_update_order_status", {
      p_partner_id: partnerId,
      p_order_id: orderResult.orderId,
      p_order_status: orderStatus,
      p_base_url: DEFAULT_PUBLIC_APP_URL,
    });

    if (error) {
      console.error("partner-api-v1 status RPC failed", error);
      return jsonResponse({ status: "error", error: "status_update_failed" }, 500);
    }

    const result = data as Record<string, unknown>;
    if (!result?.success) {
      return jsonResponse({ status: "error", ...result }, 400);
    }

    return jsonResponse({ status: "ok", ...result });
  }

  if (!isOrderCreate) {
    return jsonResponse({ status: "error", error: "not_found" }, 404);
  }

  const createBody = body as OrderCreateBody;
  if (hasClientSuppliedRewardAmount(createBody)) {
    return jsonResponse(
      { status: "error", error: "reward_amount_must_not_be_sent" },
      400,
    );
  }

  const orderResult = getOrderId(createBody);
  if (orderResult.error) {
    return jsonResponse({ status: "error", error: orderResult.error }, 400);
  }

  if (!orderResult.orderId) {
    return jsonResponse({ status: "error", error: "missing_order_id" }, 400);
  }

  const orderTotal = Number(createBody.order_total_czk);
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
    return jsonResponse({ status: "error", error: "invalid_order_total_czk" }, 400);
  }

  const customerEmail = createBody.customer_email?.trim();
  if (!customerEmail) {
    return jsonResponse({ status: "error", error: "missing_customer_email" }, 400);
  }

  const { data, error } = await supabase.rpc("partner_api_v1_create_order_reward", {
    p_partner_id: partnerId,
    p_order_id: orderResult.orderId,
    p_order_total_czk: orderTotal,
    p_customer_email: customerEmail,
    p_base_url: DEFAULT_PUBLIC_APP_URL,
  });

  if (error) {
    console.error("partner-api-v1 create RPC failed", error);
    return jsonResponse({ status: "error", error: "order_create_failed" }, 500);
  }

  const result = data as Record<string, unknown>;
  if (!result?.success) {
    return jsonResponse({ status: "error", ...result }, 400);
  }

  return jsonResponse({ status: "ok", ...result });
});
