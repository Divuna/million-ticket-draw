import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  validateSalesLeadEmailContent,
  validateSalesLeadEmailDraft,
} from '../../src/components/admin/sales-leads/salesLeadEmailTemplates';
import {
  MAX_SALES_LEAD_ATTACHMENT_BYTES,
  parseSalesLeadEmailAttachments,
} from '../../supabase/functions/_shared/salesLeadEmailAttachments';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
const sender = read('supabase/functions/send-sales-lead-email/index.ts');
const draftRpc = read('supabase/migrations/20260703170000_sales_leads_draft_rpc.sql');

test.describe('sales lead initial email direct-send contract', () => {
  test('sends current editor content without a saved draft', () => {
    expect(detail).toContain("body: { lead_id: lead.id, subject: draftSubject, body: draftBody, attachments: draftAttachments }");
    expect(detail).not.toContain('const draftSaved =');
    expect(detail).not.toContain('const draftDirty =');
    expect(sender).toContain('const subject = typeof body.subject === "string" ? body.subject : null;');
    expect(sender).toContain('const textBody = typeof body.body === "string" ? body.body : null;');
    expect(sender).not.toContain('lead.draft_email_subject');
    expect(sender).not.toContain('lead.draft_email_body');
  });

  test('an unsaved editor change is the exact history snapshot', () => {
    expect(sender).toContain('subject,');
    expect(sender).toContain('body_snapshot: textBody');
    expect(sender.indexOf('body_snapshot: textBody')).toBeGreaterThan(sender.indexOf('resend.emails.send'));
    expect(sender).toContain('text: renderedBody');
  });

  test('failed provider send preserves state and editor while success advances workflow', () => {
    const providerFailure = sender.indexOf('if (emailResponse.error)');
    const historyWrite = sender.indexOf('.from("sales_lead_activities").insert');
    const statusSync = sender.indexOf('supabaseAdmin.rpc("sales_lead_mark_emailed"');
    expect(providerFailure).toBeGreaterThan(0);
    expect(historyWrite).toBeGreaterThan(providerFailure);
    expect(statusSync).toBeGreaterThan(historyWrite);
    expect(sender.slice(providerFailure, historyWrite)).toContain('email_send_failed');
    expect(detail).not.toMatch(/catch[\s\S]{0,250}setDraft(?:Subject|Body)\(/);
    expect(sender).toContain('new_status === "osloveno"');
  });

  test('save draft remains optional and supports a genuinely unfinished draft', () => {
    expect(validateSalesLeadEmailDraft('Rozepsaný předmět', '')).toEqual([]);
    expect(validateSalesLeadEmailDraft('', 'Rozepsaný text')).toEqual([]);
    expect(validateSalesLeadEmailDraft('', '')).toContain('Koncept musí obsahovat předmět nebo text e-mailu.');
    expect(validateSalesLeadEmailDraft('Ahoj {{company_name}}', 'Text')[0]).toContain('{{company_name}}');
    expect(validateSalesLeadEmailContent('initial', 'Rozepsaný předmět', '')).toContain('Text e-mailu je povinný.');
    expect(detail).toContain("rpc('sales_lead_save_draft'");
    expect(draftRpc).toContain("'draft_edited', 'internal'");
  });

  test('server preserves every existing first-email guard and blocks repeats', () => {
    expect(sender).toContain('if (lead.status === "navrzeny")');
    expect(sender).toContain('lead.email_verified_by_admin !== true');
    expect(sender).toContain('lead.do_not_contact === true');
    expect(sender).toContain('initial_email_already_sent');
    expect(sender).toContain('.contains("metadata", { sent_by: "human" })');
    expect(sender).toContain('validateEmailContent(subject, textBody)');
    expect(sender).toContain('sales_lead_email_send_guard');
  });

  test('saved draft is reloaded without overwriting dirty editor text', () => {
    expect(detail).toContain('detail.draft_email_subject ??');
    expect(detail).toContain('detail.draft_email_body ??');
    expect(detail).toContain('draftTouchedRef.current');
    expect(detail).toContain('draftComposerLeadIdRef.current');
    expect(detail).toContain('!draftTouchedRef.current');
  });

  test('expanded editor and small editor share the same state', () => {
    expect(detail).toContain('Zvětšit editor');
    expect(detail).toContain('draftExpandedOpen');
    expect(detail).toContain('value={draftSubject}');
    expect(detail).toContain('value={draftBody}');
    expect(detail).toContain('ref={expandedDraftBodyRef}');
    expect(detail).toContain('ref={draftBodyRef}');
  });

  test('attachments are sent, validated, and stored as metadata only', () => {
    expect(detail).toContain('SalesLeadEmailAttachmentsField');
    expect(sender).toContain('parseSalesLeadEmailAttachments(body.attachments)');
    expect(sender).toContain('emailPayload.attachments = attachmentResult.attachments');
    expect(sender).toContain('attachments: attachmentResult.metadata');
    expect(sender).not.toContain('attachments: attachmentResult.attachments,');

    const oneByte = Buffer.from('x').toString('base64');
    expect(parseSalesLeadEmailAttachments([{ filename: 'nabidka.pdf', content: oneByte, content_type: 'application/pdf', size: 1 }])).toMatchObject({ ok: true });
    expect(parseSalesLeadEmailAttachments([{ filename: 'script.exe', content: oneByte, content_type: 'application/octet-stream', size: 1 }])).toEqual({ ok: false, error: 'unsupported_attachment_type' });
    expect(parseSalesLeadEmailAttachments([{ filename: 'big.pdf', content: oneByte, content_type: 'application/pdf', size: MAX_SALES_LEAD_ATTACHMENT_BYTES + 1 }])).toEqual({ ok: false, error: 'attachments_too_large' });
  });
});
