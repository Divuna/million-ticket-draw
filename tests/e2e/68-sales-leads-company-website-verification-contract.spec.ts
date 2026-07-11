import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const verifier=fs.readFileSync('supabase/functions/_shared/companyWebsiteVerifier.ts','utf8');
const discover=fs.readFileSync('supabase/functions/sales-lead-discover/index.ts','utf8');
const enrich=fs.readFileSync('supabase/functions/sales-lead-enrich-contact/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260711170000_sales_leads_verified_company_websites.sql','utf8');
test.describe('company website verification is fail closed',()=>{
 test('správný web: HTTP 200, HTML a identita firmy',()=>{expect(verifier).toContain("res.status !== 200");expect(verifier).toContain('identity_confirmed');expect(verifier).toContain('official_page_marker');});
 test('špatný web navržený AI se neuloží',()=>{expect(discover).toContain('verification.status === "verified" ? verification.website : null');expect(migration).toContain("COALESCE(v->>'status','') <> 'verified'");});
 test('firma bez ověřeného webu se NEUKLÁDÁ (žádný prázdný lead)',()=>{expect(discover).toContain("reason: \"unverified_website\"");expect(discover).not.toContain('p_website: website || null');expect(migration).toContain("website_verification_status := 'neovereny'");});
 test('více domén: alternativy jsou jen auditní',()=>{expect(verifier).toContain('alternatives: evaluated.filter');expect(migration).toContain('They must never be used for contact enrichment');});
 test('přesměrování se sleduje a finální web ověří',()=>{expect(verifier).toContain("redirect: 'manual'");expect(verifier).toContain('finalUrl: page.finalUrl');});
 test('zaparkovaná doména je zamítnuta',()=>{expect(verifier).toContain('PARKED_PATTERNS');expect(verifier).toContain('parked_or_for_sale');});
 test('expirovaná doména neprojde',()=>{expect(verifier).toContain('http_or_content_failed');expect(verifier).toContain('domain has expired');});
 test('změna názvu firmy použije právní název ARES',()=>{expect(verifier).toContain('registry?.legalName');expect(verifier).toContain('obchodniJmeno');});
 test('shoda podle IČO má nejvyšší důvěru',()=>{expect(verifier).toContain("matches.includes('ico') ? 100 : 95");expect(verifier).toContain('ARES + oficiální web');});
 test('shoda jen podle názvu musí být jednoznačná',()=>{expect(verifier).toContain('if (exact.length !== 1) return null');expect(verifier).toContain("matches.includes('company_name')");});
 test('kontakt jen z ověřeného webu',()=>{expect(enrich).toContain('website_verification_status !== "overeny"');expect(enrich).toContain('source_not_on_verified_website');expect(enrich).toContain('email_not_found_on_verified_website');});
});
