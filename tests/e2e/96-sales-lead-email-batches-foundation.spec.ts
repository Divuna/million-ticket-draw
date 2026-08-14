import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260804165418_sales_lead_email_batches_foundation.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const executableSql = migration.replace(/--.*$/gm, '');

const functionBody = (name: string) => {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const end = migration.indexOf('\n$$;', start);
  expect(end, `${name} has a terminated body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
};

test.describe('sales lead email batch database foundation', () => {
  test('is passive, disabled by default, and isolated from all sending paths', () => {
    expect(migration).toContain("VALUES (true, false)");
    expect(migration).toContain("IF NOT v_settings.enabled THEN");
    expect(executableSql).not.toMatch(/\bnet\.(?:http|https?)\b/i);
    expect(executableSql).not.toMatch(/\bcron\./i);
    expect(executableSql).not.toMatch(/\bresend\b/i);
    expect(executableSql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.email_queue/i);
    expect(executableSql).not.toMatch(/send-sales-lead-(?:email|reply|follow-up)/i);
    expect(executableSql).not.toMatch(/insert\s+into\s+public\.sales_lead_email_batches[\s\S]*select\s+.*sales_leads/i);
  });

  test('creates the settings, batch, and frozen item tables with strict states', () => {
    for (const table of [
      'sales_lead_email_automation_settings',
      'sales_lead_email_batches',
      'sales_lead_email_batch_items',
      'sales_lead_email_batch_skips',
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`);
    }
    for (const snapshot of [
      'recipient_snapshot', 'email_source_snapshot', 'email_verification_method_snapshot',
      'email_verified_at_snapshot', 'subject_snapshot', 'body_source_snapshot',
      'body_text_snapshot', 'body_html_snapshot', 'template_id_snapshot',
      'template_updated_at_snapshot', 'company_name_snapshot',
    ]) expect(migration).toContain(snapshot);
    expect(migration).toContain("status IN ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')");
  });

  test('allows read only to sales-lead managers and blocks direct client writes', () => {
    expect(migration.match(/FOR SELECT TO authenticated/g)).toHaveLength(4);
    expect(migration.match(/has_admin_permission\('sales_leads\.manage'/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).not.toMatch(/CREATE POLICY .*_(?:insert|update|delete)/i);
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE .* TO authenticated/i);
    expect(migration).toContain('access_denied_superadmin_only');
  });

  test('has guarded preview, atomic create, cancellation, and kill-switch RPCs', () => {
    const preview = functionBody('sales_lead_email_batch_preview');
    const create = functionBody('sales_lead_email_batch_create');
    const cancel = functionBody('sales_lead_email_batch_cancel');
    const toggle = functionBody('sales_lead_email_automation_set_enabled');
    for (const body of [preview, create, cancel]) {
      expect(body).toContain("has_admin_permission('sales_leads.manage', v_caller)");
      expect(body).toContain("SET search_path = ''");
    }
    expect(toggle).toContain('public.is_superadmin(v_caller)');
    expect(create).toContain('FOR UPDATE');
    expect(create).toContain('pg_advisory_xact_lock');
    expect(create).toContain('idempotent_replay');
    expect(create).toContain('request_fingerprint');
    expect(create).toContain('idempotency_key_conflict');
    expect(cancel).toContain("WHERE batch_id = p_batch_id AND status = 'pending'");
    expect(cancel).toContain("status = 'processing'");
    expect(cancel).toContain("'batch_processing'");
    expect(cancel).not.toMatch(/DELETE\s+FROM/i);
  });

  test('deduplicates input and enforces lead, recipient, idempotency, and daily maximums', () => {
    expect(migration).toContain('SELECT DISTINCT x FROM unnest(p_lead_ids)');
    expect(migration).toContain('sales_lead_email_batch_items_active_lead_unique');
    expect(migration).toContain('sales_lead_email_batch_items_active_recipient_unique');
    expect(migration).toContain('lower(btrim(recipient_snapshot))');
    expect(migration).toContain('sales_lead_email_batches_idempotency_unique');
    expect(migration).toContain("WHERE status IN ('pending', 'processing', 'sent', 'failed')");
    expect(migration).toContain('daily_limit smallint NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 20)');
    expect(migration).toContain("'daily_limit_exceeded'");
    expect(migration).toContain("'duplicate_recipient_in_selection'");
    expect(migration).toContain('sales_lead_email_batch_skips');
    expect(migration).toContain('GET DIAGNOSTICS v_inserted_skips = ROW_COUNT');
  });

  test('uses a real remaining-day window and never creates catch-up slots', () => {
    const schedule = functionBody('sales_lead_email_batch_schedule_window');
    const preview = functionBody('sales_lead_email_batch_preview');
    const create = functionBody('sales_lead_email_batch_create');
    expect(schedule).toContain("v_local_now + interval '5 minutes'");
    expect(schedule).toContain("'scheduling_window_closed'");
    expect(schedule).toContain("p_item_count * interval '5 minutes'");
    expect(preview).toContain('sales_lead_email_batch_schedule_window');
    expect(preview).toContain("'window_start'");
    expect(preview).toContain("'window_end'");
    expect(create).toContain('sales_lead_email_batch_schedule_window');
    expect(create).toContain('v_index * v_window_seconds / v_count');
  });

  test('rechecks every current first-email eligibility barrier', () => {
    const check = functionBody('sales_lead_email_batch_check_one');
    for (const expected of [
      "status NOT IN ('novy', 'priprava', 'schvaleni_ceka')",
      'do_not_contact',
      'existing_partner',
      'invalid_contact_email',
      'email_not_verified',
      'email_source_missing',
      'email_source_too_long',
      'sales_lead_email_suppression',
      'initial_email_already_sent',
      'sales_lead_email_send_guard',
      'already_in_active_batch',
      'template_not_found',
      'template_inactive',
      'template_not_initial',
      'unresolved_template_variables',
      'invalid_subject',
      'invalid_body',
    ]) expect(check).toContain(expected);
    expect(check).toContain("email_verification_method NOT IN ('admin_manual', 'backend_verified_official_website')");
  });

  test('freezes rendered source, plain text, and safe HTML at creation time', () => {
    const create = functionBody('sales_lead_email_batch_create');
    expect(create).toContain('v_result->>\'body_source\'');
    expect(create).toContain('v_result->>\'body_text\'');
    expect(create).toContain('v_result->>\'body_html\'');
    expect(create).toContain('v_result->>\'template_updated_at\'');
    expect(migration).toContain("'&', '&amp;'");
    expect(migration).toContain("'<', '&lt;'");
    expect(migration).toContain('noopener noreferrer nofollow');
    expect(migration).toContain('<strong>');
    expect(migration).toContain('<em>');
    expect(migration).toContain('sales_lead_email_batch_item_preserve_snapshot');
    expect(migration).toContain('sales_lead_email_batch_snapshot_immutable');
  });

  test('cannot create sent items and migration creates no batch rows', () => {
    const create = functionBody('sales_lead_email_batch_create');
    expect(create).toMatch(/v_batch_id,\s*\(v_result->>'lead_id'\)::uuid,\s*'pending'/);
    expect(create).not.toMatch(/VALUES\s*\([^)]*'sent'/i);
    expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_email_batch_items\s*\([^)]*\)\s*SELECT/i);
  });
});
