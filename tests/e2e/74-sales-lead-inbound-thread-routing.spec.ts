import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decideInboundRoute,
  extractMessageIds,
  headerValue,
} from '../../supabase/functions/_shared/salesLeadInboundRouting';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const inbound = read('supabase/functions/sales-lead-inbound/index.ts');
const migration = read('supabase/migrations/20260714103353_sales_lead_inbound_thread_routing.sql');

test.describe('74 — safe inbound thread routing', () => {
  test('valid In-Reply-To selects exactly one lead first', () => {
    expect(decideInboundRoute({
      inReplyToLeadIds: ['lead-a'],
      referenceLeadIds: ['lead-b'],
    })).toEqual({ leadId: 'lead-a', method: 'in_reply_to', ambiguous: false });
  });

  test('valid References selects one lead when In-Reply-To has no match', () => {
    expect(decideInboundRoute({ referenceLeadIds: ['lead-b', 'lead-b'] }))
      .toEqual({ leadId: 'lead-b', method: 'references', ambiguous: false });
  });

  test('foreign message without evidence remains unassigned', () => {
    expect(decideInboundRoute({}))
      .toEqual({ leadId: null, method: null, ambiguous: false });
    expect(inbound).toContain('unassigned: true');
  });

  test('ambiguous strongest evidence never falls through to a weaker match', () => {
    expect(decideInboundRoute({
      inReplyToLeadIds: ['lead-a', 'lead-b'],
      providerThreadLeadIds: ['lead-a'],
    })).toEqual({ leadId: null, method: 'in_reply_to', ambiguous: true });
  });

  test('RFC headers are read case-insensitively and message ids are normalized', () => {
    const headers = { 'In-Reply-To': 'message@example.test', REFERENCES: '<first@test> <second@test>' };
    expect(extractMessageIds(headerValue(headers, 'in-reply-to'))).toEqual(['<message@example.test>']);
    expect(extractMessageIds(headerValue(headers, 'references'))).toEqual(['<first@test>', '<second@test>']);
  });

  test('duplicate webhook is guarded before Receiving API and by a global unique index', () => {
    const duplicateCheck = inbound.indexOf('existingActivity');
    const receivingCall = inbound.indexOf('emails.receiving.get(emailId)');
    expect(duplicateCheck).toBeGreaterThan(0);
    expect(receivingCall).toBeGreaterThan(duplicateCheck);
    expect(migration).toContain('uq_sales_lead_activities_inbound_provider_id');
    expect(migration).toContain('resend_email_id     text NOT NULL UNIQUE');
  });

  test('unassigned mailbox is RLS protected and manual assignment preserves lead history', () => {
    expect(migration).toContain('sales_lead_unassigned_emails ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("public.has_admin_permission('sales_leads.manage'");
    expect(migration).toContain("'reply_received', 'inbound'");
    expect(migration).toContain('sales_lead_mark_replied');
  });
});
