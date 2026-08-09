import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const schedulerMigration = read(
  'supabase/migrations/20260807120000_sales_lead_discovery_scheduler.sql',
);
const discoveryJobsMigration = read(
  'supabase/migrations/20260712120000_sales_lead_discovery_jobs.sql',
);
const autoGroupMigration = read(
  'supabase/migrations/20260810120000_discovery_auto_group_allowlist.sql',
);
const schedulerSql = schedulerMigration.replace(/--.*$/gm, '');
const autoGroupSql = autoGroupMigration.replace(/--.*$/gm, '');

const schedulerFn = schedulerSql.slice(
  schedulerSql.indexOf('CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_scheduler'),
  schedulerSql.indexOf('REVOKE ALL ON FUNCTION public.run_sales_lead_discovery_scheduler'),
);
const manualCreateFn = discoveryJobsMigration.slice(
  discoveryJobsMigration.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_discovery_job_create'),
  discoveryJobsMigration.indexOf('REVOKE ALL ON FUNCTION public.sales_lead_discovery_job_create'),
);
const autoGroupPickerFn = autoGroupSql.slice(
  autoGroupSql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_pick_next_discovery_group'),
  autoGroupSql.indexOf('REVOKE ALL ON FUNCTION public.sales_lead_pick_next_discovery_group'),
);

test.describe('automatic discovery group allowlist', () => {
  test('the automatic scheduler can select only e-shopy', () => {
    expect(autoGroupSql).toContain(
      "SET auto_discovery_enabled = (slug = 'e-shopy' AND is_active)",
    );
    expect(autoGroupPickerFn).toContain('WHERE g.is_active');
    expect(autoGroupPickerFn).toContain('AND g.auto_discovery_enabled');
    expect(autoGroupPickerFn).toContain("AND g.slug <> 'jine'");

    // Fail deployment if the resulting automatic selection is not exactly e-shopy.
    expect(autoGroupSql).toMatch(
      /IF v_enabled <> 1 OR v_pick IS DISTINCT FROM 'e-shopy' THEN\s+RAISE EXCEPTION/,
    );
  });

  test('automatic jobs still request 5 companies with max_candidates 80', () => {
    expect(schedulerFn).toMatch(
      /VALUES \(v_group, 5, 80, 'queued', v_created_by, true\)/,
    );
    expect(schedulerFn).toContain("'requested_count', 5");
    expect(schedulerFn).toContain("'max_candidates', 80");

    // This migration changes only group selection, not the scheduler, cron, or worker.
    expect(autoGroupSql).not.toContain(
      'CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_scheduler',
    );
    expect(autoGroupSql).not.toMatch(/cron\.schedule|cron\.unschedule/);
    expect(autoGroupSql).not.toContain('run_sales_lead_discovery_worker');
  });

  test('manual discovery of another category stays unchanged', () => {
    expect(manualCreateFn).toContain('p_lead_group     text');
    expect(manualCreateFn).toContain('VALUES (btrim(p_lead_group), v_count, auth.uid())');
    expect(manualCreateFn).not.toContain('auto_discovery_enabled');

    expect(autoGroupSql).not.toContain(
      'CREATE OR REPLACE FUNCTION public.sales_lead_discovery_job_create',
    );
    expect(autoGroupSql).not.toContain(
      'REVOKE ALL ON FUNCTION public.sales_lead_discovery_job_create',
    );
  });
});
