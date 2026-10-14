import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  markdownLinksToVisibleText,
  renderSalesLeadEmailHtml,
  renderSalesLeadEmailText,
} from '../../supabase/functions/_shared/salesLeadEmailRendering.ts';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('73 — sales lead outgoing e-mail rendering', () => {
  test('renders links, emphasis, lists and emoji in both MIME alternatives', () => {
    const body = [
      'Dobrý den,',
      '',
      '**Hlavní výhoda spolupráce** ✨',
      '*Krátké vysvětlení*',
      '- první bod',
      '- druhý bod',
      'Web: [www.onemil.cz](https://www.onemil.cz)',
    ].join('\n');

    expect(renderSalesLeadEmailText(body)).toBe([
      'Dobrý den,',
      '',
      'Hlavní výhoda spolupráce ✨',
      'Krátké vysvětlení',
      '• první bod',
      '• druhý bod',
      'Web: www.onemil.cz',
    ].join('\n'));

    const html = renderSalesLeadEmailHtml(body);
    expect(html).toContain('<strong>Hlavní výhoda spolupráce</strong> ✨');
    expect(html).toContain('<em>Krátké vysvětlení</em>');
    expect(html).toContain('<ul');
    expect(html).toContain('<li style="margin:0 0 5px 0">první bod</li>');
    expect(html).toContain('href="https://www.onemil.cz"');
    expect(html).toContain('>www.onemil.cz</a>');
  });

  test('escapes raw HTML and does not make unsupported links clickable', () => {
    const html = renderSalesLeadEmailHtml('<script>alert(1)</script>\n[Kliknout](javascript:alert(1))');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('href="javascript:');
  });

  test('keeps the original visible-link helper behaviour', () => {
    const body = 'Napište na [b2b@onemil.cz](mailto:b2b@onemil.cz).';
    expect(markdownLinksToVisibleText(body)).toBe('Napište na b2b@onemil.cz.');
  });

  test('does not rewrite plain e-mail addresses, phones, websites, or add content', () => {
    const body = 'b2b@onemil.cz\n+420 777 123 456\nhttps://www.onemil.cz\nBez podpisu.';
    expect(renderSalesLeadEmailText(body)).toBe(body);
  });

  test('all three senders render both MIME alternatives and keep original history snapshots', () => {
    for (const path of [
      'supabase/functions/send-sales-lead-email/index.ts',
      'supabase/functions/send-sales-lead-reply/index.ts',
      'supabase/functions/send-sales-lead-follow-up/index.ts',
    ]) {
      const sender = read(path);
      expect(sender).toContain('renderSalesLeadEmailText');
      expect(sender).toContain('renderSalesLeadEmailHtml');
      expect(sender).toMatch(/text:\s*renderedText/);
      expect(sender).toMatch(/html:\s*renderedHtml/);
    }

    expect(read('supabase/functions/send-sales-lead-email/index.ts')).toContain('body_snapshot: textBody');
    expect(read('supabase/functions/send-sales-lead-reply/index.ts')).toContain('body_snapshot: body');
    expect(read('supabase/functions/send-sales-lead-follow-up/index.ts')).toMatch(/body_snapshot:\s*body/);
  });

  test('template manager exposes formatting controls and a safe preview', () => {
    const manager = read('src/components/admin/sales-leads/SalesLeadEmailTemplateManager.tsx');
    const editor = read('src/components/admin/sales-leads/SalesLeadRichTextEditor.tsx');
    expect(manager).toContain('SalesLeadRichTextEditor');
    expect(editor).toContain('renderSalesLeadEmailHtml');
    expect(editor).toContain('Tučně');
    expect(editor).toContain('Kurzíva');
    expect(editor).toContain('Odrážky');
    expect(editor).toContain('Náhled výsledného e-mailu');
  });
});
