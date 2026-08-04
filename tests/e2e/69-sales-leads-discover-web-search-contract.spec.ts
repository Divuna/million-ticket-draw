import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const worker = fs.readFileSync('supabase/functions/sales-lead-discover/index.ts', 'utf8');
const candidates = fs.readFileSync('supabase/functions/_shared/companyCandidateSearch.ts', 'utf8');
const registry = fs.readFileSync('supabase/functions/_shared/companyRegistryEnrich.ts', 'utf8');
const verifier = fs.readFileSync('supabase/functions/_shared/companyWebsiteVerifier.ts', 'utf8');
const emailCrawler = fs.readFileSync('supabase/functions/_shared/companyEmailCrawler.ts', 'utf8');
const verifiedContactMigration = fs.readFileSync('supabase/migrations/20260804141916_sales_lead_system_verified_contact.sql', 'utf8');
const discoveryContactRpc = verifiedContactMigration
  .split('CREATE OR REPLACE FUNCTION public.sales_lead_propose_with_contact')[1]
  ?.split('-- Historický AI návrh')[0] ?? '';
const dialog = fs.readFileSync('src/components/admin/sales-leads/DiscoverLeadsDialog.tsx', 'utf8');
// Sledování jobu žije nad dialogem (aby zavření okna nezastavilo průběh),
// proto se tabulka i RPC volají z hooku — kontrakt platí pro celý modul.
const discoveryHook = fs.readFileSync('src/components/admin/sales-leads/useDiscoveryJob.ts', 'utf8');
const discoveryUi = `${dialog}\n${discoveryHook}`;
const migJobs = fs.readFileSync('supabase/migrations/20260712120000_sales_lead_discovery_jobs.sql', 'utf8');
const migCron = fs.readFileSync('supabase/migrations/20260712130000_sales_lead_discovery_worker_cron.sql', 'utf8');

