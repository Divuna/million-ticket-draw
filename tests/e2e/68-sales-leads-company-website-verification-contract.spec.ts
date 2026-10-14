import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const verifier=fs.readFileSync('supabase/functions/_shared/companyWebsiteVerifier.ts','utf8');
const discover=fs.readFileSync('supabase/functions/sales-lead-discover/index.ts','utf8');
const enrich=fs.readFileSync('supabase/functions/sales-lead-enrich-contact/index.ts','utf8');
const emailCrawler=fs.readFileSync('supabase/functions/_shared/companyEmailCrawler.ts','utf8');
const policy=fs.readFileSync('supabase/functions/_shared/officialWebsitePolicy.ts','utf8');
const addDialog=fs.readFileSync('src/components/admin/sales-leads/AddSalesLeadDialog.tsx','utf8');
const detail=fs.readFileSync('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx','utf8');
const cleanup=fs.readFileSync('supabase/migrations/20260716153007_sales_lead_rojik_catalog_website_cleanup.sql','utf8');
const migration=fs.readFileSync('supabase/migrations/20260711170000_sales_leads_verified_company_websites.sql','utf8');
test.describe('company website verification is fail closed',()=>{
 test('správný web: HTTP 200, HTML a identita firmy',()=>{expect(verifier).toContain("res.status !== 200");expect(verifier).toContain('identity_confirmed');expect(verifier).toContain('official_page_marker');});
 test('neověřený web se neuloží (worker)',()=>{expect(discover).toContain('verifyDiscoveredCompanySite');expect(discover).toContain('counters.websites_rejected++');expect(migration).toContain("COALESCE(v->>'status','') <> 'verified'");});
 test('firma bez ověřeného webu se NEUKLÁDÁ (žádný prázdný lead)',()=>{expect(discover).toContain('if (!site.verified || !site.website)');expect(discover).not.toContain("p_website: website || null");expect(migration).toContain("website_verification_status := 'neovereny'");});
 test('více domén: alternativy jsou jen auditní',()=>{expect(verifier).toContain('alternatives: evaluated.filter');expect(migration).toContain('They must never be used for contact enrichment');});
 test('přesměrování se sleduje a finální web ověří',()=>{expect(verifier).toContain("redirect: 'manual'");expect(verifier).toContain('finalUrl: page.finalUrl');});
 test('zaparkovaná doména je zamítnuta',()=>{expect(verifier).toContain('PARKED_PATTERNS');expect(verifier).toContain('parked_or_for_sale');});
 test('expirovaná doména neprojde',()=>{expect(verifier).toContain('http_or_content_failed');expect(verifier).toContain('domain has expired');});
 test('změna názvu firmy použije právní název ARES',()=>{expect(verifier).toContain('registry?.legalName');expect(verifier).toContain('obchodniJmeno');});
 test('shoda podle IČO má nejvyšší důvěru',()=>{expect(verifier).toContain("matches.includes('ico') ? 100 : 95");expect(verifier).toContain('ARES + oficiální web');});
 test('shoda jen podle názvu musí být jednoznačná',()=>{expect(verifier).toContain('if (exact.length !== 1) return null');expect(verifier).toContain("matches.includes('company_name')");});
 test('kontakt jen z ověřeného webu',()=>{expect(enrich).toContain('website_verification_status !== "overeny"');expect(enrich).toContain('verifyEmailOnOfficialSourcePage');expect(emailCrawler).toContain('source_not_on_verified_website');expect(emailCrawler).toContain('email_not_found_on_verified_website');});
});

test('centrální politika blokuje katalogy ve všech ukládacích cestách',()=>{
 expect(policy).toContain('sluzby.cz');
 expect(policy).toContain('host.endsWith');
 expect(verifier).toContain('nonOfficialWebsiteMatch');
 expect(discover).toContain('verifyCompanyWebsite');
 expect(enrich).toContain('verified_website_revalidation_failed');
 expect(addDialog).toContain('isNonOfficialWebsiteUrl');
 expect(detail).toContain('isNonOfficialWebsiteUrl');
});

test('oprava Rojik je přesná, auditní a nic nemaže',()=>{
 expect(cleanup).toContain("= '26255430'");
 expect(cleanup).toContain("= 'rojik.sluzby.cz'");
 expect(cleanup).toContain('alternative_websites');
 expect(cleanup).toContain('sales_lead_non_official_website_cleared');
 expect(cleanup).not.toMatch(/DELETE\s+FROM\s+public\.sales_leads/i);
});
