import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const discover = fs.readFileSync('supabase/functions/sales-lead-discover/index.ts', 'utf8');
const search = fs.readFileSync('supabase/functions/_shared/companyWebsiteSearch.ts', 'utf8');
const crawler = fs.readFileSync('supabase/functions/_shared/companyEmailCrawler.ts', 'utf8');
const verifier = fs.readFileSync('supabase/functions/_shared/companyWebsiteVerifier.ts', 'utf8');
const dialog = fs.readFileSync('src/components/admin/sales-leads/DiscoverLeadsDialog.tsx', 'utf8');

test.describe('discover aktivně dohledá a ověří web, neukládá prázdné leady', () => {
  test('primární vyhledávání je OpenAI Responses API web search', () => {
    expect(discover).toContain('findOfficialWebsiteCandidates');
    expect(search).toContain('api.openai.com/v1/responses');
    expect(search).toContain('web_search_preview');
    expect(search).toContain('gpt-4o-mini');
    // URL se berou z anotací/citací I z textu odpovědi
    expect(search).toContain('extractUrlsFromResponses');
    expect(search).toContain('url_citation');
    expect(search).toContain('URL_IN_TEXT_RE');
  });

  test('DuckDuckGo zůstává jen jako nouzový fallback', () => {
    expect(search).toContain('duckduckgo.com/html');
    expect(search).toContain('parseDuckDuckGoResults');
    expect(search).toContain('uddg=');
    expect(search).toContain('FALLBACK');
    // Brave Search API se neimplementuje
    expect(search).not.toContain('brave');
    expect(search).not.toContain('api.search.brave.com');
  });

  test('web search má druhý pokus s jinou formulací dotazu', () => {
    // dvě různě formulované varianty; firma se opustí až po druhém neúspěchu
    expect(search).toContain('const queries = [');
    expect(search).toContain('kontakt oficiální web');
    expect(search).toContain('for (const query of queries)');
    expect(search).toContain('if (candidates.length > 0) return candidates;');
  });

  test('celá pipeline má podrobné logování (kde se proces zastaví)', () => {
    expect(discover).toContain('function dbg(');
    expect(discover).toContain('dbg("ai_proposed"');
    expect(discover).toContain('dbg("search_done"');
    expect(discover).toContain('dbg("verify_done"');
    expect(discover).toContain('dbg("skipped_unverified_website"');
    expect(search).toContain('logSearch');
  });

  test('vyhledané weby jdou před AI odhady a stejně se ověří', () => {
    expect(discover).toContain('const candidates = [...searchCandidates, ...aiCandidates]');
    expect(discover).toContain('verifyCompanyWebsite({ companyName: name, ico: icoHint, candidates })');
  });

  test('bez ověřeného webu se firma NEUKLÁDÁ (žádný prázdný lead)', () => {
    expect(discover).toContain('if (!website) {');
    expect(discover).toContain("reason: \"unverified_website\"");
    // po zápisu unverified_website následuje continue před jakýmkoli RPC zápisem
    const idx = discover.indexOf('reason: "unverified_website"');
    const after = discover.slice(idx, idx + 60);
    expect(after).toContain('continue');
  });

  test('firma bez webu se už NEukládá přes sales_lead_propose s null webem', () => {
    // no-email větev se volá jen pro ověřený web -> p_website je vždy `website`, ne `website || null`
    expect(discover).not.toContain('p_website: website || null');
    expect(discover).toContain('p_website: website,');
  });

  test('sociální sítě a katalogy se neberou jako oficiální web', () => {
    expect(search).toContain('NON_OFFICIAL_HOST_SUFFIXES');
    expect(search).toContain('facebook.com');
    expect(search).toContain('firmy.cz');
  });

  test('stahování používá realistickou prohlížečovou hlavičku (méně WAF 403)', () => {
    expect(verifier).toContain('BROWSER_UA');
    expect(verifier).toContain('Mozilla/5.0');
    expect(verifier).toContain('Accept-Language');
    expect(crawler).toContain('Mozilla/5.0');
  });

  test('e-mail se bere jen z ověřeného webu a filtrují se cizí tech domény', () => {
    expect(crawler).toContain('PLACEHOLDER_EMAIL_DOMAINS');
    expect(crawler).toContain('sentry.io');
    expect(crawler).toContain('readymag.com');
    expect(crawler).toContain('isLikelyPlaceholderEmail');
  });

  test('souhrn běhu: prověřeno / uloženo / ověřené weby / odmítnuto (bez e-mailových metrik)', () => {
    expect(discover).toContain('candidates_checked: candidatesChecked');
    expect(discover).toContain('created,');
    expect(discover).toContain('websites_verified: websitesVerified');
    expect(discover).toContain('websites_rejected: websitesRejected');
    // e-mailové metriky discovery zrušeny
    expect(discover).not.toContain('created_with_email');
    expect(discover).not.toContain('created_without_email');
    expect(dialog).toContain('Prověřeno kandidátů');
    expect(dialog).toContain('Ověřené weby');
    expect(dialog).toContain('Odmítnuto (neověřený web)');
    expect(dialog).not.toContain('s veřejným e-mailem');
    expect(dialog).not.toContain('jen web, bez e-mailu');
  });

  test('discovery NIKDY nesbírá ani neukládá e-mail', () => {
    // žádný email crawl, žádný kontaktní RPC, žádné psaní e-mailu v discovery
    expect(discover).not.toContain('crawlCompanyWebsite');
    expect(discover).not.toContain('sales_lead_propose_with_contact');
    expect(discover).not.toContain('p_email');
    expect(discover).not.toContain('proposed_contact');
    expect(discover).not.toContain('contact_data_provenance');
    // ukládá jen přes web-only RPC
    expect(discover).toContain('supabaseAdmin.rpc("sales_lead_propose"');
    // prompt už e-mail nesbírá
    expect(discover).toContain('E-mail se při discovery NEsbírá');
  });

  test('UI copy už netvrdí, že se uloží každá firma bez ohledu na web', () => {
    expect(dialog).toContain('Uloží se jen firmy s ověřeným oficiálním webem');
    expect(dialog).not.toContain('Uloží se každá použitelná firma');
  });

  test('e-mail: sanitizace + doménová/značková příslušnost firmě', () => {
    expect(crawler).toContain('export function sanitizeEmail');
    expect(crawler).toContain('while (s.startsWith("mailto:"))');
    expect(crawler).toContain('s.includes(":")');
    expect(crawler).toContain('export function emailBelongsToCompany');
    expect(crawler).toContain('registrableDomain');
  });

  test('verifier: blocklist zpravodajských/katalogových domén + doménová identita', () => {
    expect(verifier).toContain('NEWS_CATALOG_BLOCKLIST');
    expect(verifier).toContain('mediar.cz');
    expect(verifier).toContain('mam.cz');
    expect(verifier).toContain('marketingsales.cz');
    expect(verifier).toContain('e15.cz');
    expect(verifier).toContain('firmy.cz');
    expect(verifier).toContain('zivefirmy.cz');
    expect(verifier).toContain('news_or_catalog_domain');
    expect(verifier).toContain('domainMatchesCompany');
    expect(verifier).toContain('domain_identity_mismatch');
  });
});
