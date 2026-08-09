import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { verifyWorkIntakeCandidate, type WorkIntakeCandidate } from "../_shared/salesLeadWorkIntakeVerifier.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;
const MAX_ITEMS = 150;
const WORKERS = 6;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request): Promise<boolean> {
  const configured = Deno.env.get("SALES_LEAD_WORK_INTAKE_SECRET") ?? "";
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  const [a, b] = await Promise.all([sha256(configured), sha256(supplied)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function isCandidate(value: unknown): value is WorkIntakeCandidate {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.website === "string" && v.website.length <= 2048 &&
    typeof v.public_email === "string" && v.public_email.length <= 320 &&
    typeof v.email_source_url === "string" && v.email_source_url.length <= 2048 &&
    Object.keys(v).every((key) => ["website", "public_email", "email_source_url"].includes(key));
}

async function processOne(client: SupabaseClient, runId: string): Promise<boolean> {
  const { data: item, error } = await client.rpc("sales_lead_work_intake_claim", { p_run_id: runId });
  if (error) throw error;
  if (!item) return false;
  try {
    const result = await verifyWorkIntakeCandidate({
      website: item.website,
      public_email: item.public_email,
      email_source_url: item.email_source_url,
    });
    if (!result.ok) {
      const { error: finishError } = await client.rpc("sales_lead_work_intake_finish_item", {
        p_item_id: item.id, p_outcome: "rejected", p_reason: result.reason,
        p_evidence: result.evidence ?? {},
      });
      if (finishError) throw finishError;
      return true;
    }
    const { error: commitError } = await client.rpc("sales_lead_work_intake_commit", {
      p_item_id: item.id, p_website: result.website, p_domain: result.domain,
      p_email: result.email, p_source_url: result.sourceUrl, p_evidence: result.evidence,
    });
    if (commitError) throw commitError;
    return true;
  } catch (processingError) {
    console.error("[work-intake] item failed", { runId, position: item.position, error: String(processingError) });
    await client.rpc("sales_lead_work_intake_finish_item", {
      p_item_id: item.id, p_outcome: "rejected", p_reason: "processing_failed", p_evidence: {},
    });
    return true;
  }
}

async function processRun(client: SupabaseClient, runId: string): Promise<void> {
  const worker = async () => { while (await processOne(client, runId)) { /* drain */ } };
  try {
    await Promise.all(Array.from({ length: WORKERS }, worker));
    await client.rpc("sales_lead_work_intake_refresh", { p_run_id: runId });
  } catch (error) {
    console.error("[work-intake] processing failed", { runId, error: String(error) });
    await client.from("sales_lead_work_intake_runs").update({
      status: "failed", last_error: "processing_failed", completed_at: new Date().toISOString(),
    }).eq("id", runId).in("status", ["pending", "processing"]);
  }
}

async function status(client: SupabaseClient, externalBatchId: string): Promise<Response> {
  const { data: run, error } = await client.from("sales_lead_work_intake_runs")
    .select("id,external_batch_id,schema_version,status,item_count,accepted_count,created_count,skipped_count,rejected_count,submitted_at,started_at,completed_at,last_error")
    .eq("external_batch_id", externalBatchId).maybeSingle();
  if (error) return json({ error: "status_failed" }, 500);
  if (!run) return json({ error: "not_found" }, 404);
  const { data: items, error: itemsError } = await client.from("sales_lead_work_intake_items")
    .select("position,status,reason,lead_id,normalized_website,normalized_domain,normalized_email,normalized_source_url")
    .eq("run_id", run.id).order("position");
  if (itemsError) return json({ error: "status_failed" }, 500);
  return json({ run, items });
}

export async function handleWorkIntake(request: Request): Promise<Response> {
  if (!await authorized(request)) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration" }, 500);
  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (request.method === "GET") {
    const batchId = url.searchParams.get("batch_id")?.trim() ?? "";
    if (batchId.length < 8 || batchId.length > 200) return json({ error: "invalid_batch_id" }, 400);
    return await status(client, batchId);
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const input = body as Record<string, unknown>;
  if (input.schema_version !== 1 || typeof input.external_batch_id !== "string" ||
      input.external_batch_id.trim().length < 8 || input.external_batch_id.trim().length > 200 ||
      !Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_ITEMS ||
      !input.items.every(isCandidate)) {
    return json({ error: "schema_validation_failed" }, 400);
  }
  const canonical = JSON.stringify({ schema_version: 1, items: input.items.map((item) => ({
    website: item.website.trim(), public_email: item.public_email.trim().toLowerCase(),
    email_source_url: item.email_source_url.trim(),
  })) });
  const fingerprint = await sha256(canonical);
  const { data, error } = await client.rpc("sales_lead_work_intake_submit", {
    p_external_batch_id: input.external_batch_id.trim(), p_request_fingerprint: fingerprint,
    p_items: JSON.parse(canonical).items,
  });
  if (error) return json({ error: "submit_failed" }, 500);
  if (!data?.success) return json(data, data?.error === "idempotency_conflict" ? 409 : 400);

  const processing = processRun(client, data.run_id);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(processing);
  else processing.catch(() => undefined);
  return json({ accepted: true, replayed: data.replayed, run_id: data.run_id,
    status_url: `${supabaseUrl}/functions/v1/sales-lead-work-intake?batch_id=${encodeURIComponent(input.external_batch_id.trim())}` }, 202);
}

serve(handleWorkIntake);
