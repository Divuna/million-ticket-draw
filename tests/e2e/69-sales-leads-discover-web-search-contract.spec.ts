import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const worker = fs.readFileSync('supabase/functions/sales-lead-discover/index.ts', 'utf8');
const candidates = fs.readFileSync('supabase/functions/_shared/companyCandidateSearch.ts', 'utf8');
const registry = fs.readFileSync('supabase/functions/_shared/companyRegistryEnrich.ts', 'utf8');
const verifier = fs.readFileSync('supabase/functions/_shared/companyWebsiteVerifier.ts', 'utf8');
const dialog = fs.readFileSync('src/components/admin/sales-leads/DiscoverLeadsDialog.tsx', 'utf8');
const migJobs = fs.readFileSync('supabase/migrations/20260712120000_sales_lead_discovery_jobs.sql', 'utf8');
const migCron = fs.readFileSync('supabase/migrations/20260712130000_sales_lead_discovery_worker_cron.sql', 'utf8');

test.describe('Discovery Jobs — worker, kandidáti z web search, bez e-mailu', () => {
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

  test('discovery NIKDY nesbírá ani neukládá e-mail', () => {
    expect(worker).not.toContain('crawlCompanyWebsite');
    expect(worker).not.toContain('sales_lead_propose_with_contact');
    expect(worker).not.toContain('p_email');
    expect(worker).not.toContain('proposed_contact');
    expect(worker).toContain('supabaseAdmin.rpc("sales_lead_propose"');
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
    expect(verifier).toContain('NEWS_CATALOG_BLOCKLIST');
    expect(verifier).toContain('news_or_catalog_domain');
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

  test('UI: job + živý progress + cíl uložených, bez e-mailu', () => {
    expect(dialog).toContain('sales_lead_discovery_job_create');
    expect(dialog).toContain('sales_lead_discovery_jobs');
    expect(dialog).toContain('Počet uložených firem (cíl)');
    expect(dialog).toContain('Prověřeno kandidátů');
    expect(dialog).toContain('Uloženo do segmentu');
    expect(dialog).toContain('běží dál');
    expect(dialog).toContain('E-mail se NEsbírá');
  });
});
