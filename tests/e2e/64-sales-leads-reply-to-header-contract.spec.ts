import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const initialSender = read('supabase/functions/send-sales-lead-email/index.ts');
const replySender = read('supabase/functions/send-sales-lead-reply/index.ts');
const followUpSender = read('supabase/functions/send-sales-lead-follow-up/index.ts');
const inbound = read('supabase/functions/sales-lead-inbound/index.ts');

/**
 * Returns the source of the object handed to Resend's `emails.send()`, whether the
 * caller uses an inline literal `emails.send({ ... })` or builds a variable first
 * (`const emailPayload = { ... }; emails.send(emailPayload)`). Deliberately excludes
 * unrelated code such as the DB activity metadata written after the send call — that
 * metadata legitimately records a snake_case `reply_to` value and must not be confused
 * with the Resend SDK payload key. Independent of whitespace and quote style.
 */
function resendPayload(source: string): string {
  const inline = source.match(/emails\.send\(\s*\{([\s\S]*?)\}\s*(?:as\s+never\s*)?\)/);
  if (inline) return inline[1];

  const sent = source.match(/emails\.send\(\s*([A-Za-z_$][\w$]*)/);
  if (sent) {
    const name = sent[1];
    const decl = source.match(
      new RegExp(`(?:const|let|var)\\s+${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`),
    );
    const body = decl ? decl[1] : '';
    const mutations = [...source.matchAll(new RegExp(`\\b${name}\\.[\\w$]+\\s*=([^;]*);`, 'g'))]
      .map((m) => m[0])
      .join('\n');
    return `${body}\n${mutations}`;
  }
  return '';
}

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
    // The first-email sender passes the Reply-To through the REPLY_TO constant.
    expect(initialSender).toMatch(/reply_to\s*:\s*REPLY_TO/);

    // Reply and follow-up must hand Resend the SDK v6 camelCase `replyTo`, never the
    // deprecated snake_case `reply_to`, inside the object passed to emails.send().
    for (const sender of [replySender, followUpSender]) {
      const payload = resendPayload(sender);
      expect(payload).toMatch(/\breplyTo\b/);
      expect(payload).not.toMatch(/\breply_to\b/);
      // Reply-To exposes only the trusted public sales mailbox.
      expect(payload).toMatch(/b2b@onemil\.cz/);
    }
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
