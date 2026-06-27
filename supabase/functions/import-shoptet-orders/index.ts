import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Shoptet CSV importer — DRY-RUN ONLY (Phase 1B).
 *
 * Fetches a partner's Shoptet CSV export (URL read from Vault, never logged),
 * validates headers, parses rows, and writes a shoptet_import_runs summary plus
 * per-row outcomes (order code + outcome only — NO customer emails, NO URL).
 *
 * It does NOT call create_partner_order_reward, does NOT update reward status,
 * and does NOT send any email. It only reports what a live run WOULD do.
 *
 * Auth: x-internal-token (automation) OR service-role bearer OR superadmin JWT.
 */
async function authorize(req: Request, admin: ReturnType<typeof createClient>) {
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  const provided = req.headers.get("x-internal-token");
  if (internalToken && provided && provided === internalToken) return null;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "missing_authorization" };
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) return null;

  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return { status: 401, error: "invalid_authorization_token" };
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "superadmin")
    .maybeSingle();
  if (!roleRow) return { status: 403, error: "access_denied_superadmin_only" };
  return null;
}

// ── CSV parsing (delimiter auto-detect ; or ,) ───────────────────────────────
function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Diacritic-insensitive normalizer (Czech statuses like "Odesláno" → "odeslano").
function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Candidate header names (normalized substring match — ASCII forms only).
const HEADER_CANDIDATES = {
  order: ["code", "cislo objednavky", "order", "order_number", "objednavka"],
  total: ["total", "celkem", "cena celkem", "price", "totalprice", "grand total", "amount"],
  email: ["email", "e-mail", "mail"],
  status: ["status", "stav"],
};

