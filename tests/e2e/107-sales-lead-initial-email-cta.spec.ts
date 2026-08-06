import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  PREVIEW_RESPONSE_TOKEN,
  RESPONSE_PUBLIC_PAGE,
  buildResponseCtaBlock,
  buildResponseCtaUrls,
  isValidResponseToken,
  responseProjectRefFromUrl,
} from '../../supabase/functions/_shared/salesLeadResponseCta';

// Normalizace CRLF — git na Windows soubory vytahuje s CRLF.
const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const ctaModule = read('supabase/functions/_shared/salesLeadResponseCta.ts');
const manualSender = read('supabase/functions/send-sales-lead-email/index.ts');
const batchTrigger = read('supabase/migrations/20260806113000_sales_lead_response_public_page.sql');
const manualTokenMigration = read('supabase/migrations/20260806180000_sales_lead_manual_response_token.sql');
const manualTokenSql = manualTokenMigration.replace(/--.*$/gm, '');
const editor = read('src/components/admin/sales-leads/SalesLeadRichTextEditor.tsx');
const templateManager = read('src/components/admin/sales-leads/SalesLeadEmailTemplateManager.tsx');

const PROJECT = 'xkzhjldrojjlrkezorey';
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

/** Tělo e-mailu tak, jak vznikne po přidání CTA bloku. */
const composedSource = (body: string, token: string) =>
  `${body}${buildResponseCtaBlock(buildResponseCtaUrls(PROJECT, token)).source}`;

