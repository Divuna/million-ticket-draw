import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

type ImportMode = "dry_run" | "live";

// Five-bucket Shoptet order status taxonomy.
// completed: fully fulfilled  → issue for all trigger thresholds.
// shipped:   dispatched       → issue for 'paid' and 'shipped' thresholds.
// paid:      payment received → issue only for 'paid' threshold.
// cancelled: stopped/returned → always cancel the reward code.
// pending:   below threshold  → leave reward code as pending.
type ShoptetStatus = "paid" | "shipped" | "completed" | "cancelled" | "pending";

type ImportRow = {
  orderId: string;
  total: number;
  customerEmail: string;
  shoptetStatus: ShoptetStatus;
};

type RpcResult = {
  success?: boolean;
  duplicate?: boolean;
  email_enqueued?: boolean;
  error?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Shoptet CSV importer.
 *
 * Default mode is dry-run. Live issuance runs only when the caller sends
 * { "mode": "live" }. The importer never logs/returns the Shoptet URL, customer
 * emails, full reward codes, API keys, tokens, or hashes.
 *
 * Auth: x-internal-token (automation) OR service-role bearer OR superadmin JWT.
 *
 * Reward issuance respects partners.reward_trigger_status:
 *   'paid'      → issue when Shoptet status is paid, shipped, or completed.
 *   'shipped'   → issue when Shoptet status is shipped or completed.
 *   'completed' → issue only when Shoptet status is completed.
 */
async function authorize(req: Request, admin: ReturnType<typeof createClient>) {
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  const provided = req.headers.get("x-internal-token");
  if (internalToken && provided && provided === internalToken) return null;

  // Vault-stored dispatch token used by the pg_cron orchestrator
  // (run_shoptet_cron_imports). Verified server-side via SECURITY DEFINER RPC so
  // the secret is never exposed to the function environment or logs.
  if (provided) {
    const { data: vaultOk } = await admin.rpc("verify_shoptet_cron_token", { p_token: provided });
    if (vaultOk === true) return null;
  }

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
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

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

// Maps raw Shoptet status string to 5-bucket taxonomy.
// completed must be checked BEFORE shipped and paid — Czech "vyřízená" (vyriz)
// would otherwise match the paid pattern first.
function mapStatus(raw: string): ShoptetStatus {
  const s = norm(raw);
  if (/(completed|dokon|vyriz|dorucen|delivered)/.test(s))                     return "completed";
  if (/(shipped|odeslan|dispatched)/.test(s))                                   return "shipped";
  if (/(zaplac|paid|pripravena|processing|vyrizuje)/.test(s))                   return "paid";
  if (/(storn|zrusen|cancel|vracen|returned|nevyzved|unpaid|nezaplac)/.test(s)) return "cancelled";
  return "pending";
}

// Returns true if the reward code should be issued NOW given the partner's threshold.
function shouldIssue(status: ShoptetStatus, triggerThreshold: string): boolean {
  if (status === "completed") return true;                              // all thresholds
  if (status === "shipped")   return triggerThreshold !== "completed";  // 'paid' + 'shipped'
  if (status === "paid")      return triggerThreshold === "paid";       // 'paid' only
  return false;                                                         // pending, cancelled
}

// Maps ShoptetStatus → value accepted by update_partner_order_reward_status.
// RPC positive set: 'paid', 'delivered', 'completed'. 'shipped' is not accepted → 'delivered'.
function toRpcStatus(s: ShoptetStatus): string {
  if (s === "completed") return "completed";
  if (s === "shipped")   return "delivered";
  if (s === "paid")      return "paid";
  return "cancelled";
}

function asMode(raw: unknown): ImportMode {
  return raw === "live" ? "live" : "dry_run";
}

function isSuccessResult(value: unknown): value is RpcResult {
  return Boolean(value && typeof value === "object" && (value as RpcResult).success === true);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authFailure = await authorize(req, admin);
  if (authFailure) return json({ status: "error", error: authFailure.error }, authFailure.status);

  let body: { partner_id?: string; mode?: string; trigger?: string };
  try {
    body = await req.json();
  } catch {
    return json({ status: "error", error: "invalid_json" }, 400);
  }

  const partnerId = (body.partner_id ?? "").trim();
  if (!partnerId) return json({ status: "error", error: "partner_id is required" }, 400);
  const mode = asMode(body.mode);
  // Run origin recorded in shoptet_import_runs.trigger. 'cron' for the scheduled
  // orchestrator, 'admin' for manual/UI invocations (default).
  const trigger = body.trigger === "cron" ? "cron" : "admin";

  // Load reward_trigger_status and shoptet_customer_delivery alongside existing fields.
  // Default 'paid' preserves BOHEMIA and all legacy partner behaviour.
  const { data: partner, error: pErr } = await admin
    .from("partners")
    .select("id, shoptet_import_enabled, shoptet_export_secret_name, reward_trigger_status, shoptet_customer_delivery")
    .eq("id", partnerId)
    .maybeSingle();
  if (pErr || !partner) return json({ status: "error", error: "partner_not_found" }, 404);
  if (!partner.shoptet_import_enabled) return json({ status: "error", error: "import_not_enabled" }, 400);
  if (!partner.shoptet_export_secret_name) return json({ status: "error", error: "export_url_not_configured" }, 400);

  const triggerThreshold: string = partner.reward_trigger_status ?? "paid";

  // Overlap guard: skip if an import is already running for this partner
  // (started within the last 30 min). Protects against cron/admin overlap and
  // double-firing. Stale 'running' rows older than 30 min are ignored so a
  // crashed run never blocks the partner permanently.
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: runningRun } = await admin
    .from("shoptet_import_runs")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("status", "running")
    .gte("started_at", staleCutoff)
    .limit(1)
    .maybeSingle();
  if (runningRun) {
    return json({ status: "skipped", reason: "already_running", partner_id: partnerId }, 200);
  }

  const { data: run, error: runErr } = await admin
    .from("shoptet_import_runs")
    .insert({ partner_id: partnerId, trigger, mode, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) return json({ status: "error", error: "could_not_create_run" }, 500);
  const runId = run.id as string;

  const finalize = async (patch: Record<string, unknown>) => {
    await admin.from("shoptet_import_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);
  };

  try {
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
    let rowsValid = 0;
    let rowsInvalid = 0;
    let rowsWouldCreate = 0;
    let rowsWouldStatusUpdate = 0;
    let rowsSkipDup = 0;
    let rowsCreated = 0;
    let rowsStatusUpdated = 0;
    let rowsEmailEnqueued = 0;
    let rowsFailed = 0;

    const { data: existing } = await admin
      .from("partner_reward_codes")
      .select("external_order_id")
      .eq("partner_id", partnerId);
    const existingIds = new Set((existing ?? []).map((r: { external_order_id: string }) => r.external_order_id));

    const validRows: ImportRow[] = [];
    const logBatch: Array<Record<string, unknown>> = [];
    for (const line of dataRows) {
      const cols = parseCsvLine(line, delim);
      const orderId = (cols[colOrder] ?? "").trim();
      const totalRaw = (cols[colTotal] ?? "").replace(/\s/g, "").replace(",", ".");
      const total = Number(totalRaw);
      const customerEmail = (cols[colEmail] ?? "").trim();
      const emailPresent = customerEmail.includes("@");
      const shoptetStatus: ShoptetStatus = colStatus >= 0 ? mapStatus(cols[colStatus] ?? "") : "pending";

      if (!orderId || !Number.isFinite(total) || total <= 0 || !emailPresent) {
        rowsInvalid++;
        logBatch.push({ run_id: runId, external_order_id: orderId || null, action: "invalid", result: "skipped" });
        continue;
      }

      rowsValid++;
      if (mode === "dry_run" && existingIds.has(orderId)) {
        rowsSkipDup++;
        logBatch.push({ run_id: runId, external_order_id: orderId, action: "skip_dup", result: "exists" });
        continue;
      }

      validRows.push({ orderId, total, customerEmail, shoptetStatus });
      if (!existingIds.has(orderId)) {
        rowsWouldCreate++;
        logBatch.push({ run_id: runId, external_order_id: orderId, action: "would_create", result: shoptetStatus });
        if (shouldIssue(shoptetStatus, triggerThreshold) || shoptetStatus === "cancelled") {
          rowsWouldStatusUpdate++;
        }
      }
    }

    if (mode === "live") {
      const preLiveLogBatch = logBatch.filter((row) => row.action === "invalid");
      logBatch.length = 0;
      logBatch.push(...preLiveLogBatch);

      if (rowsInvalid > 0) {
        rowsFailed = rowsInvalid;
      } else {
        for (const row of validRows) {
          const { data: createResult, error: createErr } = await admin.rpc("create_partner_order_reward", {
            p_partner_id: partnerId,
            p_external_order_id: row.orderId,
            p_order_total_czk: row.total,
            p_customer_email: row.customerEmail,
            p_metadata: {
              source_detail: "shoptet_import",
              shoptet_import_run_id: runId,
            },
          });

          if (createErr || !isSuccessResult(createResult)) {
            rowsFailed++;
            logBatch.push({ run_id: runId, external_order_id: row.orderId, action: "error", result: "create_failed" });
            continue;
          }

          if (createResult.duplicate === true) {
            rowsSkipDup++;
            logBatch.push({ run_id: runId, external_order_id: row.orderId, action: "skip_dup", result: "exists" });
          } else {
            rowsCreated++;
            logBatch.push({ run_id: runId, external_order_id: row.orderId, action: "create", result: "ok" });
          }

          // Apply reward_trigger_status threshold logic.
          const willIssue  = shouldIssue(row.shoptetStatus, triggerThreshold);
          const willCancel = row.shoptetStatus === "cancelled";

          if (!willIssue && !willCancel) continue; // below threshold → leave as pending

          const { data: statusResult, error: statusErr } = await admin.rpc("update_partner_order_reward_status", {
            p_partner_id: partnerId,
            p_external_order_id: row.orderId,
            p_order_status: toRpcStatus(row.shoptetStatus),
          });

          if (statusErr || !isSuccessResult(statusResult)) {
            rowsFailed++;
            logBatch.push({ run_id: runId, external_order_id: row.orderId, action: "error", result: "status_update_failed" });
            continue;
          }

          rowsStatusUpdated++;
          if (statusResult.email_enqueued === true) rowsEmailEnqueued++;
          logBatch.push({ run_id: runId, external_order_id: row.orderId, action: "status_update", result: toRpcStatus(row.shoptetStatus) });
        }
      }
    }

    if (logBatch.length > 0) {
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
      rows_created: rowsCreated,
      rows_status_updated: rowsStatusUpdated,
      rows_failed: rowsFailed,
      status: rowsInvalid > 0 || rowsFailed > 0 ? "partial" : "ok",
    };
    await finalize(summary);

    if (mode === "live") {
      return json({
        status: summary.status,
        mode,
        run_id: runId,
        rows_total: summary.rows_total,
        rows_valid: summary.rows_valid,
        rows_invalid: summary.rows_invalid,
        created: rowsCreated,
        status_updated: rowsStatusUpdated,
        email_enqueued: rowsEmailEnqueued,
        skipped_duplicates: rowsSkipDup,
        failed: rowsFailed,
      }, summary.status === "ok" ? 200 : 500);
    }

    return json({ status: "ok", mode, run_id: runId, ...summary });
  } catch (e) {
    await finalize({ status: "failed", error_summary: "unexpected_error" });
    console.error("import-shoptet-orders error:", (e as Error)?.message);
    return json({ status: "error", error: "unexpected_error", run_id: runId }, 500);
  }
});
