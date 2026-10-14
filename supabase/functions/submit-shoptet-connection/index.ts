import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getSupabaseSecretKey } from "../_shared/supabaseSecretKey.ts";

// Partner submits their Shoptet CSV export URL for admin review.
//
// Security model:
//   - verify_jwt = false: EF validates JWT internally for precise error codes.
//   - Caller must be an authenticated partner (has a partners row with auth_user_id).
//   - URL is NEVER stored in any application table or returned in any response.
//   - URL goes ONLY to Vault via store_shoptet_pending_url (service_role RPC).
//   - Request must be in status='draft' with url_received=false (partner's own).
//
// Flow: authenticate → verify partner → validate input → validate draft row →
//       store URL in Vault → transition draft → submitted → respond (no URL).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = getSupabaseSecretKey();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function err(status: number, code: string, msg: string): Response {
  return new Response(JSON.stringify({ success: false, error: code, message: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return err(405, "method_not_allowed", "POST required");
  }

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return err(401, "missing_authorization", "Authorization Bearer required");
  }
  const token = authHeader.slice(7);

  const admin = createClient(SUPABASE_URL, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) {
    return err(401, "invalid_token", "Invalid or expired authorization token");
  }

  // ── 2. Partner verification ────────────────────────────────────────────────
  const { data: partner, error: partnerErr } = await admin
    .from("partners")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (partnerErr) {
    console.error("partner lookup:", partnerErr.message);
    return err(500, "internal_error", "Internal error");
  }
  if (!partner) {
    return err(403, "not_partner", "Caller does not have a partner account");
  }

  // ── 3. Parse and validate body ─────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_json", "Request body must be valid JSON");
  }

  const { request_id, url } = body as { request_id?: unknown; url?: unknown };

  if (!request_id || typeof request_id !== "string") {
    return err(400, "missing_request_id", "request_id is required");
  }
  // Basic UUID format guard (prevents unexpected Vault key names).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request_id)) {
    return err(400, "invalid_request_id", "request_id must be a valid UUID");
  }
  if (!url || typeof url !== "string") {
    return err(400, "missing_url", "url is required");
  }
  if (!isValidHttpsUrl(url)) {
    return err(400, "invalid_url", "url must be a valid https:// URL");
  }

  // ── 4. Fetch submittable draft request ─────────────────────────────────────
  const { data: scr, error: scrErr } = await admin
    .from("shoptet_connection_requests")
    .select("id, status, url_received, request_kind")
    .eq("id", request_id)
    .eq("partner_id", partner.id)
    .eq("status", "draft")
    .eq("url_received", false)
    .maybeSingle();

  if (scrErr) {
    console.error("scr lookup:", scrErr.message);
    return err(500, "internal_error", "Internal error");
  }
  if (!scr) {
    return err(404, "draft_not_found", "No submittable draft request found");
  }

  const requestKind = (scr.request_kind as string | null) ?? "initial";

  // ── 4b. A URL change only makes sense on top of a live connection ──────────
  // Without this, a partner with no connection could file a "change" that admin
  // would approve into a Vault key nothing reads. The first connection must go
  // through the normal onboarding flow.
  if (requestKind === "url_change") {
    const { data: live, error: liveErr } = await admin
      .from("shoptet_connection_requests")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("request_kind", "initial")
      .in("status", ["approved", "active"])
      .maybeSingle();

    if (liveErr) {
      console.error("live lookup:", liveErr.message);
      return err(500, "internal_error", "Internal error");
    }
    if (!live) {
      return err(
        400,
        "no_active_connection",
        "URL change requires an already active Shoptet connection",
      );
    }
  }

  // ── 5. Store URL in Vault — URL never touches any app table ────────────────
  const { error: vaultErr } = await admin.rpc("store_shoptet_pending_url", {
    p_request_id: request_id,
    p_url: url,
  });
  if (vaultErr) {
    console.error("vault store:", vaultErr.message);
    return err(500, "vault_error", "Failed to store URL securely");
  }

  // ── 6. Transition draft → submitted ────────────────────────────────────────
  const { error: updateErr } = await admin
    .from("shoptet_connection_requests")
    .update({
      status: "submitted",
      url_received: true,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", request_id)
    .eq("partner_id", partner.id)
    .eq("status", "draft"); // race guard: only transition from draft

  if (updateErr) {
    console.error("update:", updateErr.message);
    // Best-effort Vault cleanup; non-blocking. The URL must not linger for a
    // request that never became submittable.
    //
    // try/catch, not .catch(): a PostgrestBuilder is a thenable but has no .catch,
    // so chaining one throws a TypeError and takes the whole handler down with a
    // bare 500 — which is exactly what a duplicate change request used to produce.
    try {
      await admin.rpc("delete_shoptet_pending_url", { p_request_id: request_id });
    } catch (cleanupErr) {
      console.warn("vault cleanup:", (cleanupErr as Error).message);
    }

    // scr_partner_pending_change_unique: a second URL change is already awaiting
    // review. This is the database having the last word on duplicates, so report
    // it as the expected outcome rather than an internal error.
    if (updateErr.code === "23505") {
      return err(
        409,
        "change_already_pending",
        "A URL change for this partner is already awaiting approval",
      );
    }
    return err(500, "update_error", "Failed to update request status");
  }

  // ── 7. Respond — URL is never included ─────────────────────────────────────
  return ok({ success: true, request_id, status: "submitted", request_kind: requestKind });
});
