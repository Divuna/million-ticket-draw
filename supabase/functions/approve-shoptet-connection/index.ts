import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// Admin approves or rejects a submitted Shoptet connection request.
//
// Security model:
//   - verify_jwt = false: EF validates JWT internally for precise error codes.
//   - Caller must be superadmin (user_roles check).
//   - CRITICAL: approve MUST set shoptet_customer_delivery = 'onemil' for
//     all self-service partners. BOHEMIA stays on 'partner' (separate row,
//     never submitted through this flow).
//   - URL is never stored in any app table or returned in any response.
//   - On approve: promote pending Vault key to final partner key.
//   - On reject:  delete pending Vault key (best-effort).
//
// Request: POST { request_id: uuid, action: 'approve'|'reject', rejection_reason?: string }
// Approve response: { success, request_id, status: 'active', partner_delivery: 'onemil' }
// Reject  response: { success, request_id, status: 'rejected' }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST required");

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return err(401, "missing_authorization", "Authorization Bearer required");
  }
  const token = authHeader.slice(7);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return err(401, "invalid_token", "Invalid or expired authorization token");

  // ── 2. Admin / superadmin check ────────────────────────────────────────────
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "superadmin")
    .maybeSingle();
  if (roleErr) { console.error("role lookup:", roleErr.message); return err(500, "internal_error", "Internal error"); }
  if (!roleRow) return err(403, "access_denied_superadmin_only", "Superadmin role required");

  // ── 3. Parse and validate body ─────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, "invalid_json", "Request body must be valid JSON"); }

  const { request_id, action, rejection_reason } = body as {
    request_id?: unknown;
    action?: unknown;
    rejection_reason?: unknown;
  };

  if (!request_id || typeof request_id !== "string")
    return err(400, "missing_request_id", "request_id is required");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request_id))
    return err(400, "invalid_request_id", "request_id must be a valid UUID");
  if (action !== "approve" && action !== "reject")
    return err(400, "invalid_action", "action must be 'approve' or 'reject'");
  if (action === "reject" && rejection_reason !== undefined && typeof rejection_reason !== "string")
    return err(400, "invalid_rejection_reason", "rejection_reason must be a string if provided");

  // ── 4. Load submitted request ──────────────────────────────────────────────
  const { data: scr, error: scrErr } = await admin
    .from("shoptet_connection_requests")
    .select("id, partner_id, trigger_status, status")
    .eq("id", request_id)
    .eq("status", "submitted")
    .maybeSingle();
  if (scrErr) { console.error("scr lookup:", scrErr.message); return err(500, "internal_error", "Internal error"); }
  if (!scr) return err(404, "request_not_found", "No submitted request found with this id");

  // ── 5a. APPROVE ────────────────────────────────────────────────────────────
  if (action === "approve") {
    // Promote pending Vault URL to permanent partner key.
    // Returns final Vault key NAME (not the URL — URL stays encrypted in Vault only).
    const { data: finalKeyName, error: promoteErr } = await admin.rpc("promote_shoptet_pending_url", {
      p_request_id: request_id,
      p_partner_id: scr.partner_id,
    });
    if (promoteErr) {
      console.error("vault promote:", promoteErr.message);
      return err(500, "vault_error", "Failed to promote URL to partner Vault key");
    }

    // Update partner — CRITICAL: shoptet_customer_delivery MUST be 'onemil'
    // for all self-service partners. BOHEMIA keeps 'partner' (separate row,
    // never submits through this flow).
    const { error: partnerErr } = await admin
      .from("partners")
      .update({
        shoptet_export_secret_name: finalKeyName,
        shoptet_customer_delivery: "onemil",   // non-negotiable for self-service
        reward_trigger_status: scr.trigger_status,
        shoptet_import_enabled: true,
      })
      .eq("id", scr.partner_id);
    if (partnerErr) {
      console.error("partner update:", partnerErr.message);
      // Best-effort Vault rollback — pending key may already be promoted, log only
      console.warn("vault promoted but partner update failed — manual cleanup may be needed for partner", scr.partner_id);
      return err(500, "partner_update_error", "Failed to update partner settings");
    }

    // Transition request: submitted → active
    const { error: scrUpdateErr } = await admin
      .from("shoptet_connection_requests")
      .update({
        status: "active",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", request_id)
      .eq("status", "submitted"); // race guard
    if (scrUpdateErr) {
      console.error("scr active:", scrUpdateErr.message);
      return err(500, "status_update_error", "Failed to set request active");
    }

    // Best-effort partner notification via email_queue.
    // Requires resolving partner auth email; non-blocking on failure.
    try {
      const { data: partnerRow } = await admin
        .from("partners")
        .select("auth_user_id, name")
        .eq("id", scr.partner_id)
        .maybeSingle();
      if (partnerRow?.auth_user_id) {
        const { data: authUser } = await admin.auth.admin.getUserById(partnerRow.auth_user_id);
        const partnerEmail = authUser?.user?.email;
        const partnerName = partnerRow.name ?? "Partner";
        if (partnerEmail) {
          await admin.from("email_queue").insert({
            email: partnerEmail,
            subject: "Váš Shoptet e-shop byl úspěšně zapojen do OneMil",
            body: `Dobrý den, ${partnerName},\n\nváš Shoptet e-shop byl schválen a aktivován pro automatické vydávání MioCoin kódů zákazníkům.\n\nZákazníci budou dostávat kódy e-mailem od OneMil ihned po vydání.\n\nS pozdravem,\nTým OneMil`,
          });
        }
      }
    } catch (notifErr) {
      console.warn("notification skipped:", (notifErr as Error).message);
    }

    return ok({ success: true, request_id, status: "active", partner_delivery: "onemil" });
  }

  // ── 5b. REJECT ─────────────────────────────────────────────────────────────
  // Delete pending Vault key (best-effort; key is encrypted, lingering is safe but wasteful).
  await admin.rpc("delete_shoptet_pending_url", { p_request_id: request_id }).catch((e: Error) => {
    console.warn("vault delete:", e.message);
  });

  // Transition request: submitted → rejected
  const { error: scrRejectErr } = await admin
    .from("shoptet_connection_requests")
    .update({
      status: "rejected",
      rejection_reason: typeof rejection_reason === "string" && rejection_reason.trim()
        ? rejection_reason.trim()
        : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", request_id)
    .eq("status", "submitted"); // race guard
  if (scrRejectErr) {
    console.error("scr reject:", scrRejectErr.message);
    return err(500, "status_update_error", "Failed to set request rejected");
  }

  // partners: NO changes — shoptet_import_enabled stays false, delivery stays 'partner' (default).

  // Best-effort rejection notification.
  try {
    const { data: partnerRow } = await admin
      .from("partners")
      .select("auth_user_id, name")
      .eq("id", scr.partner_id)
      .maybeSingle();
    if (partnerRow?.auth_user_id) {
      const { data: authUser } = await admin.auth.admin.getUserById(partnerRow.auth_user_id);
      const partnerEmail = authUser?.user?.email;
      const partnerName = partnerRow.name ?? "Partner";
      if (partnerEmail) {
        const reason = typeof rejection_reason === "string" && rejection_reason.trim()
          ? `\n\nDůvod: ${rejection_reason.trim()}`
          : "";
        await admin.from("email_queue").insert({
          email: partnerEmail,
          subject: "Váš požadavek na napojení Shoptet e-shopu byl zamítnut",
          body: `Dobrý den, ${partnerName},\n\nbohužel váš požadavek na napojení Shoptet e-shopu do OneMil byl zamítnut.${reason}\n\nPokud máte dotazy, kontaktujte nás na eshop@onemil.cz.\n\nS pozdravem,\nTým OneMil`,
        });
      }
    }
  } catch (notifErr) {
    console.warn("rejection notification skipped:", (notifErr as Error).message);
  }

  return ok({ success: true, request_id, status: "rejected" });
});
