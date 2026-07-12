// ============================================================================
// companyWebsiteSearch — aktivní DOHLEDÁNÍ pravděpodobného oficiálního webu
// firmy. PRIMÁRNÍ: OpenAI Responses API web search (model gpt-4o-mini, tool
// web_search_preview, stávající OPENAI_API_KEY). FALLBACK: DuckDuckGo HTML.
//
// AI web search slouží POUZE k nalezení KANDIDÁTNÍCH webů. Každý web musí
// projít nezávislým ověřením (ARES + HTTP + obsah + identita + redirect +
// zamítnutí parked/cizí domény) v companyWebsiteVerifier. E-mail se hledá
// jen na ověřeném webu. AI zde není zdroj pravdy.
// ============================================================================

const OPENAI_MODEL =
  (typeof Deno !== "undefined" ? Deno.env.get("SALES_LEADS_SEARCH_MODEL") : undefined) ?? "gpt-4o-mini";
const OPENAI_TOOL = "web_search_preview";
const OPENAI_TIMEOUT_MS = 25000;
const DDG_TIMEOUT_MS = 12000;
const MAX_SEARCH_CANDIDATES = 5;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Domény, které NIKDY nejsou „oficiální web firmy": sociální sítě, katalogy,
// mapy, wiki, obchodní rejstříky, agregátory.
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

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>()\]]+/gi;

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

// ── OpenAI Responses API web search (PRIMÁRNÍ) ──────────────────────────────

interface OpenAiResponsesJson {
  output?: Array<{
    content?: Array<{
      text?: string;
      annotations?: Array<{ url?: string; url_citation?: { url?: string } }>;
    }>;
  }>;
  output_text?: string;
}

/** Vytáhne URL z Responses API odpovědi — z anotací/citací I z textu. */
export function extractUrlsFromResponses(json: OpenAiResponsesJson): string[] {
  const urls: string[] = [];
  let text = "";
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") text += c.text + "\n";
      for (const a of c.annotations ?? []) {
        const u = a?.url ?? a?.url_citation?.url;
        if (typeof u === "string") urls.push(u);
      }
    }
  }
  if (typeof json.output_text === "string") text += json.output_text;
  const matches = text.match(URL_IN_TEXT_RE) ?? [];
  for (const m of matches) urls.push(m.replace(/[),.;]+$/, ""));
  return urls;
}

async function searchOpenAi(query: string, openaiKey: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        tools: [{ type: OPENAI_TOOL }],
        input: query,
      }),
    });
    if (!res.ok) {
      logSearch("openai_http_error", { status: res.status });
      return [];
    }
    const json = (await res.json()) as OpenAiResponsesJson;
    const urls = extractUrlsFromResponses(json);
    logSearch("openai_response", { raw_urls: urls.length });
    return urls;
  } catch (err) {
    logSearch("openai_fetch_failed", { error: err instanceof Error ? err.message : "unknown" });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── DuckDuckGo HTML (NOUZOVÝ FALLBACK) ──────────────────────────────────────

/** Vytáhne cílové URL z DuckDuckGo HTML výsledků (parametr `uddg`). */
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
  const hrefRe = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = hrefRe.exec(html))) urls.push(m[1]);
  return urls;
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=cz-cs`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DDG_TIMEOUT_MS);
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

// ── Kandidáti ───────────────────────────────────────────────────────────────

export interface OfficialWebsiteCandidate {
  url: string;
  source: string;
}

/** Ze surových URL vyrobí filtrované homepage kandidáty (bez katalogů/sítí). */
function toCandidates(rawUrls: string[], sourceLabel: string): { candidates: OfficialWebsiteCandidate[]; rejected: string[] } {
  const candidates: OfficialWebsiteCandidate[] = [];
  const seenHosts = new Set<string>();
  const rejected: string[] = [];
  for (const rawUrl of rawUrls) {
    const host = safeHost(rawUrl);
    if (!host) continue;
    if (isNonOfficialHost(host)) {
      if (!rejected.includes(host)) rejected.push(host);
      continue;
    }
    const homepage = toHomepage(rawUrl);
    if (!homepage) continue;
    const key = host.replace(/^www\./, "");
    if (seenHosts.has(key)) continue;
    seenHosts.add(key);
    candidates.push({ url: homepage, source: sourceLabel });
    if (candidates.length >= MAX_SEARCH_CANDIDATES) break;
  }
  return { candidates, rejected };
}

/**
 * Aktivně dohledá kandidátní oficiální weby firmy. PRIMÁRNĚ OpenAI web search
 * (dvě formulace dotazu = retry), NOUZOVĚ DuckDuckGo. Vrací homepage URL bez
 * sociálních sítí a katalogů. Prázdné pole = nic vhodného nenalezeno. Každý
 * kandidát se dál nezávisle ověřuje ve verifieru — tohle není důkaz.
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
  const loc = city ? ` (${city})` : "";
  const queries = [
    `Najdi OFICIÁLNÍ firemní web české firmy „${name}"${loc}. Vrať přímou URL homepage jejího vlastního webu (např. https://nazevfirmy.cz). NE sociální sítě, NE katalogy (Firmy.cz/Živéfirmy), NE mapy, NE Wikipedii.`,
    `Jaká je adresa vlastních webových stránek firmy „${name}"${loc} v České republice? Napiš přímou URL homepage jejího firemního webu, ne katalog ani sociální síť.`,
  ];

  // 1) PRIMÁRNÍ: OpenAI Responses API web search — dvě formulace (retry).
  if (input.openaiKey) {
    for (const query of queries) {
      const raw = await searchOpenAi(query, input.openaiKey);
      const { candidates, rejected } = toCandidates(raw, "openai_web_search");
      logSearch("candidates", { company: name, provider: "openai", accepted: candidates.map((c) => c.url), filtered_out: rejected });
      if (candidates.length > 0) return candidates;
    }
  } else {
    logSearch("openai_skipped", { company: name, reason: "no_openai_key" });
  }

  // 2) NOUZOVÝ FALLBACK: DuckDuckGo HTML — dvě formulace.
  const ddgQueries = [city ? `${name} ${city}` : name, `${name} kontakt oficiální web`];
  for (const query of ddgQueries) {
    const raw = await searchDuckDuckGo(query);
    const { candidates, rejected } = toCandidates(raw, `ddg:${query}`);
    logSearch("candidates", { company: name, provider: "ddg", query, accepted: candidates.map((c) => c.url), filtered_out: rejected });
    if (candidates.length > 0) return candidates;
  }

  logSearch("no_candidates", { company: name });
  return [];
}