test.describe('Discovery Jobs — worker, kandidáti z web search, bezpečný volitelný e-mail', () => {
  test('kandidáti se získávají AKTIVNÍM web search (ne AI generuje seznam)', () => {
    expect(candidates).toContain('web_search_preview');
    expect(candidates).toContain('api.openai.com/v1/responses');
    expect(candidates).toContain('duckduckgo.com/html'); // fallback
    expect(candidates).toContain('SEGMENT_QUERIES');
    expect(candidates).toContain('buildQueriesForRound');
    expect(worker).toContain('generateCandidateUrls');
  });

  test('AI se používá JEN pro klasifikaci/relevanci/shrnutí', () => {
    expect(worker).toContain('async function classify(');
    expect(worker).toContain('"relevant"');
    expect(worker).toContain('summary');
    // AI není zdroj pravdy pro web/IČO/DIČ/adresu → ty jsou z ARES/webu
    expect(worker).toContain('verifyDiscoveredCompanySite');
    expect(worker).toContain('aresByIco');
    expect(worker).toContain('aresByName');
  });

  test('requested_count = počet ULOŽENÝCH firem (fill-to-count po dávkách)', () => {
    expect(worker).toContain('counters.created_count < requested');
    expect(worker).toContain('counters.candidates_checked < maxCandidates');
    expect(worker).toContain('target_reached');
    expect(worker).toContain('candidates_exhausted');
    expect(worker).toContain('max_candidates_reached');
    expect(migJobs).toContain('requested_count = počet uložených firem');
  });

  test('ověřený e-mail vznikne jen přes sdílený backend verifier a atomické RPC', () => {
    expect(worker).toContain('crawlCompanyWebsite');
    expect(worker).toContain('verifyEmailOnOfficialSourcePage');
    expect(worker).toContain('sales_lead_propose_with_contact');
    expect(worker).toContain('backend_verified_official_website');
    expect(emailCrawler).toContain('redirect_left_verified_website');
    expect(verifiedContactMigration).toContain("email_verification_method = 'backend_verified_official_website'");
    expect(verifiedContactMigration).toContain('contact_email = v_email');
  });

  test('bez důkazu vznikne lead přes původní RPC bez e-mailu a bez AI návrhu', () => {
    expect(worker).toContain('verifiedContact ? "sales_lead_propose_with_contact" : "sales_lead_propose"');
    expect(worker).not.toContain('proposed_contact_email');
    expect(worker).not.toContain('sales_lead_propose_contact');
    expect(discoveryContactRpc).not.toMatch(/proposed_contact_email\s*=\s*v_email/);
  });

  test('service_role oprávnění zůstává a současný discovery tok nedostane permission error', () => {
    expect(verifiedContactMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sales_lead_propose_with_contact\([\s\S]*?TO service_role;/);
    expect(verifiedContactMigration).not.toMatch(/FROM PUBLIC, anon, authenticated, service_role/);
    expect(worker).toContain('const rpcName = verifiedContact');
  });

  test('discovery ani jeho databázová cesta nevolá e-mailové sendery', () => {
    expect(worker).not.toMatch(/resend|email_queue|send-sales-lead-email|send-sales-lead-reply|send-sales-lead-follow-up/i);
    expect(verifiedContactMigration).not.toMatch(/resend|email_queue|net\.http/i);
  });

  test('enrichment jen doložitelných údajů z ARES/webu (nic se nehádá)', () => {
    expect(registry).toContain('export async function aresByIco');
    expect(registry).toContain('export async function aresByName');
    expect(registry).toContain('export function extractIcoFromText');
    expect(worker).toContain('contact_data_provenance');
    expect(worker).toContain('ARES');
    expect(worker).toContain('dic:');
    expect(worker).toContain('contact_phone');
  });

  test('dedup + wrong-category do správné kategorie', () => {
    expect(worker).toContain('counters.duplicates++');
    expect(worker).toContain('website_domain.eq');
    expect(worker).toContain('validSlugs.has(cls.slug)');
    expect(worker).toContain('counters.wrong_category++');
  });

  test('přísné ověření webu (news blocklist, parked, prázdný)', () => {
    expect(verifier).toContain('verifyDiscoveredCompanySite');
    expect(verifier).toContain('isNonOfficialWebsiteUrl');
    expect(verifier).toContain('non_official_third_party');
    expect(verifier).toContain('parked_or_for_sale');
    expect(verifier).toContain('no_business_identity');
  });

  test('worker běží jen na interní token (ne uživatelské volání)', () => {
    expect(worker).toContain('x-internal-token');
    expect(worker).toContain("error: \"unauthorized\"");
    expect(migCron).toContain('run_sales_lead_discovery_worker');
    expect(migCron).toContain('cron.schedule');
  });

  test('job tabulka + guarded RPC + 1 aktivní job', () => {
    expect(migJobs).toContain('CREATE TABLE IF NOT EXISTS public.sales_lead_discovery_jobs');
    expect(migJobs).toContain('sales_lead_discovery_job_create');
    expect(migJobs).toContain("has_admin_permission('sales_leads.manage')");
    expect(migJobs).toContain('job_already_running');
    expect(migJobs).toContain('ENABLE ROW LEVEL SECURITY');
  });

  test('UI: job + živý progress + cíl uložených, e-mail je jen ověřený bonus', () => {
    expect(discoveryUi).toContain('sales_lead_discovery_job_create');
    expect(discoveryUi).toContain('sales_lead_discovery_jobs');
    expect(dialog).toContain('Počet uložených firem (cíl)');
    expect(dialog).toContain('Prověřeno kandidátů');
    expect(dialog).toContain('Uloženo do segmentu');
    expect(dialog).toContain('běží dál');
    expect(dialog).toContain('Veřejný e-mail se uloží jen po přesném backendovém ověření');
    expect(dialog).toContain('jinak vznikne lead bez e-mailu');
  });
});