test.describe('107 — CTA prvního obchodního e-mailu', () => {
  test('1) nový dávkový e-mail obsahuje „Mám zájem“', () => {
    // Dávková cesta skládá CTA v DB triggeru před uzamčením snapshotu.
    expect(batchTrigger).toContain("'\\n\\n[Mám zájem](' || v_interest_url || ')'");
    expect(batchTrigger).toContain("E'\\n\\nMám zájem: ' || v_interest_url");
    expect(batchTrigger).toContain('>Mám zájem</a>');
    expect(batchTrigger).toContain('NEW.body_source_snapshot := NEW.body_source_snapshot');
  });

  test('2) nový dávkový e-mail obsahuje „Nemám zájem“', () => {
    expect(batchTrigger).toContain("'\\n\\n[Nemám zájem](' || v_decline_url || ')'");
    expect(batchTrigger).toContain("E'\\nNemám zájem: ' || v_decline_url");
    expect(batchTrigger).toContain('>Nemám zájem</a>');
  });

  test('3) nikde se negeneruje starý mailto odkaz „Nemám zájem, děkuji“', () => {
    // Starou větu negeneruje žádná odesílací cesta ani náhled.
    for (const source of [ctaModule, manualSender, batchTrigger, manualTokenMigration, editor]) {
      expect(source).not.toContain('Nemám zájem, děkuji');
    }
    // CTA blok nikdy nepoužije mailto ani odpověď na b2b@onemil.cz.
    // (b2b@onemil.cz zůstává legitimně jako odesílatel/reply-to e-mailu.)
    const block = buildResponseCtaBlock(buildResponseCtaUrls(PROJECT, TOKEN_A));
    for (const part of [block.source, block.text, block.html]) {
      expect(part).not.toContain('mailto:');
      expect(part).not.toContain('b2b@onemil.cz');
    }
    // Trigger dávky také skládá jen https odkazy na veřejnou stránku.
    expect(batchTrigger).toContain("v_public_page constant text := 'https://onemil.cz/partner-response.html'");
    expect(batchTrigger).not.toContain('mailto:');
  });

  test('4) obě CTA používají stejný bezpečný token a veřejnou stránku', () => {
    const { interestUrl, declineUrl } = buildResponseCtaUrls(PROJECT, TOKEN_A);
    expect(interestUrl).toContain(RESPONSE_PUBLIC_PAGE);
    expect(declineUrl).toContain(RESPONSE_PUBLIC_PAGE);
    expect(interestUrl).toContain(`token=${TOKEN_A}`);
    expect(declineUrl).toContain(`token=${TOKEN_A}`);
    expect(interestUrl).toContain('action=interest');
    expect(declineUrl).toContain('action=decline');
    expect(isValidResponseToken(TOKEN_A)).toBe(true);
    expect(isValidResponseToken('nope')).toBe(false);
    // Jen povolené projekty.
    expect(responseProjectRefFromUrl(`https://${PROJECT}.supabase.co`)).toBe(PROJECT);
    expect(responseProjectRefFromUrl('https://evil.example.com')).toBeNull();
  });

  test('5) každý příjemce má jiný token', () => {
    const a = buildResponseCtaBlock(buildResponseCtaUrls(PROJECT, TOKEN_A));
    const b = buildResponseCtaBlock(buildResponseCtaUrls(PROJECT, TOKEN_B));
    expect(a.source).not.toBe(b.source);
    expect(a.source).toContain(TOKEN_A);
    expect(b.source).toContain(TOKEN_B);
    expect(a.source).not.toContain(TOKEN_B);
    // Token se razí per odeslání, uvnitř smyčky proti kolizi.
    expect(manualTokenSql).toContain('gen_random_uuid()');
    expect(manualTokenSql).toContain("encode(extensions.digest(v_token, 'sha256'), 'hex')");
    expect(manualSender).toContain('sales_lead_issue_manual_response_token');
  });

  test('6) preview odpovídá uloženému snapshotu', () => {
    // Ruční cesta renderuje TĚLO VČETNĚ CTA a stejné tělo ukládá do snapshotu.
    expect(manualSender).toContain('const renderedText = renderSalesLeadEmailText(ctaBody)');
    expect(manualSender).toContain('const renderedHtml = renderSalesLeadEmailHtml(ctaBody)');
    expect(manualSender).toContain('bodySource: ctaBody');
    // Náhled používá tentýž builder jako odesílací cesta.
    expect(editor).toContain('buildResponseCtaBlock');
    expect(editor).toContain('sales-lead-email-preview-cta');
    expect(templateManager).toContain("showResponseCta={form.template_type === 'initial'}");
    // Preview token je neaktivní zástupný, ne skutečný.
    expect(PREVIEW_RESPONSE_TOKEN).toBe('0'.repeat(64));
  });

  test('7) ruční první e-mail používá stejné CTA jako dávka', () => {
    // Markup v TS builderu musí být 1:1 s DB triggerem.
    const block = buildResponseCtaBlock(buildResponseCtaUrls(PROJECT, TOKEN_A));
    expect(block.source.startsWith('\n\n**Vyberte prosím:**')).toBe(true);
    expect(batchTrigger).toContain("E'\\n\\n**Vyberte prosím:**'");
    expect(block.html).toContain('background:#f97316');
    expect(batchTrigger).toContain('background:#f97316');
    expect(block.html).toContain('border:1px solid #d6d3d1');
    expect(batchTrigger).toContain('border:1px solid #d6d3d1');
    expect(block.html).toContain('Vyberte prosím:');
    // CTA se přidává jen k prvnímu e-mailu, ne k reuse/forward.
    expect(manualSender).toMatch(/let ctaBody = textBody;\s*\n\s*if \(!isReuse\) \{/);
  });

  test('8) existující uzamčený snapshot se nezmění', () => {
    // Trigger dávky zapisuje jen do NEW.* (BEFORE INSERT) — žádný UPDATE.
    expect(batchTrigger).not.toMatch(/UPDATE public\.sales_lead_email_batch_items/i);
    // Nová migrace nesahá na položky dávek ani na hotové snapshoty.
    expect(manualTokenSql).not.toMatch(/sales_lead_email_batch_items/i);
    expect(manualTokenSql).not.toMatch(/body_(source|text|html)_snapshot/i);
    expect(manualTokenSql).not.toMatch(/\bUPDATE\b/i);
    expect(manualTokenSql).not.toMatch(/\bDELETE\b/i);
    // Ruční token má batch_item_id NULL — nikdy se neváže na existující dávku.
    expect(manualTokenSql).toContain('ALTER COLUMN batch_item_id DROP NOT NULL');
    expect(manualTokenSql).toMatch(/token_hash, lead_id, batch_item_id, recipient_snapshot, expires_at[\s\S]{0,200}NULL/);
  });

  test('bezpečnost nové RPC', () => {
    expect(manualTokenSql).toContain('SECURITY DEFINER');
    expect(manualTokenSql).toContain("SET search_path = ''");
    expect(manualTokenSql).toContain(
      'REVOKE ALL ON FUNCTION public.sales_lead_issue_manual_response_token(uuid, text)\n  FROM PUBLIC, anon, authenticated',
    );
    expect(manualTokenSql).toContain('TO service_role');
    // Do tabulky se ukládá jen HASH; syrový token se nikdy neperzistuje a
    // opouští funkci výhradně návratovou hodnotou pro odesílací Edge Function.
    const insertStart = manualTokenSql.indexOf('INSERT INTO public.sales_lead_email_response_tokens');
    expect(insertStart).toBeGreaterThan(-1);
    const insertStmt = manualTokenSql.slice(
      insertStart,
      manualTokenSql.indexOf('RETURN jsonb_build_object', insertStart),
    );
    expect(insertStmt).toContain('v_token_hash');
    expect(insertStmt).not.toMatch(/\bv_token\b(?!_hash)/);
    // Žádný e-mail, cron ani automatika.
    expect(manualTokenSql).not.toMatch(/Resend|email_queue|net\.http|pg_net|cron\.schedule|automation_settings/i);
  });

  test('ruční cesta je fail-closed — bez tokenu se nic neodešle', () => {
    expect(manualSender).toContain('response_links_not_configured');
    expect(manualSender).toContain('response_links_unavailable');
    expect(manualSender).toContain('isValidResponseToken(tokenResult.token)');
    // Guard je PŘED renderem i odesláním.
    expect(manualSender.indexOf('response_links_unavailable'))
      .toBeLessThan(manualSender.indexOf('const renderedText = renderSalesLeadEmailText(ctaBody)'));
  });

  test('CTA blok má čitelné odkazy v textu a tlačítka v HTML', () => {
    const { interestUrl, declineUrl } = buildResponseCtaUrls(PROJECT, TOKEN_A);
    const block = buildResponseCtaBlock({ interestUrl, declineUrl });
    // textová verze = oba čitelné odkazy
    expect(block.text).toContain(`Mám zájem: ${interestUrl}`);
    expect(block.text).toContain(`Nemám zájem: ${declineUrl}`);
    // HTML verze = dvě vizuální tlačítka, oranžové hlavní
    expect(block.html).toContain('>Mám zájem</a>');
    expect(block.html).toContain('>Nemám zájem</a>');
    expect(block.html).toContain('&amp;action=interest');
    expect(composedSource('Dobrý den', TOKEN_A)).toContain('Dobrý den');
  });
});
