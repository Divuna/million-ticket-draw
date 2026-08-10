import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const worker = read('supabase/functions/sales-lead-discover/index.ts');
const automatic = read('supabase/functions/_shared/automaticSalesFlow.ts');
const search = read('supabase/functions/_shared/companyBatchSearch.ts');
const migration = read('supabase/migrations/20260810094826_automatic_daily_sales_flow.sql');

test.describe('automatic daily sales flow', () => {
  test('automatic and manual discovery use deliberately separate paths', () => {
    expect(worker).toContain('if (autoCreated)');
    expect(worker).toContain('runAutomaticSalesFlow');
    expect(worker).toContain('aresByIco');
    expect(worker).toContain('async function classify(');
    expect(automatic).not.toMatch(/aresBy|chat\/completions|classif/i);
    expect(automatic).toContain('job.lead_group !== "e-shopy"');
    expect(worker).toContain('JOB_LEASE_MS');
    expect(worker).toContain('.eq("updated_at", previousUpdatedAt)');
  });

  test('one structured batch search feeds only the existing Work intake', () => {
    expect(search).toContain('api.openai.com/v1/responses');
    expect(search).toContain('type: "web_search"');
    expect(search).not.toContain('web_search_preview');
    expect(search).toContain('gpt-5.4-nano');
    expect(search).toContain('type: "json_schema"');
    expect(search).toContain('max_tool_calls: 4');
    expect(automatic).toContain('/functions/v1/sales-lead-work-intake');
    expect(automatic).toContain('schema_version: 1');
    expect(automatic).not.toMatch(/sales_lead_propose|from\("sales_leads"\)\.insert/);
  });

  test('existing inventory is checked before only the deficit is searched', () => {
    expect(automatic).toContain('sales_lead_email_batch_check_one');
    expect(automatic).toContain('const deficit = remaining - eligible.length');
    expect(automatic).toContain('requestedCount: Math.min(30, deficit');
    expect(automatic).toContain('excludedDomains');
    expect(automatic).toContain('intake_counted');
    expect(automatic).toContain('["done", "failed"].includes(run.status)');
  });

  test('diagnostics retain request, usage, tool-call, outcomes and cost data', () => {
    for (const value of ['response_id', 'input_tokens', 'output_tokens', 'total_tokens',
      'web_search_call_count', 'candidate_count', 'estimated_cost_usd']) expect(search).toContain(value);
    for (const value of ['created_count', 'skipped_count', 'rejected_count']) expect(automatic).toContain(value);
  });

  test('migration reuses existing objects and implements the exact ramp and cap', () => {
    expect(migration).not.toMatch(/CREATE\s+TABLE|ADD\s+COLUMN/i);
    expect(migration).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(?!run_sales_lead_discovery_scheduler)/i);
    expect(migration).toContain('least(100, 20 * greatest(1, v_today - v_first_automatic_date + 1))');
    expect(migration).toContain("VALUES ('e-shopy', v_daily_limit, least(300, v_daily_limit * 3)");
    expect(migration).toContain('CHECK (daily_limit BETWEEN 1 AND 100)');
    expect(migration).toContain('CHECK (scheduled_count BETWEEN 0 AND 100)');
    expect(migration).toContain("IF v_count > 100 THEN");
  });

  test('automatic batch uses the existing guarded RPC and worker cadence is four minutes', () => {
    expect(automatic).toContain('sales_lead_email_batch_create');
    expect(automatic).toContain('batch.batch_status !== "scheduled"');
    expect(migration).toContain("idempotency_key = 'auto-sales-' || v_today::text");
    expect(migration).toContain("schedule := '*/4 * * * *'");
    expect(migration).toContain("replace(v_definition, 'interval ''5 minutes''', 'interval ''4 minutes''')");
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*?TO service_role;/);
    expect(automatic).not.toMatch(/send-sales-lead-email|process-sales-lead-email-batch|resend/i);
  });
});
