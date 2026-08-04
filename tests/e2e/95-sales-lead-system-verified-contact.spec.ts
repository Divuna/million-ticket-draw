import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { verifyEmailOnOfficialSourcePage } from '../../supabase/functions/_shared/companyEmailCrawler.ts';

const migration = fs.readFileSync(
  'supabase/migrations/20260804141916_sales_lead_system_verified_contact.sql',
  'utf8',
);
const enrich = fs.readFileSync('supabase/functions/sales-lead-enrich-contact/index.ts', 'utf8');
const discoveryContactRpc = migration
  .split('CREATE OR REPLACE FUNCTION public.sales_lead_propose_with_contact')[1]
  ?.split('-- Historický AI návrh')[0] ?? '';

const officialWebsite = 'https://firma.example.cz';
const sourceUrl = `${officialWebsite}/kontakt`;

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

test.describe('přesná backendová kontrola AI kandidáta', () => {
  test('správný e-mail na oficiální kontaktní stránce se ověří', async () => {
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite,
      sourceUrl,
      candidateEmail: 'OBCHOD@FIRMA.EXAMPLE.CZ',
      fetchImpl: async () => htmlResponse('<main>Kontakt: obchod@firma.example.cz</main>'),
    });
    expect(result).toEqual({
      verified: true,
      email: 'obchod@firma.example.cz',
      sourceUrl,
    });
  });

  test('e-mail bez zdrojové URL se odmítne', async () => {
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite,
      sourceUrl: '',
      candidateEmail: 'obchod@firma.example.cz',
      fetchImpl: async () => htmlResponse('obchod@firma.example.cz'),
    });
    expect(result).toEqual({ verified: false, reason: 'invalid_source_url' });
  });

  test('e-mail z jiné domény se odmítne bez fetch', async () => {
    let fetched = false;
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite,
      sourceUrl: 'https://cizi.example.net/kontakt',
      candidateEmail: 'obchod@firma.example.cz',
      fetchImpl: async () => { fetched = true; return htmlResponse('obchod@firma.example.cz'); },
    });
    expect(result).toEqual({ verified: false, reason: 'source_not_on_verified_website' });
    expect(fetched).toBe(false);
  });

  test('e-mail z katalogu se odmítne', async () => {
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite: 'https://firma.sluzby.cz',
      sourceUrl: 'https://firma.sluzby.cz/kontakt',
      candidateEmail: 'obchod@firma.cz',
      fetchImpl: async () => htmlResponse('obchod@firma.cz'),
    });
    expect(result).toEqual({ verified: false, reason: 'non_official_third_party' });
  });

  test('odhadnutý e-mail, který není ve staženém obsahu, se odmítne', async () => {
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite,
      sourceUrl,
      candidateEmail: 'info@firma.example.cz',
      fetchImpl: async () => htmlResponse('<p>Kontaktujte nás formulářem.</p>'),
    });
    expect(result).toEqual({ verified: false, reason: 'email_not_found_on_verified_website' });
  });

  test('tvrzení schované ve skriptu není skutečný obsah stránky', async () => {
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite,
      sourceUrl,
      candidateEmail: 'info@firma.example.cz',
      fetchImpl: async () => htmlResponse('<script>const guessed="mailto:info@firma.example.cz"</script>'),
    });
    expect(result).toEqual({ verified: false, reason: 'email_not_found_on_verified_website' });
  });

  test('přesměrování na cizí doménu se odmítne a cíl se nestáhne', async () => {
    const fetched: string[] = [];
    const result = await verifyEmailOnOfficialSourcePage({
      officialWebsite,
      sourceUrl,
      candidateEmail: 'obchod@firma.example.cz',
      fetchImpl: async (input) => {
        fetched.push(String(input));
        return new Response(null, { status: 302, headers: { location: 'https://catalog.example.net/firma' } });
      },
    });
    expect(result).toEqual({ verified: false, reason: 'redirect_left_verified_website' });
    expect(fetched).toEqual([sourceUrl]);
  });
});

test.describe('atomické uložení a zákaz neověřených AI návrhů', () => {
  test('Edge Function ukládá jen přes nové atomické RPC', () => {
    expect(enrich).toContain('sales_lead_store_backend_verified_contact');
    expect(enrich).not.toContain('sales_lead_propose_contact');
    expect(enrich).not.toMatch(/\.from\(["']sales_leads["']\)\.update/);
  });

  test('novější ruční kontakt ani změněný web se nepřepíše', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('v_lead.updated_at IS DISTINCT FROM p_expected_updated_at');
    expect(migration).toContain("'contact_already_present'");
    expect(migration).toContain("'verified_website_changed_since_lookup'");
  });

  test('neúspěšné AI hledání nezanechá návrh', () => {
    expect(migration).toContain("p_proposed_by IS DISTINCT FROM 'admin'");
    expect(migration).toContain("'backend_verification_required'");
    expect(migration).toContain("proposed_contact_by IS DISTINCT FROM 'admin'");
    expect(migration).toContain("p_proposed_by IS DISTINCT FROM 'backend_verified_official_website'");
    expect(discoveryContactRpc).not.toMatch(/proposed_contact_email\s*=\s*v_email/);
  });

  test('testovací sada nemá žádnou cestu k odeslání produkčnímu leadu', () => {
    expect(enrich).not.toMatch(/resend|email_queue|send-sales-lead-email/i);
    expect(migration).not.toMatch(/email_queue|net\.http|resend/i);
    expect(import.meta.url).not.toContain('send-sales-lead-email');
  });

  test('migrace nespouští backfill starých leadů', () => {
    const beforeFunctionDefinitions = migration.split('CREATE OR REPLACE FUNCTION')[0];
    expect(beforeFunctionDefinitions).not.toMatch(/UPDATE\s+public\.sales_leads/i);
    expect(migration).not.toMatch(/email_verification_method\s+text\s+DEFAULT/i);
  });
});
