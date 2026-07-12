// ============================================================================
// companyWebsiteSearch — aktivní DOHLEDÁNÍ pravděpodobného oficiálního webu
// firmy pomocí REÁLNÉHO webového vyhledávače (DuckDuckGo HTML endpoint).
//
// PROČ NE OpenAI web search: model *-search-preview nemusí být na účtu dostupný
// a při chybě tiše nevrátil nic → discovery nenašel žádný web. DuckDuckGo HTML
// je bez API klíče, vrací reálné organické výsledky a nezávisí na AI.
//
// AI zde NEHÁDÁ web. Vyhledávač vrátí kandidátní URL, které backend pořád
// nezávisle ověří přes ARES + HTTP + kontrolu identity (companyWebsiteVerifier).
// ============================================================================

const SEARCH_TIMEOUT_MS = 12000;
const MAX_SEARCH_CANDIDATES = 5;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Domény, které NIKDY nejsou „oficiální web firmy": sociální sítě, katalogy,
// mapy, wiki, obchodní rejstříky, agregátory. Vyhledávač je často vrátí, ale
// nesmí projít jako firemní homepage.
const NON_OFFICIAL_HOST_SUFFIXES = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "youtu.be", "tiktok.com", "pinterest.com",
  "google.com", "google.cz", "goo.gl", "maps.app.goo.gl",
  "wikipedia.org", "wikiwand.com",
  "firmy.cz", "zivefirmy.cz", "najisto.centrum.cz", "najisto.cz", "edb.cz",
  "kurzy.cz", "rejstrik-firem.kurzy.cz", "or.justice.cz", "justice.cz",
  "ares.gov.cz", "merk.cz", "detail.firmy.cz", "cz.linkedin.com",
  "heureka.cz", "zbozi.cz", "glami.cz", "yelp.com", "foursquare.com",
  "duckduckgo.com", "bing.com", "seznam.cz", "mapy.cz",
];

function logSearch(stage: string, data: Record<string, unknown>): void {
  try {
    console.log(`[discover-search] ${stage} ${JSON.stringify(data)}`);
  } catch { /* logging must never throw */ }
}

function safeHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost")) return null;
    return host;
  } catch {
    return null;
  }
}

function isNonOfficialHost(host: string): boolean {
  return NON_OFFICIAL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** URL -> homepage téže domény (schéma + host), bez cesty/query/fragmentu. */
function toHomepage(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (!host) return null;
    return `${u.protocol}//${host}/`;
  } catch {
    return null;
  }
}

/**
 * Vytáhne cílové URL z DuckDuckGo HTML výsledků. DDG obaluje odkazy do
 * přesměrování `//duckduckgo.com/l/?uddg=<URL-encoded>&...`. Bereme parametr
 * `uddg` a dekódujeme. Fallback: přímé absolutní odkazy ve výsledcích.
 */
export function parseDuckDuckGoResults(html: string): string[] {
  const urls: string[] = [];
  const uddgRe = /[?&]uddg=([^&"'\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = uddgRe.exec(html))) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(decoded)) urls.push(decoded);
    } catch { /* skip malformed */ }
  }
  // Fallback pro varianty výsledků bez uddg wrapperu (result__url apod.).
  const hrefRe = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = hrefRe.exec(html))) urls.push(m[1]);
  return urls;
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=cz-cs`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "cs,en;q=0.8",
      },
    });
    if (!res.ok) {
      logSearch("ddg_http_error", { query, status: res.status });
      return [];
    }
    const html = await res.text();
    const results = parseDuckDuckGoResults(html);
    logSearch("ddg_response", { query, html_len: html.length, raw_results: results.length });
    return results;
  } catch (err) {
    logSearch("ddg_fetch_failed", { query, error: err instanceof Error ? err.message : "unknown" });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export interface OfficialWebsiteCandidate {
  url: string;
  source: string;
}

/**
 * Aktivně dohledá kandidátní oficiální weby firmy přes DuckDuckGo. Zkusí dvě
 * různě formulované dotazy (retry); teprve druhý neúspěch nechá firmu bez
 * vyhledaného kandidáta. Vrací homepage URL bez sociálních sítí a katalogů.
 * Prázdné pole = nic vhodného nenalezeno.
 */
export async function findOfficialWebsiteCandidates(input: {
  companyName: string;
  city?: string | null;
  ico?: string | null;
  openaiKey?: string;
}): Promise<OfficialWebsiteCandidate[]> {
  const name = input.companyName.trim();
  if (!name) return [];

  const city = (input.city ?? "").trim();
  const queries = [
    city ? `${name} ${city}` : name,
    `${name} kontakt oficiální web`,
  ];

  for (const query of queries) {
    const rawUrls = await searchDuckDuckGo(query);
    const candidates: OfficialWebsiteCandidate[] = [];
    const seenHosts = new Set<string>();
    const rejectedHosts: string[] = [];

    for (const rawUrl of rawUrls) {
      const host = safeHost(rawUrl);
      if (!host) continue;
      if (isNonOfficialHost(host)) {
        if (!rejectedHosts.includes(host)) rejectedHosts.push(host);
        continue;
      }
      const homepage = toHomepage(rawUrl);
      if (!homepage) continue;
      const key = host.replace(/^www\./, "");
      if (seenHosts.has(key)) continue;
      seenHosts.add(key);
      candidates.push({ url: homepage, source: `ddg:${query}` });
      if (candidates.length >= MAX_SEARCH_CANDIDATES) break;
    }

    logSearch("candidates", {
      company: name,
      query,
      accepted: candidates.map((c) => c.url),
      filtered_out: rejectedHosts,
    });

    if (candidates.length > 0) return candidates;
  }

  logSearch("no_candidates", { company: name });
  return [];
}
