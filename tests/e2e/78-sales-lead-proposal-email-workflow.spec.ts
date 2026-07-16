import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  isInitialEmailStatusAllowed,
  isTransitionAllowed,
} from '../../src/components/admin/sales-leads/salesLeadsShared';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const sender = read('supabase/functions/send-sales-lead-email/index.ts');
const migration = read('supabase/migrations/20260716160634_sales_lead_initial_email_workflow_guard.sql');
const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
const templatePicker = read('src/components/admin/sales-leads/SalesLeadEmailTemplatePicker.tsx');
const adminPage = read('src/pages/AdminSalesLeads.tsx');

test.describe('sales lead proposal and initial-email workflow', () => {
  test('navrzeny cannot send an initial email in UI or Edge Function', () => {
    expect(isInitialEmailStatusAllowed('navrzeny')).toBe(false);
    expect(detail).toContain('initialEmailStatusAllowed');
    expect(detail).toContain('Návrh nejdřív schvalte');
    expect(sender).toContain('if (lead.status === "navrzeny")');
    expect(sender).toContain('proposal_not_approved');
    expect(sender.indexOf('proposal_not_approved')).toBeLessThan(sender.indexOf('new Resend'));
  });

  test('human proposal approval uses existing navrzeny -> novy transition', () => {
    expect(isTransitionAllowed('navrzeny', 'novy', false)).toBe(true);
    expect(isTransitionAllowed('navrzeny', 'priprava', true)).toBe(false);
    expect(detail).toContain("lead.status === 'navrzeny' && t === 'novy' ? 'Schválit návrh'");
    expect(adminPage).toContain("{ id: 'proposed', label: 'Návrhy', statuses: ['navrzeny'] }");
    expect(adminPage).toContain("{ id: 'new', label: 'Nové', statuses: ['novy'] }");
  });

  test('successful initial send must synchronise an early state to osloveno', () => {
    for (const status of ['novy', 'priprava', 'schvaleni_ceka']) {
      expect(isInitialEmailStatusAllowed(status)).toBe(true);
    }
    expect(migration).toContain("v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka')");
    expect(migration).toContain("SET status = 'osloveno'");
    expect(sender).toContain('status_sync_failed_after_send');
    expect(sender).toContain('statusResult.status_changed === true');
    expect(sender).not.toContain('Best-effort propsání stavu');
    expect(sender).toContain('initial_email_already_sent');
    expect(sender).toContain('.contains("metadata", { sent_by: "human" })');
  });

  test('failed Resend response cannot change lead status', () => {
    const sendFailure = sender.indexOf('if (emailResponse.error)');
    const markEmailed = sender.indexOf('supabaseAdmin.rpc("sales_lead_mark_emailed"');
    expect(sendFailure).toBeGreaterThan(0);
    expect(markEmailed).toBeGreaterThan(sendFailure);
    expect(sender.slice(sendFailure, markEmailed)).toContain('email_send_failed');
  });

  test('downstream states are never moved back to proposals or preparation', () => {
    for (const status of ['osloveno', 'follow_up', 'odpovedel', 'jednani', 'konvertovan']) {
      expect(isInitialEmailStatusAllowed(status)).toBe(false);
      expect(migration).toContain(status);
    }
    expect(migration).toContain("'status_changed', false");
    expect(migration).not.toMatch(/SET\s+status\s*=\s*'(navrzeny|priprava)'/i);
  });

  test('detail and templates share the single guarded initial sender; no bulk sender exists', () => {
    expect((detail.match(/send-sales-lead-email/g) ?? []).length).toBeGreaterThan(0);
    expect(templatePicker).not.toContain('send-sales-lead-email');
    expect(adminPage).not.toContain('send-sales-lead-email');
    expect(detail).toContain('Použít šablonu');
  });

  test('Cyklomania remediation is exact, evidence-based and idempotent', () => {
    expect(migration).toContain("d1b4cdff-70a2-4422-8140-fde9b80d0eb8");
    expect(migration).toContain("lower(l.company_name) = 'cyklomania.cz'");
    expect(migration).toContain("activity_type = 'email_sent'");
    expect(migration).toContain("l.status = 'navrzeny'");
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });
});
