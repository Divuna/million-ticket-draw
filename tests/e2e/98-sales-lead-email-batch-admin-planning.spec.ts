import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  SALES_LEAD_EMAIL_BATCH_REASON_MESSAGES,
  SALES_LEAD_EMAIL_BATCH_STATUS_LABELS,
  salesLeadEmailBatchReasonMessage,
} from '../../src/components/admin/sales-leads/salesLeadEmailBatches';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260805160406_sales_lead_email_batch_admin_planning.sql');
const dialog = read('src/components/admin/sales-leads/SalesLeadEmailBatchDialog.tsx');
const batches = read('src/components/admin/sales-leads/SalesLeadEmailBatchesSheet.tsx');
const admin = read('src/pages/AdminSalesLeads.tsx');
const executableSql = migration.replace(/--.*$/gm, '');

test.describe('98 — admin preparation of paused sales-lead e-mail batches', () => {
  test('disabled automation stores paused while enabled preserves scheduled', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_create');
    expect(migration).toContain("v_batch_status := CASE WHEN v_settings.enabled THEN 'scheduled' ELSE 'paused' END");
    expect(migration).not.toContain("'error', 'automation_disabled'");
    expect(migration).toContain("'batch_status', v_batch_status");
    expect(migration).toContain("'automation_enabled', v_settings.enabled");
    expect(migration).toMatch(/v_batch_id,[\s\S]{0,180}\(v_result->>'lead_id'\)::uuid,[\s\S]{0,80}'pending'/);
    expect(migration).toMatch(/UPDATE public\.sales_lead_email_automation_settings[\s\S]+SET enabled = false/);
    expect(migration).not.toMatch(/UPDATE\s+public\.sales_lead_email_batches[\s\S]{0,200}status\s*=\s*'scheduled'/i);
  });

  test('database change is passive and cannot send or schedule work', () => {
    expect(executableSql).not.toMatch(/\bcron\./i);
    expect(executableSql).not.toMatch(/\bnet\.(?:http|https?)\b/i);
    expect(executableSql).not.toMatch(/\bresend\b/i);
    expect(executableSql).not.toMatch(/email_queue/i);
    expect(executableSql).not.toMatch(/send-sales-lead-(?:email|reply|follow-up)/i);
    expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_activities/i);
    expect(migration).toContain('A database row never sends email or calls a provider.');
  });

  test('selection action is conditional, counted, capped, and keeps bulk delete', () => {
    expect(admin).toContain("selectedIds.size > 0");
    expect(admin).toContain('Připravit e-mailovou dávku ({selectedIds.size})');
    expect(admin).toContain('if (selectedIds.size > 100)');
    expect(admin).toContain('sl-bulk-delete-btn');
    expect(admin).toContain('SalesLeadEmailBatchDialog');
    expect(admin).toContain('SalesLeadEmailBatchesSheet');
  });

  test('dialog loads only active initial templates and uses server preview', () => {
    expect(dialog).toContain(".eq('is_active', true)");
    expect(dialog).toContain(".eq('template_type', 'initial')");
    expect(dialog).toContain(".rpc('sales_lead_email_batch_preview'");
    expect(dialog).toContain('eligible_count');
    expect(dialog).toContain('ineligible_count');
    expect(dialog).toContain('daily_remaining');
    expect(dialog).toContain('formatBatchWindow');
    expect(dialog).toContain('email_verification_method');
    expect(dialog).toContain('email_verified_at');
    expect(dialog).toContain('body_text || item.body_source');
    expect(dialog).not.toContain('dangerouslySetInnerHTML');
    expect(dialog).toContain('isSafeHttpsUrl(item.email_source)');
  });

  test('every required server reason has a Czech message', () => {
    const reasons = [
      'template_not_found', 'template_inactive', 'template_not_initial', 'lead_not_found',
      'initial_email_status_not_allowed', 'do_not_contact', 'existing_partner',
      'invalid_contact_email', 'email_not_verified', 'email_source_missing',
      'email_source_too_long', 'suppressed', 'initial_email_already_sent',
      'duplicate_override_required', 'duplicate_guard_failed', 'already_in_active_batch',
      'unresolved_template_variables', 'invalid_subject', 'invalid_body',
      'duplicate_recipient_in_selection', 'daily_limit_exceeded', 'scheduling_window_closed',
      'invalid_scheduled_date', 'no_eligible_leads', 'concurrent_enrollment_conflict',
      'idempotency_key_conflict',
    ];
    for (const reason of reasons) {
      expect(SALES_LEAD_EMAIL_BATCH_REASON_MESSAGES[reason], reason).toBeTruthy();
      expect(salesLeadEmailBatchReasonMessage(reason)).not.toContain(`Důvod: ${reason}`);
    }
  });

  test('human confirmation is explicit and uses one stable idempotency key', () => {
    expect(dialog).toContain('Připravit dávku ({eligibleCount})');
    expect(dialog).toContain('Dávka bude uložena jako pozastavená. Nyní se neodešle žádný e-mail.');
    expect(dialog).toContain('const idempotencyKeyRef = useRef(crypto.randomUUID())');
    expect(dialog).toContain('p_idempotency_key: idempotencyKeyRef.current');
    expect(dialog.match(/idempotencyKeyRef\.current = crypto\.randomUUID\(\)/g)).toHaveLength(1);
    expect(dialog).toContain('Dávka byla připravena. Žádný e-mail nebyl odeslán.');
    expect(admin).toContain('setSelectedIds(new Set())');
  });

  test('migration adds a wrapper that can only ever store a paused batch', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_prepare_paused');
    expect(migration).toMatch(/FROM public\.sales_lead_email_automation_settings\s+WHERE singleton\s+FOR UPDATE;\s+IF NOT FOUND OR v_settings\.enabled IS DISTINCT FROM false THEN/);
    expect(migration).toContain("'error', 'automation_must_be_disabled'");
    expect(migration).toContain('v_result := public.sales_lead_email_batch_create(');
    expect(migration).toContain("(v_result->>'batch_status') IS DISTINCT FROM 'paused'");
    expect(migration).toContain("(v_result->>'automation_enabled')::boolean IS DISTINCT FROM false");
    expect(migration).toContain('sales_lead_email_batch_prepare_paused_rejected');
    expect(migration).toContain("'error', 'unexpected_batch_state'");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sales_lead_email_batch_prepare_paused\(uuid\[\],uuid,date,text\)\s+FROM PUBLIC, anon;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sales_lead_email_batch_prepare_paused\(uuid\[\],uuid,date,text\)\s+TO authenticated;/);
    // The wrapper must reuse the audited RPC instead of its own insert path.
    expect(migration.slice(migration.indexOf('sales_lead_email_batch_prepare_paused')))
      .not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_email_batch/i);
  });

  test('dialog calls only the prepare-paused RPC and accepts only paused plus disabled', () => {
    expect(dialog).toContain(".rpc('sales_lead_email_batch_prepare_paused'");
    expect(dialog).not.toContain(".rpc('sales_lead_email_batch_create'");
    expect(dialog).not.toContain('expectedStatus');
    expect(dialog).not.toMatch(/automation_enabled === true \? 'scheduled' : 'paused'/);
    expect(dialog).toContain("const automationSafelyDisabled = preview?.automation_enabled === false;");
    expect(dialog).toContain('const canPrepare = Boolean(preview?.success) && automationSafelyDisabled && eligibleCount > 0;');
    expect(dialog).toContain('disabled={!canPrepare || previewLoading || creating}');
    expect(dialog).toContain('if (!canPrepare || creating) return;');
    expect(dialog).toContain("if (result.batch_status !== 'paused' || result.automation_enabled !== false) {");
    expect(dialog).toContain("salesLeadEmailBatchReasonMessage('unexpected_batch_state')");
    expect(dialog).toContain("salesLeadEmailBatchReasonMessage('automation_must_be_disabled')");
    // A rejected outcome must never clear the selection or close the dialog.
    expect(dialog).toMatch(/toast\.error\(salesLeadEmailBatchReasonMessage\('unexpected_batch_state'\)\);\s+return;\s+}/);
    expect(dialog).toMatch(/toast\.success\([\s\S]{0,200}?\);\s+setConfirmationOpen\(false\);\s+await onCreated\(result\);\s+onOpenChange\(false\);/);
  });

  test('blocked automation has an exact Czech message', () => {
    expect(SALES_LEAD_EMAIL_BATCH_REASON_MESSAGES.automation_must_be_disabled)
      .toBe('Automatické odesílání není bezpečně vypnuté. Dávku nyní nelze připravit.');
    expect(SALES_LEAD_EMAIL_BATCH_REASON_MESSAGES.unexpected_batch_state).toBeTruthy();
    expect(salesLeadEmailBatchReasonMessage('unexpected_batch_state'))
      .not.toContain('Důvod: unexpected_batch_state');
  });

  test('batch overview shows items, skip audit, paused warning, and guarded cancellation', () => {
    expect(batches).toContain(".from('sales_lead_email_batches')");
    expect(batches).toContain('.limit(20)');
    expect(batches).toContain(".from('sales_lead_email_batch_items')");
    expect(batches).toContain(".from('sales_lead_email_batch_skips')");
    expect(SALES_LEAD_EMAIL_BATCH_STATUS_LABELS.paused).toBe('Pozastavená — nic se neodesílá');
    expect(batches).toContain("(['paused', 'scheduled'] as const)");
    expect(batches).toContain(".rpc('sales_lead_email_batch_cancel'");
    expect(batches).toContain('cancelReason.trim().length < 3');
    expect(batches).toContain('cancelReason.trim().length > 1000');
    expect(batches).toContain('Zrušením se všechny čekající položky vyřadí. Žádný e-mail se neodešle.');
  });

  test('UI contains no sender/provider path and remains responsive', () => {
    const ui = `${dialog}\n${batches}\n${admin}`;
    const newBatchUi = `${dialog}\n${batches}`;
    expect(ui).not.toMatch(/functions\.invoke\(['"]send-sales-lead-/);
    expect(newBatchUi).not.toMatch(/\bresend\b/i);
    expect(newBatchUi).not.toMatch(/email_queue/i);
    expect(dialog).toContain('max-h-[92vh]');
    expect(dialog).toContain('overflow-y-auto');
    expect(batches).toContain('w-full overflow-y-auto sm:max-w-3xl');
    expect(batches).not.toMatch(/>\s*(Spustit|Obnovit|Odeslat|Zapnout automatiku)\s*</i);
  });
});
