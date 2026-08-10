import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { searchCzechEshopContacts } from "./companyBatchSearch.ts";

type Job = Record<string, unknown>;
type Diagnostic = Record<string, unknown>;
const MAX_SEARCH_ROUNDS = 10;

function pragueDate(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function domainOf(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function asDiagnostics(value: unknown): Diagnostic[] {
  return Array.isArray(value) ? value.filter((item): item is Diagnostic => !!item && typeof item === "object") : [];
}
async function updateJob(client: SupabaseClient, jobId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await client.from("sales_lead_discovery_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw error;
}
async function eligibleLeadIds(client: SupabaseClient, templateId: string, limit: number): Promise<string[]> {
  const { data, error } = await client.from("sales_leads").select("id")
    .in("status", ["novy", "priprava", "schvaleni_ceka"]).not("contact_email", "is", null)
    .eq("do_not_contact", false).order("created_at", { ascending: true }).limit(Math.max(200, limit * 8));
  if (error) throw error;
  const accepted: string[] = [];
  for (let offset = 0; offset < (data ?? []).length && accepted.length < limit; offset += 12) {
    const checked = await Promise.all((data ?? []).slice(offset, offset + 12).map(async ({ id }) => {
      const { data: result, error: checkError } = await client.rpc("sales_lead_email_batch_check_one", { p_lead_id: id, p_template_id: templateId });
      if (checkError) throw checkError;
      return result?.eligible === true ? id as string : null;
    }));
    accepted.push(...checked.filter((id): id is string => id !== null));
  }
  return accepted.slice(0, limit);
}

export async function runAutomaticSalesFlow(input: {
  client: SupabaseClient; job: Job; openaiKey: string; intakeSecret: string; supabaseUrl: string;
}): Promise<Record<string, unknown>> {
  const { client, job } = input;
  const jobId = String(job.id);
  const requested = Number(job.requested_count ?? 20);
  const maxCandidates = Number(job.max_candidates ?? requested * 3);
  let checked = Number(job.candidates_checked ?? 0);
  let created = Number(job.created_count ?? 0);
  let rounds = Number(job.search_rounds ?? 0);
  const pool = Array.isArray(job.candidate_pool) ? job.candidate_pool.map(String) : [];
  const diagnostics = asDiagnostics(job.search_diagnostics);
  const funnel = job.funnel && typeof job.funnel === "object" && !Array.isArray(job.funnel)
    ? { ...(job.funnel as Record<string, unknown>) } : {};

  if (job.lead_group !== "e-shopy") {
    await updateJob(client, jobId, { status: "done", finish_reason: "automatic_group_blocked", finished_at: new Date().toISOString() });
    return { success: false, job_id: jobId, status: "done", finish_reason: "automatic_group_blocked" };
  }
  const { data: settings, error: settingsError } = await client.from("sales_lead_email_automation_settings")
    .select("enabled,daily_limit").eq("singleton", true).single();
  if (settingsError) throw settingsError;
  if (!settings.enabled) {
    await updateJob(client, jobId, { status: "done", finish_reason: "email_automation_disabled", finished_at: new Date().toISOString() });
    return { success: true, job_id: jobId, status: "done", finish_reason: "email_automation_disabled" };
  }
  const { data: template, error: templateError } = await client.from("sales_lead_email_templates")
    .select("id").eq("is_active", true).eq("template_type", "initial").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (templateError) throw templateError;
  if (!template) {
    await updateJob(client, jobId, { status: "done", finish_reason: "active_template_missing", finished_at: new Date().toISOString() });
    return { success: false, job_id: jobId, status: "done", finish_reason: "active_template_missing" };
  }

  // Count each completed intake exactly once, including after cron retries.
  for (const entry of diagnostics) {
    const batchId = typeof entry.intake_external_batch_id === "string" ? entry.intake_external_batch_id : null;
    if (!batchId || entry.intake_counted === true) continue;
    const { data: run, error } = await client.from("sales_lead_work_intake_runs")
      .select("status,created_count,skipped_count,rejected_count").eq("external_batch_id", batchId).maybeSingle();
    if (error) throw error;
    if (!run || !["done", "failed"].includes(run.status)) {
      await updateJob(client, jobId, { search_diagnostics: diagnostics });
      return { success: true, job_id: jobId, status: "running", waiting_for_intake: true };
    }
    entry.intake_counted = true;
    entry.intake_status = run.status;
    entry.created_count = run.created_count;
    entry.skipped_count = run.skipped_count;
    entry.rejected_count = run.rejected_count;
    created += Number(run.created_count ?? 0);
    funnel.intake_created = Number(funnel.intake_created ?? 0) + Number(run.created_count ?? 0);
    funnel.intake_skipped = Number(funnel.intake_skipped ?? 0) + Number(run.skipped_count ?? 0);
    funnel.intake_rejected = Number(funnel.intake_rejected ?? 0) + Number(run.rejected_count ?? 0);
  }

  const today = pragueDate();
  const { count: planned = 0, error: plannedError } = await client.from("sales_lead_email_batch_items")
    .select("id,sales_lead_email_batches!inner(scheduled_date)", { count: "exact", head: true })
    .eq("sales_lead_email_batches.scheduled_date", today).in("status", ["pending", "processing", "sent", "failed"]);
  if (plannedError) throw plannedError;
  const remaining = Math.max(0, Number(settings.daily_limit) - Number(planned ?? 0));
  if (remaining === 0) {
    await updateJob(client, jobId, { status: "done", finish_reason: "daily_limit_already_planned", finished_at: new Date().toISOString(), created_count: created, search_diagnostics: diagnostics, funnel });
    return { success: true, job_id: jobId, status: "done", finish_reason: "daily_limit_already_planned" };
  }
  const eligible = await eligibleLeadIds(client, template.id, remaining);
  if (eligible.length >= remaining) {
    const { data: batch, error } = await client.rpc("sales_lead_email_batch_create", {
      p_lead_ids: eligible.slice(0, remaining), p_template_id: template.id,
      p_scheduled_date: today, p_idempotency_key: `auto-sales-${today}`,
    });
    if (error) throw error;
    if (!batch?.success || batch.batch_status !== "scheduled") throw new Error(`automatic_batch_failed:${batch?.error ?? "not_scheduled"}`);
    funnel.batch_id = batch.batch_id;
    funnel.batch_scheduled_count = batch.scheduled_count;
    await updateJob(client, jobId, { status: "done", finish_reason: "batch_scheduled", finished_at: new Date().toISOString(), created_count: created, search_diagnostics: diagnostics, funnel });
    return { success: true, job_id: jobId, status: "done", finish_reason: "batch_scheduled", batch_id: batch.batch_id, scheduled_count: batch.scheduled_count };
  }
  if (rounds >= MAX_SEARCH_ROUNDS || checked >= maxCandidates) {
    await updateJob(client, jobId, { status: "done", finish_reason: "search_budget_exhausted", finished_at: new Date().toISOString(), candidates_checked: checked, created_count: created, search_diagnostics: diagnostics, funnel });
    return { success: true, job_id: jobId, status: "done", finish_reason: "search_budget_exhausted", deficit: remaining - eligible.length };
  }

  const deficit = remaining - eligible.length;
  const search = await searchCzechEshopContacts({
    openaiKey: input.openaiKey, requestedCount: Math.min(30, deficit, maxCandidates - checked),
    excludedDomains: pool.map(domainOf).filter(Boolean),
  });
  const known = new Set(pool.map(domainOf).filter(Boolean));
  const candidates = search.candidates.filter((candidate) => !known.has(domainOf(candidate.website)));
  checked += candidates.length;
  rounds += 1;
  pool.push(...candidates.map((candidate) => candidate.website));
  const externalBatchId = `auto-discovery:${jobId}:round:${rounds}`;
  const diagnostic: Diagnostic = { mode: "work_intake_batch", round: rounds, ...search.diagnostics, submitted_candidate_count: candidates.length };
  if (candidates.length > 0) {
    const response = await fetch(`${input.supabaseUrl}/functions/v1/sales-lead-work-intake`, {
      method: "POST", headers: { Authorization: `Bearer ${input.intakeSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ schema_version: 1, external_batch_id: externalBatchId, items: candidates }),
    });
    diagnostic.intake_http_status = response.status;
    if (!response.ok) throw new Error(`work_intake_submit_failed:${response.status}`);
    const accepted = await response.json();
    diagnostic.intake_run_id = accepted.run_id;
    diagnostic.intake_external_batch_id = externalBatchId;
    diagnostic.intake_counted = false;
  }
  diagnostics.push(diagnostic);
  await updateJob(client, jobId, {
    status: "running", candidates_checked: checked, created_count: created, candidate_pool: pool,
    cursor: pool.length, search_rounds: rounds, search_exhausted: rounds >= MAX_SEARCH_ROUNDS || checked >= maxCandidates,
    search_diagnostics: diagnostics, funnel,
  });
  return { success: true, job_id: jobId, status: "running", searched: candidates.length, deficit };
}
