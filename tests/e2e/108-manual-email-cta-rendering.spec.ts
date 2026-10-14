import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  buildResponseCtaBlock,
  buildResponseCtaUrls,
  composeInitialEmailBodies,
} from '../../supabase/functions/_shared/salesLeadResponseCta';
import {
  renderSalesLeadEmailHtml,
  renderSalesLeadEmailText,
} from '../../supabase/functions/_shared/salesLeadEmailRendering';

// Normalizace CRLF — git na Windows soubory vytahuje s CRLF.
const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const manualSender = read('supabase/functions/send-sales-lead-email/index.ts');
const followUpSender = read('supabase/functions/send-sales-lead-follow-up/index.ts');
const batchTrigger = read('supabase/migrations/20260806113000_sales_lead_response_public_page.sql');

const PROJECT = 'xkzhjldrojjlrkezorey';
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const HUMAN_BODY = 'Dobrý den,\n\nobracíme se na vás s nabídkou spolupráce.\n\nTým OneMil';

/**
 * Přesně to, co dělá ruční odesílací cesta v `send-sales-lead-email`:
 * vyrenderuje text člověka a AŽ POTOM připojí CTA. Volá se skutečná sdílená
 * funkce i skutečné renderery — ne jejich kopie.
 */
const runManualPipeline = (token: string) =>
  composeInitialEmailBodies(
    HUMAN_BODY,
    buildResponseCtaBlock(buildResponseCtaUrls(PROJECT, token)),
    renderSalesLeadEmailText,
    renderSalesLeadEmailHtml,
  );

