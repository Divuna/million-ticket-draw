import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_SALES_LEAD_ATTACHMENT_BYTES,
  parseSalesLeadEmailAttachments,
} from '../../supabase/functions/_shared/salesLeadEmailAttachments';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const senders = [
  'supabase/functions/send-sales-lead-email/index.ts',
  'supabase/functions/send-sales-lead-reply/index.ts',
  'supabase/functions/send-sales-lead-follow-up/index.ts',
];

test.describe('sales lead e-mail attachments contract', () => {
  test('all senders accept current editor attachments and store metadata only', () => {
    for (const path of senders) {
      const sender = read(path);
      expect(sender).toContain('parseSalesLeadEmailAttachments');
      expect(sender).toContain('emailPayload.attachments = attachmentResult.attachments');
      expect(sender).toContain('attachments: attachmentResult.metadata');
      expect(sender).not.toContain('body_snapshot: renderedBody');
    }
  });

  test('attachment validation rejects unsafe or too large files', () => {
    const content = Buffer.from('hello').toString('base64');
    expect(parseSalesLeadEmailAttachments([
      { filename: 'nabidka.pdf', content, content_type: 'application/pdf', size: 5 },
      { filename: 'cenik.txt', content, content_type: 'text/plain', size: 5 },
    ])).toMatchObject({ ok: true });
    expect(parseSalesLeadEmailAttachments([
      { filename: 'install.cmd', content, content_type: 'application/octet-stream', size: 5 },
    ])).toEqual({ ok: false, error: 'unsupported_attachment_type' });
    expect(parseSalesLeadEmailAttachments([
      { filename: 'too-large.pdf', content, content_type: 'application/pdf', size: MAX_SALES_LEAD_ATTACHMENT_BYTES + 1 },
    ])).toEqual({ ok: false, error: 'attachments_too_large' });
  });

  test('draft attachment persistence is prepared as private storage only', () => {
    const migration = read('supabase/migrations/20260717093313_sales_lead_email_draft_attachments_storage.sql');
    expect(migration).toContain("VALUES ('sales-lead-email-draft-attachments'");
    expect(migration).toContain('public, file_size_limit');
    expect(migration).toContain('public = false');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.sales_lead_email_draft_attachments');
    expect(migration).toContain("public.has_admin_permission('sales_leads.manage', auth.uid())");
    expect(migration).not.toContain('getPublicUrl');
  });
});