function findCol(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => norm(h));
  for (const c of candidates) {
    const idx = normalized.findIndex((h) => h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Conservative Shoptet status → reward action mapping (dry-run reporting only).
function mapStatus(raw: string): "paid" | "cancelled" | "pending" {
  const s = norm(raw);
  if (/(zaplac|paid|completed|dokon|odeslan|shipped|vyriz)/.test(s)) return "paid";
  if (/(storn|zrusen|cancel|vracen|returned|nevyzved|unpaid|nezaplac)/.test(s)) return "cancelled";
  return "pending";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authFailure = await authorize(req, admin);
  if (authFailure) return json({ status: "error", error: authFailure.error }, authFailure.status);

  let body: { partner_id?: string };
  try { body = await req.json(); } catch { return json({ status: "error", error: "invalid_json" }, 400); }
  const partnerId = (body.partner_id ?? "").trim();
  if (!partnerId) return json({ status: "error", error: "partner_id is required" }, 400);

  // Partner must exist and be enabled for import.
  const { data: partner, error: pErr } = await admin
    .from("partners")
    .select("id, shoptet_import_enabled, shoptet_export_secret_name")
    .eq("id", partnerId)
    .maybeSingle();
  if (pErr || !partner) return json({ status: "error", error: "partner_not_found" }, 404);
  if (!partner.shoptet_import_enabled) return json({ status: "error", error: "import_not_enabled" }, 400);
  if (!partner.shoptet_export_secret_name) return json({ status: "error", error: "export_url_not_configured" }, 400);

  // Open a dry-run record up front.
  const { data: run, error: runErr } = await admin
    .from("shoptet_import_runs")
    .insert({ partner_id: partnerId, trigger: "admin", mode: "dry_run", status: "running" })
    .select("id")
    .single();
  if (runErr || !run) return json({ status: "error", error: "could_not_create_run" }, 500);
  const runId = run.id as string;

  const finalize = async (patch: Record<string, unknown>) => {
    await admin.from("shoptet_import_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);
  };

  try {
    // Read URL from Vault (server-side only, never logged/returned).
    const { data: url, error: urlErr } = await admin.rpc("get_shoptet_export_url", { p_partner_id: partnerId });
    if (urlErr || !url) {
      await finalize({ status: "failed", error_summary: "export_url_unavailable" });
      return json({ status: "error", error: "export_url_unavailable", run_id: runId }, 400);
    }

    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) {
      await finalize({ status: "failed", error_summary: `fetch_failed_http_${resp.status}` });
      return json({ status: "error", error: "fetch_failed", http_status: resp.status, run_id: runId }, 502);
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 1) {
      await finalize({ status: "failed", error_summary: "empty_csv" });
      return json({ status: "error", error: "empty_csv", run_id: runId }, 400);
    }

    const delim = detectDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delim);
    const colOrder = findCol(headers, HEADER_CANDIDATES.order);
    const colTotal = findCol(headers, HEADER_CANDIDATES.total);
    const colEmail = findCol(headers, HEADER_CANDIDATES.email);
    const colStatus = findCol(headers, HEADER_CANDIDATES.status);

    const missing: string[] = [];
    if (colOrder < 0) missing.push("order_code");
    if (colTotal < 0) missing.push("total");
    if (colEmail < 0) missing.push("email");
    if (missing.length > 0) {
      await finalize({ status: "failed", error_summary: `missing_headers:${missing.join(",")}` });
      return json({ status: "error", error: "missing_required_headers", missing, run_id: runId }, 400);
    }

    const dataRows = lines.slice(1);
    let rowsValid = 0, rowsInvalid = 0, rowsWouldCreate = 0, rowsWouldStatusUpdate = 0, rowsSkipDup = 0;

    // Pre-load existing external_order_ids for this partner (dup detection).
    const { data: existing } = await admin
      .from("partner_reward_codes")
      .select("external_order_id")
      .eq("partner_id", partnerId);
    const existingIds = new Set((existing ?? []).map((r: { external_order_id: string }) => r.external_order_id));

    const logBatch: Array<Record<string, unknown>> = [];
    for (const line of dataRows) {
      const cols = parseCsvLine(line, delim);
      const orderId = (cols[colOrder] ?? "").trim();
      const totalRaw = (cols[colTotal] ?? "").replace(/\s/g, "").replace(",", ".");
      const total = Number(totalRaw);
      const emailPresent = colEmail >= 0 && (cols[colEmail] ?? "").includes("@"); // presence only; never stored
      const statusAction = colStatus >= 0 ? mapStatus(cols[colStatus] ?? "") : "pending";

      if (!orderId || !Number.isFinite(total) || total <= 0 || !emailPresent) {
        rowsInvalid++;
        logBatch.push({ run_id: runId, external_order_id: orderId || null, action: "invalid", result: "skipped" });
        continue;
      }
      rowsValid++;
      if (existingIds.has(orderId)) {
        rowsSkipDup++;
        logBatch.push({ run_id: runId, external_order_id: orderId, action: "skip_dup", result: "exists" });
        continue;
      }
      rowsWouldCreate++;
      logBatch.push({ run_id: runId, external_order_id: orderId, action: "would_create", result: statusAction });
      if (statusAction === "paid" || statusAction === "cancelled") rowsWouldStatusUpdate++;
    }

    if (logBatch.length > 0) {
      // Insert in chunks to keep payloads small.
      for (let i = 0; i < logBatch.length; i += 500) {
        await admin.from("shoptet_import_row_log").insert(logBatch.slice(i, i + 500));
      }
    }

    const summary = {
      rows_total: dataRows.length,
      rows_valid: rowsValid,
      rows_invalid: rowsInvalid,
      rows_would_create: rowsWouldCreate,
      rows_would_status_update: rowsWouldStatusUpdate,
      rows_skipped_dup: rowsSkipDup,
      status: rowsInvalid > 0 ? "partial" : "ok",
    };
    await finalize(summary);

    return json({ status: "ok", mode: "dry_run", run_id: runId, ...summary });
  } catch (e) {
    await finalize({ status: "failed", error_summary: "unexpected_error" });
    console.error("import-shoptet-orders dry-run error:", (e as Error)?.message);
    return json({ status: "error", error: "unexpected_error", run_id: runId }, 500);
  }
});