test.describe('108 — ruční první e-mail: skutečný výstup renderovací pipeline', () => {
  test('1) textový výstup obsahuje URL u „Mám zájem“', () => {
    const { text } = runManualPipeline(TOKEN_A);
    const { interestUrl } = buildResponseCtaUrls(PROJECT, TOKEN_A);
    expect(text).toContain(`Mám zájem: ${interestUrl}`);
    expect(text).toContain('https://onemil.cz/partner-response.html');
    // Regrese: dřív renderer markdown zploštil na holý popisek bez URL.
    expect(text).not.toMatch(/\n\s*Mám zájem\s*\n/);
  });

  test('2) textový výstup obsahuje URL u „Nemám zájem“', () => {
    const { text } = runManualPipeline(TOKEN_A);
    const { declineUrl } = buildResponseCtaUrls(PROJECT, TOKEN_A);
    expect(text).toContain(`Nemám zájem: ${declineUrl}`);
    expect(text).not.toMatch(/\n\s*Nemám zájem\s*\n?$/);
  });

  test('3) HTML obsahuje oranžové tlačítko', () => {
    const { html } = runManualPipeline(TOKEN_A);
    expect(html).toContain('background:#f97316');
    expect(html).toContain('border:1px solid #d6d3d1');
  });

  test('4) HTML obsahuje obě CTA jako odkazy na veřejnou stránku', () => {
    const { html } = runManualPipeline(TOKEN_A);
    const { interestUrl, declineUrl } = buildResponseCtaUrls(PROJECT, TOKEN_A);
    expect(html).toContain('>Mám zájem</a>');
    expect(html).toContain('>Nemám zájem</a>');
    expect(html).toContain(interestUrl.replaceAll('&', '&amp;'));
    expect(html).toContain(declineUrl.replaceAll('&', '&amp;'));
    expect(html).toContain('Vyberte prosím:');
  });

  test('5) oba odkazy jednoho e-mailu mají stejný token', () => {
    const { text, html, source } = runManualPipeline(TOKEN_A);
    for (const part of [text, html, source]) {
      expect((part.match(new RegExp(TOKEN_A, 'g')) ?? []).length).toBe(2);
      expect(part).not.toContain(TOKEN_B);
    }
  });

  test('6) jiný příjemce dostane jiný token', () => {
    const a = runManualPipeline(TOKEN_A);
    const b = runManualPipeline(TOKEN_B);
    expect(a.text).not.toBe(b.text);
    expect(a.text).toContain(TOKEN_A);
    expect(b.text).toContain(TOKEN_B);
    expect(a.text).not.toContain(TOKEN_B);
    expect(b.text).not.toContain(TOKEN_A);
  });

  test('7) žádný mailto v žádné verzi', () => {
    const { text, html, source } = runManualPipeline(TOKEN_A);
    for (const part of [text, html, source]) {
      expect(part).not.toContain('mailto:');
      expect(part).not.toContain('Nemám zájem, děkuji');
    }
  });

  test('8) žádný NEKONTAKTOVAT', () => {
    const { text, html, source } = runManualPipeline(TOKEN_A);
    for (const part of [text, html, source]) {
      expect(part).not.toContain('NEKONTAKTOVAT');
    }
  });

  test('9) snapshot uložený do historie odpovídá odesílanému obsahu', () => {
    const composed = runManualPipeline(TOKEN_A);
    // EF posílá provideru renderedText/renderedHtml a ukládá composed.source/text/html.
    expect(manualSender).toContain('const renderedText = composed.text');
    expect(manualSender).toContain('const renderedHtml = composed.html');
    expect(manualSender).toContain('bodySource: composed.source');
    expect(manualSender).toContain('bodyText: renderedText');
    expect(manualSender).toContain('bodyHtml: renderedHtml');
    // Text i HTML nesou stejné odkazy jako markdown zdroj.
    const { interestUrl, declineUrl } = buildResponseCtaUrls(PROJECT, TOKEN_A);
    expect(composed.source).toContain(interestUrl);
    expect(composed.source).toContain(declineUrl);
    expect(composed.text).toContain(interestUrl);
    expect(composed.html).toContain(interestUrl.replaceAll('&', '&amp;'));
    // Text člověka zůstal zachovaný ve všech třech verzích.
    expect(composed.source).toContain('nabídkou spolupráce');
    expect(composed.text).toContain('nabídkou spolupráce');
    expect(composed.html).toContain('nabídkou spolupráce');
  });

  test('10) follow-up (a reuse) zůstává bez CTA', () => {
    // cta === null → tělo projde beze změny, jen vyrenderované.
    const none = composeInitialEmailBodies(
      HUMAN_BODY, null, renderSalesLeadEmailText, renderSalesLeadEmailHtml,
    );
    expect(none.source).toBe(HUMAN_BODY);
    expect(none.text).toBe(renderSalesLeadEmailText(HUMAN_BODY));
    expect(none.html).toBe(renderSalesLeadEmailHtml(HUMAN_BODY));
    expect(none.text).not.toContain('Mám zájem');
    expect(none.html).not.toContain('background:#f97316');
    // Follow-up nemá vlastní CTA ani odhlašovací mechanismus.
    expect(followUpSender).not.toContain('buildResponseCtaBlock');
    expect(followUpSender).not.toContain('composeInitialEmailBodies');
    expect(followUpSender).not.toContain('NEKONTAKTOVAT');
    // CTA se v ruční cestě staví jen mimo reuse/forward.
    expect(manualSender).toMatch(/let cta: ResponseCtaBlock \| null = null;\s*\n\s*if \(!isReuse\) \{/);
  });

  test('ruční výstup je funkčně shodný s dávkovým', () => {
    const { text, html } = runManualPipeline(TOKEN_A);
    // Dávkový trigger skládá plaintext jako „Mám zájem: <URL>“ a HTML tlačítka.
    expect(batchTrigger).toContain("E'\\n\\nMám zájem: ' || v_interest_url");
    expect(batchTrigger).toContain("E'\\nNemám zájem: ' || v_decline_url");
    expect(text).toMatch(/Mám zájem: https:\/\/onemil\.cz\/partner-response\.html\?/);
    expect(text).toMatch(/Nemám zájem: https:\/\/onemil\.cz\/partner-response\.html\?/);
    expect(batchTrigger).toContain('background:#f97316');
    expect(html).toContain('background:#f97316');
  });

  test('CTA se nikdy nepouští přes obecný renderer', () => {
    // Renderer dostane výhradně text člověka.
    expect(manualSender).toContain('composeInitialEmailBodies(\n      textBody,\n      cta,');
    expect(manualSender).not.toContain('renderSalesLeadEmailText(ctaBody)');
    expect(manualSender).not.toContain('renderSalesLeadEmailHtml(ctaBody)');
    expect(manualSender).not.toContain('ctaBody');
    // Důkaz proč: renderer markdown odkaz zplošťuje a URL zahazuje.
    expect(renderSalesLeadEmailText('[Mám zájem](https://example.test/x)')).toBe('Mám zájem');
  });
});
