import { expect, test } from "@playwright/test";
import fs from "fs";

const migrationPath = "supabase/migrations/20260811185022_sales_lead_magin_supply_agent.sql";
const resultsMigrationPath = "supabase/migrations/20260813080753_sales_lead_magin_supply_results_scope_fix.sql";
const adapterPath = "supabase/functions/sales-lead-magin-supply-agent/index.ts";
const configPath = "supabase/config.toml";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

test.describe("Magin lead supply adapter contract", () => {
  test("adds only narrow service-role database wrappers", () => {
    const migration = read(migrationPath);
    const resultsMigration = read(resultsMigrationPath);

    expect(migration).toContain("sales_lead_magin_approve_backend_verified_proposals");
    expect(migration).toContain("sales_lead_magin_create_e_shopy_discovery_job");
    expect(resultsMigration).toContain("sales_lead_magin_get_discovery_job_results");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[], uuid) TO service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer, uuid) TO service_role");
    expect(resultsMigration).toContain("GRANT EXECUTE ON FUNCTION public.sales_lead_magin_get_discovery_job_results(uuid[], uuid) TO service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[], uuid) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer, uuid) FROM PUBLIC, anon, authenticated");
    expect(resultsMigration).toContain("REVOKE ALL ON FUNCTION public.sales_lead_magin_get_discovery_job_results(uuid[], uuid) FROM PUBLIC, anon, authenticated");

    expect(`${migration}\n${resultsMigration}`).not.toMatch(/GRANT\s+EXECUTE[\s\S]+TO\s+authenticated/i);
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sales_lead_approve_proposed/i);
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sales_lead_discovery_job_create/i);
    expect(resultsMigration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sales_lead_approve_proposed/i);
    expect(resultsMigration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sales_lead_discovery_job_create/i);
  });

  test("approval wrapper pre-checks Magin scope and delegates approval to the existing RPC", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("v_lead.status IS DISTINCT FROM 'navrzeny'");
    expect(migration).toContain("email_verified_by_admin");
    expect(migration).toContain("backend_verified_official_website");
    expect(migration).toContain("v_lead.email_verified_at IS NULL");
    expect(migration).toContain("v_lead.email_source !~* '^https?://'");
    expect(migration).toContain("public.sales_lead_approve_proposed(");
    expect(migration).toContain("p_actor_user_id");
    expect(migration).toContain("set_config('request.jwt.claim.sub', p_actor_user_id::text, true)");

    expect(migration).not.toMatch(/UPDATE\s+public\.sales_leads/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_status_history/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_activities/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.sales_leads[\s\S]*contact_email\s*=/i);
    expect(migration).not.toMatch(/public\.sales_lead_set_status\s*\(/i);
    expect(migration).not.toMatch(/public\.sales_lead_update_fields\s*\(/i);
  });

  test("discovery wrapper delegates e-shopy job creation to the existing RPC", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("public.sales_lead_discovery_job_create('e-shopy', v_requested_count)");
    expect(migration).toContain("'e-shopy'");
    expect(migration).toContain("least(greatest(coalesce(p_requested_count, 5), 1), 25)");
    expect(migration).toContain("set_config('request.jwt.claim.sub', p_actor_user_id::text, true)");

    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_discovery_jobs/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.sales_lead_discovery_jobs/i);
    expect(migration).not.toMatch(/companyCandidateSearch|companyEmailCrawler|OPENAI|web_search/i);
  });

  test("results wrapper is read-only and returns only Magin e-shopy discovery results", () => {
    const migration = read(resultsMigrationPath);

    expect(migration).toContain("public.sales_lead_magin_get_discovery_job_results");
    expect(migration).toContain("j.created_by = p_actor_user_id");
    expect(migration).toContain("j.lead_group = 'e-shopy'");
    expect(migration).toContain("l.discovery_meta->>'job_id'");
    expect(migration).toContain("'lead_group', lead_group");
    expect(migration).toContain("'source', source");
    expect(migration).toContain("'backend_verified_lead_ids'");
    expect(migration).toContain("'eligible_lead_ids'");
    expect(migration).toContain("backend_verified_official_website");
    expect(migration).toContain("(status = 'navrzeny' AND backend_verified) AS approval_eligible");

    expect(migration).not.toMatch(/UPDATE\s+public\./i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(migration).not.toMatch(/public\.sales_lead_approve_proposed\s*\(/i);
    expect(migration).not.toMatch(/public\.sales_lead_discovery_job_create\s*\(/i);
    expect(migration).not.toMatch(/sales-lead-daily-batch-agent|process-sales-lead-email-batch|Resend|email_queue/i);
  });

  test("edge function is secret-gated and exposes only the adapter actions", () => {
    const adapter = read(adapterPath);

    expect(adapter).toContain("SALES_LEAD_MAGIN_SUPPLY_AGENT_SECRET");
    expect(adapter).toContain("SALES_LEAD_MAGIN_SUPPLY_APPROVER_USER_ID");
    expect(adapter).toContain("SECRET_MIN_LENGTH = 32");
    expect(adapter).toContain("MAX_DISCOVERY_JOB_IDS = 50");
    expect(adapter).toContain("approve_backend_verified_proposals");
    expect(adapter).toContain("create_e_shopy_discovery_job");
    expect(adapter).toContain("get_e_shopy_discovery_job_results");
    expect(adapter).toContain("sales_lead_magin_approve_backend_verified_proposals");
    expect(adapter).toContain("sales_lead_magin_create_e_shopy_discovery_job");
    expect(adapter).toContain("sales_lead_magin_get_discovery_job_results");
    expect(adapter).toContain("parseDiscoveryJobIds");

    expect(adapter).not.toContain("SALES_LEAD_BATCH_AGENT_SECRET");
    expect(adapter).not.toContain("SALES_LEAD_BATCH_WORKER_SECRET");
    expect(adapter).not.toMatch(/Resend|companyCandidateSearch|companyEmailCrawler|web_search/i);
  });

  test("registers only the new adapter function without touching existing batch/discovery functions", () => {
    const config = read(configPath);

    expect(config).toContain("[functions.process-sales-lead-email-batch]");
    expect(config).toContain("[functions.sales-lead-discover]");
    expect(config).toContain("[functions.sales-lead-magin-supply-agent]");
    expect(config).toMatch(/\[functions\.sales-lead-magin-supply-agent\]\s+verify_jwt\s*=\s*false/);
  });
});
