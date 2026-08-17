import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public MioCoin reward preview for the OneMil Shoptet widget.
 *
 * CRITICAL INVARIANT: this endpoint does NOT calculate anything. It forwards the
 * request to public.compute_partner_reward — the same function
 * create_partner_order_reward uses when it actually issues MioCoins. That is what
 * guarantees the number a customer sees in the cart is the number they receive.
 * Never add reward maths here or in the widget JavaScript.
 *
 * Deliberately public (verify_jwt=false, no API key): the widget runs in the
 * partner's storefront where any secret would be readable. It exposes only what the
 * partner already publishes to their own customers — the reward for a given basket.
 *
 * It never returns, and never has access to, the Shoptet export URL, the Vault
 * secret, the partner API key, customer data or order history. It is strictly
 * read-only: STABLE function, no writes, no code issuance.
 */

const corsHeaders = {
  // The widget is embedded in the partner's own storefront domain.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// Widget-facing guardrails. A storefront basket is small; these only stop abuse.
const MAX_ITEMS = 200;
const MAX_CODE_LEN = 120;

type PreviewItem = {
  code?: unknown;
  quantity?: unknown;
  unit_price_czk?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function normalizeItems(raw: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: Array<Record<string, unknown>> = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as PreviewItem;

    const code = String(item.code ?? "").trim().slice(0, MAX_CODE_LEN);
    if (!code) continue;

    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price_czk ?? 0);

    out.push({
      code,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit_price_czk: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0,
    });
  }

  return out.length > 0 ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", error: "method_not_allowed" }, 405);

  let body: { partner_id?: string; items?: unknown; order_total_czk?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ status: "error", error: "invalid_json" }, 400);
  }

  const partnerId = String(body.partner_id ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId)) {
    return json({ status: "error", error: "invalid_partner_id" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Only the partner's public display configuration is read here.
  const { data: partner, error: pErr } = await admin
    .from("partners")
    .select("id, status, reward_mode, product_badge_enabled, shoptet_import_enabled")
    .eq("id", partnerId)
    .maybeSingle();

  if (pErr || !partner) return json({ status: "error", error: "partner_not_found" }, 404);

  // Widget stays silent for partners who are not live.
  if (partner.status !== "approved") {
    return json({ status: "ok", enabled: false, coins: 0, reason: "partner_not_active" });
  }

  const items = normalizeItems(body.items);
  const orderTotal = Number(body.order_total_czk ?? 0);

  const { data: reward, error: rErr } = await admin.rpc("compute_partner_reward", {
    p_partner_id: partnerId,
    p_order_total_czk: Number.isFinite(orderTotal) && orderTotal > 0 ? orderTotal : null,
    p_items: items,
  });

  if (rErr) {
    console.error("compute_partner_reward failed");
    return json({ status: "error", error: "preview_unavailable" }, 500);
  }

  const result = (typeof reward === "string" ? JSON.parse(reward) : reward) as {
    success?: boolean;
    coins?: number | string;
    issuable?: boolean;
    min_reward_mc?: number | string;
    reward_mode?: string;
    items?: Array<{ code?: string; mc?: number | string; mc_display?: number | string }>;
    error?: string;
  } | null;

  // A computation the engine cannot resolve (e.g. selected_products without items)
  // is not a widget error — the widget simply shows nothing.
  if (!result?.success) {
    return json({
      status: "ok",
      enabled: false,
      coins: 0,
      reason: result?.error ?? "not_available",
    });
  }

  // MioCoin values carry at most one decimal place and the engine has ALREADY
  // applied the single rounding on the order total. This endpoint must not round,
  // floor or truncate — a previous `Math.floor` here is exactly what made a 0.6 MC
  // reward render as 0 and disappear from the storefront. Numeric columns arrive
  // from PostgREST as strings, so they are only parsed, never re-rounded.
  const coins = Number(result.coins ?? 0);

  // Below the 0.5 MC minimum nothing would be issued, so nothing is promised.
  if (result.issuable === false) {
    return json({
      status: "ok",
      enabled: false,
      coins: 0,
      reason: "reward_amount_too_low",
    });
  }

  return json({
    status: "ok",
    enabled: true,
    coins,
    min_reward_mc: Number(result.min_reward_mc ?? 0.5),
    reward_mode: result.reward_mode,
    // Per-item breakdown so the widget can render a product badge without a
    // second round trip. Only code → MioCoins, nothing else. `mc_display` is the
    // engine's own per-item display value; the raw `mc` fallback is never rounded here.
    items: (result.items ?? []).map((i) => ({
      code: i.code,
      coins: Number(i.mc_display ?? i.mc ?? 0),
    })),
    // Product badges are partner-controlled; the cart summary always shows.
    product_badge_enabled: partner.product_badge_enabled !== false,
  });
});
