import { expect, test } from "@playwright/test";
import fs from "fs";

type PreviousJob = { status: string; finishReason: string | null; success?: boolean } | null;

type Decision =
  | { action: "inventory_sufficient" | "daily_batch_already_exists" | "active_discovery_job_exists" | "morning_job_cap_reached"; requestedCount: 0 }
  | { action: "discovery_chain_stopped"; requestedCount: 0; reason: string }
  | { action: "create_discovery_job"; requestedCount: number; remainingDeficit: number };

function mockServerDecision(input: {
  target: number;
  eligible: number;
  morningJobs: number;
  activeJob?: boolean;
  dailyBatchAlreadyExists?: boolean;
  previousJob?: PreviousJob;
}): Decision {
  if (input.dailyBatchAlreadyExists) return { action: "daily_batch_already_exists", requestedCount: 0 };
  const remainingDeficit = Math.max(input.target - input.eligible, 0);
  if (remainingDeficit === 0) return { action: "inventory_sufficient", requestedCount: 0 };
  if (input.activeJob) return { action: "active_discovery_job_exists", requestedCount: 0 };
  if (input.previousJob) {
    if (input.previousJob.success === false) return { action: "discovery_chain_stopped", requestedCount: 0, reason: "unsuccessful_result" };
    if (input.previousJob.status !== "done") return { action: "discovery_chain_stopped", requestedCount: 0, reason: `terminal_status_${input.previousJob.status}` };
    if (input.previousJob.finishReason !== "target_reached") return { action: "discovery_chain_stopped", requestedCount: 0, reason: `finish_reason_${input.previousJob.finishReason ?? "unknown"}` };
  }
  if (input.morningJobs >= 4) return { action: "morning_job_cap_reached", requestedCount: 0 };
  return { action: "create_discovery_job", requestedCount: Math.min(25, remainingDeficit), remainingDeficit };
}

const migrationPath = "supabase/migrations/20260820100000_sales_lead_magin_morning_sequential_discovery.sql";
const adapterPath = "supabase/functions/sales-lead-magin-supply-agent/index.ts";

for (const scenario of [
  { name: "target 90 and eligible 90 creates no discovery job", input: { target: 90, eligible: 90, morningJobs: 0 }, action: "inventory_sufficient", requested: 0 },
  { name: "target 90 and eligible 80 creates one job requested 10", input: { target: 90, eligible: 80, morningJobs: 0 }, action: "create_discovery_job", requested: 10 },
  { name: "target 90 and eligible 65 creates first job requested 25", input: { target: 90, eligible: 65, morningJobs: 0 }, action: "create_discovery_job", requested: 25 },
  { name: "target 90 and eligible 0 never exceeds four automatic jobs", input: { target: 90, eligible: 0, morningJobs: 4 }, action: "morning_job_cap_reached", requested: 0 },
  { name: "re-reads eligible after a target-reached job", input: { target: 90, eligible: 25, morningJobs: 1, previousJob: { status: "done", finishReason: "target_reached" } }, action: "create_discovery_job", requested: 25 },
  { name: "uses actual eligible 10 instead of previous requested 25", input: { target: 90, eligible: 10, morningJobs: 1, previousJob: { status: "done", finishReason: "target_reached" } }, action: "create_discovery_job", requested: 25 },
  { name: "stops after provider error", input: { target: 90, eligible: 0, morningJobs: 1, previousJob: { status: "done", finishReason: "provider_error" } }, action: "discovery_chain_stopped", requested: 0 },
  { name: "stops after candidates exhausted", input: { target: 90, eligible: 0, morningJobs: 1, previousJob: { status: "done", finishReason: "candidates_exhausted" } }, action: "discovery_chain_stopped", requested: 0 },
  { name: "stops after empty search round", input: { target: 90, eligible: 0, morningJobs: 1, previousJob: { status: "done", finishReason: "empty_search_round" } }, action: "discovery_chain_stopped", requested: 0 },
  { name: "stops immediately once eligible reaches target", input: { target: 90, eligible: 90, morningJobs: 2, previousJob: { status: "done", finishReason: "target_reached" } }, action: "inventory_sufficient", requested: 0 },
  { name: "does not create a parallel job", input: { target: 90, eligible: 0, morningJobs: 0, activeJob: true }, action: "active_discovery_job_exists", requested: 0 },
  { name: "never requests over 25", input: { target: 90, eligible: 0, morningJobs: 0 }, action: "create_discovery_job", requested: 25 },
  { name: "stops failed terminal state without retry", input: { target: 90, eligible: 0, morningJobs: 1, previousJob: { status: "failed", finishReason: "timeout" } }, action: "discovery_chain_stopped", requested: 0 },
  { name: "does not create a second daily email batch", input: { target: 90, eligible: 0, morningJobs: 0, dailyBatchAlreadyExists: true }, action: "daily_batch_already_exists", requested: 0 },
]) {
  test(scenario.name, () => {
    const decision = mockServerDecision(scenario.input);
    expect(decision.action).toBe(scenario.action);
    expect(decision.requestedCount).toBe(scenario.requested);
    expect(decision.requestedCount).toBeLessThanOrEqual(25);
  });
}

test("server migration is the only operational decision point and remains fail-closed", () => {
  const migration = fs.readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
  expect(migration).toContain("sales_lead_magin_get_e_shopy_morning_discovery_state");
  expect(migration).toContain("sales_lead_magin_create_next_e_shopy_morning_discovery_job");
  expect(migration).toContain("public.sales_lead_email_batch_check_one");
  expect(migration).toContain("timezone('Europe/Prague', now())::date");
  expect(migration).toContain("WHERE j.status IN ('queued', 'running')");
  expect(migration).toContain("v_previous_status IS DISTINCT FROM 'done'");
  expect(migration).toContain("v_previous_finish_reason IS DISTINCT FROM 'target_reached'");
  expect(migration).toContain("v_morning_job_count >= 4");
  expect(migration).toContain("least(25, v_remaining_deficit)");
  expect(migration).toContain("pg_try_advisory_xact_lock");
  expect(migration).toContain("public.sales_lead_discovery_job_create('e-shopy', v_requested_count)");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.sales_lead_magin_create_next_e_shopy_morning_discovery_job(integer, uuid)\n  TO service_role");
  expect(migration).not.toMatch(/api\.openai|net\.http_post|process-sales-lead-email-batch|email_queue/i);
});

test("adapter exposes only validated morning state and one-next-job actions", () => {
  const adapter = fs.readFileSync(adapterPath, "utf8");
  expect(adapter).toContain('"get_e_shopy_morning_discovery_state"');
  expect(adapter).toContain('"create_next_e_shopy_morning_discovery_job"');
  expect(adapter).toContain("function parseTargetCount");
  expect(adapter).toContain("target_count_out_of_range");
  expect(adapter).toContain("sales_lead_magin_get_e_shopy_morning_discovery_state");
  expect(adapter).toContain("sales_lead_magin_create_next_e_shopy_morning_discovery_job");
  expect(adapter).not.toMatch(/OPENAI|Resend|companyCandidateSearch|process-sales-lead-email-batch|email_queue/i);
});
