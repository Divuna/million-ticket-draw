import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const discover = fs.readFileSync('supabase/functions/sales-lead-discover/index.ts', 'utf8');
const search = fs.readFileSync('supabase/functions/_shared/companyWebsiteSearch.ts', 'utf8');
const crawler = fs.readFileSync('supabase/functions/_shared/companyEmailCrawler.ts', 'utf8');
const verifier = fs.readFileSync('supabase/functions/_shared/companyWebsiteVerifier.ts', 'utf8');
const dialog = fs.readFileSync('src/components/admin/sales-leads/DiscoverLeadsDialog.tsx', 'utf8');

test.describe('discover aktivně dohledá a ověří web, neukládá prázdné leady', () => {
  test('web se aktivně dohledá reálným vyhledávačem (ne jen AI odhad)', () => {
    expect(discover).toContain('findOfficialWebsiteCandidates');
    // reálný keyless vyhledávač (DuckDuckGo), ne AI hádání domény
    expect(search).toContain('duckduckgo.com/html');
    expect(search).toContain('parseDuckDuckGoResults');
    expect(search).toContain('uddg=');
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
    expect(discover).toContain('dbg("crawl_done"');
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

  test('souhrn běhu ukazuje prověřeno / uloženo / ověřený web / e-mail / odmítnuto', () => {
    expect(discover).toContain('candidates_checked: candidatesChecked');
    expect(discover).toContain('websites_verified: websitesVerified');
    expect(discover).toContain('websites_rejected: websitesRejected');
    expect(discover).toContain('created_with_email: createdWithEmail');
    expect(discover).toContain('created_without_email: createdWithoutEmail');
    expect(dialog).toContain('Prověřeno kandidátů');
    expect(dialog).toContain('Odmítnuto (neověřený web)');
  });

  test('UI copy už netvrdí, že se uloží každá firma bez ohledu na web', () => {
    expect(dialog).toContain('Uloží se jen firmy s ověřeným oficiálním webem');
    expect(dialog).not.toContain('Uloží se každá použitelná firma');
  });
});
