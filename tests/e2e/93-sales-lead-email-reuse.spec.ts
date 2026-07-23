import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
const sender = read('supabase/functions/send-sales-lead-email/index.ts');

test.describe('sales lead sent e-mail reuse contract', () => {
  test('Odeslat znovu opens an editable form prefilled from the original message', () => {
    expect(detail).toContain('Odeslat znovu');
    expect(detail).toContain("onReuse(activity, 'resend')");
    expect(detail).toContain("setReuseRecipient(mode === 'forward' ? '' : originalRecipient)");
    expect(detail).toContain("setReuseSubject(activity.subject ?? '')");
    expect(detail).toContain("setReuseBody(activity.body_snapshot ?? '')");
    expect(detail).toContain('onRecipientChange={setReuseRecipient}');
    expect(detail).toContain('onSubjectChange={setReuseSubject}');
    expect(detail).toContain('onBodyChange={setReuseBody}');
  });

  test('Přeposlat na jiný e-mail starts with an empty editable recipient and never sends on open', () => {
    expect(detail).toContain('Přeposlat na jiný e-mail');
    expect(detail).toContain("onReuse(activity, 'forward')");
    expect(detail).toContain("setReuseRecipient(mode === 'forward' ? '' : originalRecipient)");
    const startReuse = detail.slice(detail.indexOf('const startReuse ='), detail.indexOf('const sendReusedEmail ='));
    expect(startReuse).not.toContain("functions.invoke('send-sales-lead-email'");
    expect(detail).toContain('Nic se neodešle automaticky.');
  });

  test('manual submit uses the existing guarded sender and links a new history row to the source', () => {
    expect(detail).toContain("functions.invoke('send-sales-lead-email'");
    expect(detail).toContain('reuse_source_activity_id: reuseActivity.id');
    expect(detail).toContain('reuse_mode: reuseMode');
    expect(sender).toContain('.eq("id", reuseSourceActivityId)');
    expect(sender).toContain('.eq("activity_type", "email_sent")');
    expect(sender).toContain('.eq("direction", "outbound")');
    expect(sender).toContain('reused_from_activity_id: reuseSource?.id ?? null');
    expect(sender).toContain('reuse_mode: reuseMode');
    expect(sender).toContain('original_recipient:');
    expect(sender).toContain('.from("sales_lead_activities").insert');
  });

  test('permissions, Nekontaktovat, suppression and duplicate guards remain server-side', () => {
    const doNotContact = sender.indexOf('if (lead.do_not_contact === true)');
    const providerSend = sender.indexOf('resend.emails.send');
    expect(sender).toContain('has_admin_permission');
    expect(sender).toContain('sales_leads.manage');
    expect(doNotContact).toBeGreaterThan(0);
    expect(doNotContact).toBeLessThan(providerSend);
    expect(sender).toContain('.from("sales_lead_email_suppression")');
    expect(sender).toContain('sales_lead_email_send_guard');
  });

  test('forwarding does not update the lead contact or mutate the original activity', () => {
    expect(sender).not.toContain('.from("sales_leads").update');
    expect(sender).not.toContain('.from("sales_lead_activities").update');
    expect(sender).toContain('const recipient = isReuse');
    expect(sender).toContain('typeof body.recipient === "string"');
    expect(detail).toContain('Hlavní kontakt leadu se změnou příjemce neupraví.');
  });
});
