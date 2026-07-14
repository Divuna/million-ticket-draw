import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const initialSender = read('supabase/functions/send-sales-lead-email/index.ts');
const replySender = read('supabase/functions/send-sales-lead-reply/index.ts');
const followUpSender = read('supabase/functions/send-sales-lead-follow-up/index.ts');
const inbound = read('supabase/functions/sales-lead-inbound/index.ts');

test.describe('64 — sales leads public Reply-To contract', () => {
  for (const [name, source] of [
    ['first email', initialSender],
    ['reply', replySender],
    ['follow-up', followUpSender],
  ] as const) {
    test(`${name} exposes only the trusted sales mailbox`, () => {
      expect(source).toContain('OneMil obchodní tým <b2b@onemil.cz>');
      expect(source).not.toMatch(/reply\+\$?\{?(?:leadId|lead\.id)/);
      expect(source).not.toContain('@ulduuzoul.resend.app');
    });
  }

  test('SDK-specific Reply-To property remains correct', () => {
    expect(initialSender).toContain('reply_to: REPLY_TO');
    expect(replySender).toMatch(/emails\.send\(\{[\s\S]*replyTo[\s\S]*\}\)/);
    expect(replySender).not.toMatch(/emails\.send\(\{[^}]*\breply_to:/);
    expect(followUpSender).toContain('replyTo,subject');
  });

  test('all senders use an invisible capture id separately from the provider id', () => {
    for (const source of [initialSender, replySender, followUpSender]) {
      expect(source).toContain('createOutboundCapture');
      expect(source).toMatch(/bcc\s*:\s*\[?outboundCapture\.address/);
      expect(source).toMatch(/outbound_capture_id\s*:\s*outboundCapture\.id/);
      expect(source).not.toMatch(/["']Message-ID["']\s*:/);
    }
  });

  test('inbound never derives a lead from recipient, sender, or subject', () => {
    expect(inbound).not.toContain('extractLeadId');
    expect(inbound).not.toMatch(/reply\+\(\[0-9a-f\]/);
    expect(inbound).toContain('decideInboundRoute');
    expect(inbound).toContain('in-reply-to');
    expect(inbound).toContain('references');
  });
});
