import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { parseShoptetCsv } from "../_shared/shoptetCsv.ts";

// Partner connects their Shoptet CSV export themselves — no second admin approval.
//
// Pavel confirmed (17. 08. 2026): the partner account is approved ONCE. After that
// the Shoptet connection activates automatically as soon as the submitted export URL
// is proven to be reachable and to contain a Shoptet CSV our single parser understands.
//
// Security model:
//   - verify_jwt = false: EF validates JWT internally for precise error codes.
//   - Caller must be an APPROVED partner (partners row with auth_user_id, status='approved').
//   - URL is NEVER stored in any application table or returned in any response.
//   - URL goes ONLY to Vault via store_shoptet_pending_url / promote_shoptet_pending_url.
//   - Validation happens BEFORE anything is stored, so a bad URL leaves no state behind.
//   - Activation MUST set shoptet_customer_delivery='onemil' for self-service partners.
//   - No MioCoin is issued here and no live import runs — only a read-only CSV probe.
//
// Flow: authenticate → verify approved partner → validate input → probe URL + parse CSV →
//       Vault store → Vault promote → activate partner → request status='active'.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROBE_TIMEOUT_MS = 15_000;
const PROBE_MAX_BYTES = 5 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function err(status: number, code: string, msg: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ success: false, error: code, message: msg, ...(extra ?? {}) }), {
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

// Read-only probe of the partner's export URL. Never mutates anything and never
// returns the URL or the CSV body — only a verdict.
async function probeExportUrl(url: string): Promise<
  | { okProbe: true }
  | { okProbe: false; code: string; message: string; extra?: Record<string, unknown> }
> {
  let text: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(url, { redirect: "follow", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) {
      return {
        okProbe: false,
        code: "export_url_unreachable",
        message: `Export URL vrátila HTTP ${resp.status}.`,
        extra: { http_status: resp.status },
      };
    }
    const raw = await resp.arrayBuffer();
    if (raw.byteLength > PROBE_MAX_BYTES) {
      return {
        okProbe: false,
        code: "export_too_large",
        message: "Export je příliš velký pro ověření.",
      };
    }
    text = new TextDecoder("utf-8").decode(raw);
  } catch {
    return {
      okProbe: false,
      code: "export_url_unreachable",
      message: "Export URL se nepodařilo stáhnout.",
    };
  }

  // Exactly one parser — the same one import-shoptet-orders uses.
  const parsed = parseShoptetCsv(text);

  if (parsed.missingHeaders.length === 1 && parsed.missingHeaders[0] === "empty_csv") {
    return { okProbe: false, code: "export_empty", message: "Export neobsahuje žádná data." };
  }
  if (parsed.missingHeaders.length > 0) {
    return {
      okProbe: false,
      code: "export_invalid_format",
      message: "Export nemá požadované sloupce Shoptet CSV.",
      extra: { missing: parsed.missingHeaders },
    };
  }
  return { okProbe: true };
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) {
    return err(401, "invalid_token", "Invalid or expired authorization token");
  }

  // ── 2. Approved partner verification ───────────────────────────────────────
  const { data: partner, error: partnerErr } = await admin
    .from("partners")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (partnerErr) {
    console.error("partner lookup:", partnerErr.message);
    return err(500, "internal_error", "Internal error");
  }
  if (!partner) {
    return err(403, "not_partner", "Caller does not have a partner account");
  }
  if (partner.status !== "approved") {
    return err(403, "partner_not_approved", "Partner account is not approved yet");
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
    .select("id, status, url_received, trigger_status")
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

  // ── 5. Validate the export BEFORE storing anything ─────────────────────────
  // A failed probe leaves the request as an editable draft with no Vault state,
  // so the partner can fix the URL and retry immediately.
  const probe = await probeExportUrl(url);
  if (!probe.okProbe) {
    return err(400, probe.code, probe.message, probe.extra);
  }

  // ── 6. Store URL in Vault — URL never touches any app table ────────────────
  const { error: vaultErr } = await admin.rpc("store_shoptet_pending_url", {
    p_request_id: request_id,
    p_url: url,
  });
  if (vaultErr) {
    console.error("vault store:", vaultErr.message);
    return err(500, "vault_error", "Failed to store URL securely");
  }

  // ── 7. Promote pending Vault key to the permanent partner key ──────────────
  const { data: finalKeyName, error: promoteErr } = await admin.rpc("promote_shoptet_pending_url", {
    p_request_id: request_id,
    p_partner_id: partner.id,
  });
  if (promoteErr) {
    console.error("vault promote:", promoteErr.message);
    await admin.rpc("delete_shoptet_pending_url", { p_request_id: request_id }).catch(() => {});
    return err(500, "vault_error", "Failed to activate export URL");
  }

  // ── 8. Activate the partner — delivery 'onemil' is non-negotiable ──────────
  const { error: partnerUpdateErr } = await admin
    .from("partners")
    .update({
      shoptet_export_secret_name: finalKeyName,
      shoptet_customer_delivery: "onemil",
      reward_trigger_status: scr.trigger_status,
      shoptet_import_enabled: true,
    })
    .eq("id", partner.id);
  if (partnerUpdateErr) {
    console.error("partner update:", partnerUpdateErr.message);
    return err(500, "partner_update_error", "Failed to activate partner settings");
  }

  // ── 9. Transition draft → active (no intermediate admin review state) ──────
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("shoptet_connection_requests")
    .update({
      status: "active",
      url_received: true,
      submitted_at: nowIso,
      reviewed_at: nowIso,
    })
    .eq("id", request_id)
    .eq("partner_id", partner.id)
    .eq("status", "draft"); // race guard: only transition from draft

  if (updateErr) {
    console.error("update:", updateErr.message);
    return err(500, "update_error", "Failed to update request status");
  }

  // ── 10. Respond — URL is never included ────────────────────────────────────
  return ok({ success: true, request_id, status: "active", partner_delivery: "onemil" });
});
