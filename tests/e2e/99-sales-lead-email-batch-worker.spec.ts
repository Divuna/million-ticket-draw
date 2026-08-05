import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260806090000_sales_lead_email_batch_worker.sql');
const executableSql = migration.replace(/--.*$/gm, '');
const worker = read('supabase/functions/process-sales-lead-email-batch/index.ts');
const workerCode = worker.replace(/\/\/.*$/gm, '');
const workerAuth = read('supabase/functions/_shared/salesLeadBatchWorkerAuth.ts');
const workerRun = read('supabase/functions/_shared/salesLeadBatchWorkerRun.ts');
const workerRunCode = workerRun.replace(/\/\/.*$/gm, '');
const delivery = read('supabase/functions/_shared/salesLeadInitialEmailDelivery.ts');
const sender = read('supabase/functions/_shared/salesLeadInitialEmailSender.ts');
const manualSender = read('supabase/functions/send-sales-lead-email/index.ts');
const config = read('supabase/config.toml');
const adminPage = read('src/pages/AdminSalesLeads.tsx');
const batchesSheet = read('src/components/admin/sales-leads/SalesLeadEmailBatchesSheet.tsx');
const batchDialog = read('src/components/admin/sales-leads/SalesLeadEmailBatchDialog.tsx');

test.describe('99 — internal worker for prepared sales-lead e-mail batches', () => {
  test('the worker migration creates no cron, no network call, and no queue write', () => {
    expect(executableSql).not.toMatch(/cron\.schedule/i);
    expect(executableSql).not.toMatch(/\bpg_cron\b/i);
    expect(executableSql).not.toMatch(/\bpg_net\b/i);
    expect(executableSql).not.toMatch(/\bnet\.http/i);
    expect(executableSql).not.toMatch(/email_queue/i);
    expect(executableSql).not.toMatch(/\bresend\b/i);
    expect(executableSql).not.toMatch(/functions\/v1\//i);
    // Automation must still be off after the migration is applied.
    expect(migration).toMatch(/UPDATE public\.sales_lead_email_automation_settings[\s\S]+SET enabled = false/);
  });

  test('claiming is service-role only, kill-switch first, and single item', () => {
    expect(migration).toContain('CREATE FUNCTION public.sales_lead_email_batch_claim_next()');
    expect(migration).toMatch(/FROM public\.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;\s+IF NOT FOUND OR v_settings\.enabled IS DISTINCT FROM true THEN/);
    expect(migration).toContain("'action', 'noop', 'reason', 'automation_disabled'");
    expect(migration).toContain('FOR UPDATE OF i SKIP LOCKED');
    expect(migration.match(/FOR UPDATE OF i SKIP LOCKED/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration.match(/LIMIT 1;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("b.status = 'scheduled'");
    expect(migration).not.toMatch(/i\.status\s*=\s*'pending'[\s\S]{0,200}b\.status\s*=\s*'paused'/);
    expect(migration).toContain("'skipped', skip_reason = 'scheduled_window_missed'");
    for (const signature of [
      'public.sales_lead_email_batch_claim_next()',
      'public.sales_lead_email_batch_activate(uuid)',
      'public.sales_lead_email_batch_item_record_failure(uuid,text,text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
      expect(migration).not.toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
    }
  });

  test('activation is guarded and never rewrites prepared work', () => {
    expect(migration).toContain('CREATE FUNCTION public.sales_lead_email_batch_activate(p_batch_id uuid)');
    expect(migration).toContain("'error', 'automation_must_be_enabled'");
    expect(migration).toContain("IF v_batch.status <> 'paused' THEN");
    expect(migration).toContain("'error', 'scheduled_window_missed'");
    // Activation only flips the batch header.
    const activation = migration.slice(
      migration.indexOf('CREATE FUNCTION public.sales_lead_email_batch_activate'),
      migration.indexOf('CREATE FUNCTION public.sales_lead_email_batch_claim_next'),
    );
    expect(activation).not.toMatch(/UPDATE public\.sales_lead_email_batch_items/i);
    expect(activation).not.toMatch(/INSERT INTO/i);
  });

  test('batch delivery reuses the audited delivery layer with exact snapshots', () => {
    expect(migration).toContain("IF p_mode = 'batch_initial' THEN");
    expect(migration).toContain("'error', 'batch_snapshot_mismatch'");
    expect(migration).toContain("'error', 'batch_item_not_processing'");
    expect(migration).toContain("'error', 'batch_not_scheduled'");
    expect(migration).toContain("'error', 'batch_attachments_not_allowed'");
    // The locked lead is re-checked completely before any delivery row exists.
    const leadLockIndex = migration.indexOf('SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE');
    const lastBarrier = migration.slice(
      leadLockIndex,
      migration.indexOf('SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries', leadLockIndex),
    );
    expect(lastBarrier).toContain("'error', 'batch_performer_mismatch'");
    expect(lastBarrier).toContain('v_lead.converted_partner_id IS NOT NULL');
    expect(lastBarrier).toContain('SELECT 1 FROM public.partners p WHERE p.ico = v_lead.ico');
    expect(lastBarrier).toContain("NOT IN ('admin_manual', 'backend_verified_official_website')");
    expect(lastBarrier).toContain('v_lead.email_verified_at IS NULL');
    expect(lastBarrier).toContain("'error', 'email_source_missing'");
    expect(lastBarrier).toContain('length(btrim(v_lead.email_source)) > 2048');
    expect(migration).toContain("'sent_by', CASE WHEN v_delivery.mode = 'batch_initial' THEN 'system' ELSE 'human' END");
    expect(migration).toContain("'delivery_mode', v_delivery.mode");
    expect(migration).toContain("'batch_item_id', v_delivery.batch_item_id");
    // Exactly one email_sent activity path stays in place.
    expect(migration.match(/INSERT INTO public\.sales_lead_activities/g)).toHaveLength(1);
    expect(migration).toContain('ON CONFLICT (email_delivery_id)');
    expect(migration).toContain('public.sales_lead_initial_email_already_recorded');
  });

  test('the worker Edge Function is internal, fail-closed, and single-shot', () => {
    expect(worker).toContain('SALES_LEAD_BATCH_WORKER_SECRET');
    expect(worker).toContain('authorizeSalesLeadBatchWorkerRequest');
    expect(worker).toContain('runSalesLeadEmailBatchWorker');
    expect(workerRun).toContain('sales_lead_email_batch_claim_next');
    expect(workerRun).toContain('sales_lead_email_batch_item_record_failure');
    expect(worker).toContain('SALES_LEAD_INITIAL_EMAIL_FROM');
    expect(worker).toContain('SALES_LEAD_INITIAL_EMAIL_REPLY_TO');
    expect(workerRun).toContain('deliverSalesLeadInitialEmail');
    expect(workerRun).toContain('mode: "batch_initial"');
    // Exactly one delivery attempt per request, no loop over items.
    expect(workerRun.match(/deliverSalesLeadInitialEmail\(/g)).toHaveLength(1);
    expect(workerRunCode).not.toMatch(/\b(for|while)\s*\(/);
    expect(worker).not.toMatch(/\b(for|while)\s*\(/);
    expect(worker).not.toMatch(/auth\.getUser|user_roles|has_admin_permission/);
    expect(workerRunCode).not.toMatch(/auth\.getUser|user_roles|has_admin_permission/);
    expect(workerRunCode).not.toMatch(/email_queue|cron/i);
    // A commit_only claim carries identifiers only: it must never build a
    // provider payload, and it must never record a failure.
    expect(workerRun).toMatch(/if \(claim\.action === "commit_only"\)[\s\S]{0,900}sales_lead_initial_email_commit/);
    const commitOnlyBlock = workerRun.slice(
      workerRun.indexOf('if (claim.action === "commit_only")'),
      workerRun.indexOf('if (claim.action !== "send"'),
    );
    expect(commitOnlyBlock).toContain('p_delivery_id: deliveryId');
    expect(commitOnlyBlock).toContain('batch_claim_incomplete');
    expect(commitOnlyBlock).not.toMatch(/deliverSalesLeadInitialEmail|record_failure|newOutboundCaptureId|deps\.provider/);
    expect(workerCode).not.toMatch(/email_queue/i);
    expect(workerCode).not.toMatch(/cron/i);
    expect(workerCode).not.toMatch(/sales_lead_email_batch_create|sales_lead_email_batch_prepare_paused|sales_lead_discover/);
    expect(workerAuth).toContain('SALES_LEAD_BATCH_WORKER_SECRET_MIN_LENGTH = 32');
    expect(workerAuth).toContain("status: 500, error: \"worker_secret_not_configured\"");
    expect(workerAuth).toContain("status: 401, error: \"unauthorized\"");
    expect(config).toContain('[functions.process-sales-lead-email-batch]');
  });

  test('the manual sender keeps its behaviour and shares one sender identity', () => {
    expect(sender).toContain('"Miroslav | OneMil <b2b@onemil.cz>"');
    expect(manualSender).toContain('const FROM_ADDRESS = SALES_LEAD_INITIAL_EMAIL_FROM;');
    expect(manualSender).toContain('const REPLY_TO = SALES_LEAD_INITIAL_EMAIL_REPLY_TO;');
    expect(manualSender).toContain('createResendInitialEmailProvider(resend)');
    expect(manualSender).toContain('deliverSalesLeadInitialEmail');
    // The manual path stays human-triggered and JWT-gated.
    expect(manualSender).toContain("has_admin_permission");
    expect(manualSender).not.toContain('SALES_LEAD_BATCH_WORKER_SECRET');
    expect(manualSender).not.toContain('batch_initial');
    // Manual identity is only extended, never redefined.
    expect(delivery).toContain('if (mode === "batch_initial") fingerprintInput.batch_item_id = batchItemId;');
    expect(delivery).toContain('`sales-lead-initial:v1:${input.leadId}:${requestFingerprint}`');
  });

  test('PR 4 adds no admin trigger, no automation switch, and no lead discovery', () => {
    const ui = `${adminPage}\n${batchesSheet}\n${batchDialog}`;
    expect(ui).not.toContain('process-sales-lead-email-batch');
    expect(ui).not.toContain('sales_lead_email_batch_claim_next');
    expect(ui).not.toContain('sales_lead_email_batch_activate');
    expect(ui).not.toContain('sales_lead_email_automation_settings');
    expect(ui).not.toMatch(/>\s*(Spustit|Obnovit|Zapnout automatiku|Odeslat dávku)\s*</i);
    expect(batchDialog).toContain(".rpc('sales_lead_email_batch_prepare_paused'");
  });
});
