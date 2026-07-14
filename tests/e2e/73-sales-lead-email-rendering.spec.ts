import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markdownLinksToVisibleText } from '../../supabase/functions/_shared/salesLeadEmailRendering.ts';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('73 — sales lead outgoing e-mail rendering', () => {
  test('renders Markdown links as their visible text and preserves whitespace', () => {
    const body = [
      'Dobrý den,',
      '',
      'Napište na [b2b@onemil.cz](mailto:b2b@onemil.cz).',
      'Web: [www.onemil.cz](http://www.onemil.cz)',
      '',
      'S pozdravem\nPavel',
    ].join('\n');

    expect(markdownLinksToVisibleText(body)).toBe([
      'Dobrý den,',
      '',
      'Napište na b2b@onemil.cz.',
      'Web: www.onemil.cz',
      '',
      'S pozdravem\nPavel',
    ].join('\n'));
  });

  test('does not rewrite plain e-mail addresses, phones, websites, or add content', () => {
    const body = 'b2b@onemil.cz\n+420 777 123 456\nhttps://www.onemil.cz\nBez podpisu.';
    expect(markdownLinksToVisibleText(body)).toBe(body);
  });

  test('all three senders render both MIME alternatives but keep original history snapshots', () => {
    for (const path of [
      'supabase/functions/send-sales-lead-email/index.ts',
      'supabase/functions/send-sales-lead-reply/index.ts',
      'supabase/functions/send-sales-lead-follow-up/index.ts',
    ]) {
      const sender = read(path);
      expect(sender).toContain('markdownLinksToVisibleText');
      expect(sender).toMatch(/text:\s*renderedBody/);
      expect(sender).toMatch(/(?:escapeHtml|esc)\(renderedBody\)/);
    }

    expect(read('supabase/functions/send-sales-lead-email/index.ts')).toContain('body_snapshot: textBody');
    expect(read('supabase/functions/send-sales-lead-reply/index.ts')).toContain('body_snapshot: body');
    expect(read('supabase/functions/send-sales-lead-follow-up/index.ts')).toContain('body_snapshot:body');
  });
});
