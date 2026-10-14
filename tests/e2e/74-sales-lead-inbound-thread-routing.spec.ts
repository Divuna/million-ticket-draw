import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decideInboundRoute,
  extractMessageIds,
  headerValue,
} from '../../supabase/functions/_shared/salesLeadInboundRouting';
import {
  buildReplyHeaders,
  createOutboundCapture,
  extractOutboundCaptureId,
} from '../../supabase/functions/_shared/salesLeadEmailThreading';

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

  test('every outbound email gets a unique hidden capture address', () => {
    const first = createOutboundCapture();
    const second = createOutboundCapture();
    expect(first.address).toMatch(/^sales-lead-capture-[0-9a-f-]{36}@ulduuzoul\.resend\.app$/);
    expect(second.id).not.toBe(first.id);
    expect(extractOutboundCaptureId([first.address])).toBe(first.id);
  });

  test('thread headers preserve the full parent reference chain', () => {
    const headers = buildReplyHeaders(
      '<customer-reply@example.test>',
      ['<sales-lead-first@onemil.cz>'],
    );
    expect(headers).toEqual({
      'In-Reply-To': '<customer-reply@example.test>',
      References: '<sales-lead-first@onemil.cz> <customer-reply@example.test>',
    });
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

  test('hidden outbound capture stores the provider RFC Message-ID without entering the queue', () => {
    expect(inbound).toContain('extractOutboundCaptureId');
    expect(inbound).toContain('outbound_capture: true');
    expect(inbound).toMatch(/rfc_message_id:\s*rfcMessageId/);
    expect(inbound.indexOf('if (outboundCaptureId)')).toBeLessThan(inbound.indexOf('const decision = decideInboundRoute'));
  });

  test('unassigned mailbox is RLS protected and manual assignment preserves lead history', () => {
    expect(migration).toContain('sales_lead_unassigned_emails ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("public.has_admin_permission('sales_leads.manage'");
    expect(migration).toContain("'reply_received', 'inbound'");
    expect(migration).toContain('sales_lead_mark_replied');
  });
});
