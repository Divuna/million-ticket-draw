// ============================================================================
// companyCandidateSearch — GENEROVÁNÍ kandidátů firem pro segment (ne AI).
// Kandidáti se získávají AKTIVNÍM webovým vyhledáváním: OpenAI Responses API
// web_search_preview (hlavní) + DuckDuckGo (fallback), více různých dotazů
// podle segmentu, měst a podsegmentů. Vrací kandidátní homepage URL; AI zde
// NENÍ zdrojem firem. Každý web se dál ověřuje a doplňuje z ARES.
// ============================================================================

const OPENAI_MODEL =
  (typeof Deno !== "undefined" ? Deno.env.get("SALES_LEADS_SEARCH_MODEL") : undefined) ?? "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 25000;
const DDG_TIMEOUT_MS = 12000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const NON_OFFICIAL_HOST_SUFFIXES = [
  "facebook.com", "instagram.com", "linkedin.com", "cz.linkedin.com", "twitter.com", "x.com",
  "youtube.com", "youtu.be", "tiktok.com", "pinterest.com",
  "google.com", "google.cz", "goo.gl", "maps.app.goo.gl", "mapy.cz",
  "wikipedia.org", "wikiwand.com", "seznam.cz", "bing.com", "duckduckgo.com",
  "firmy.cz", "zivefirmy.cz", "najisto.cz", "najisto.centrum.cz", "edb.cz",
  "kurzy.cz", "rejstrik-firem.kurzy.cz", "or.justice.cz", "justice.cz", "ares.gov.cz",
  "merk.cz", "detail.firmy.cz", "detail.cz", "heureka.cz", "zbozi.cz", "glami.cz",
  "yelp.com", "foursquare.com",
  // zpravodajské/oborové portály
  "mediar.cz", "mam.cz", "marketingsales.cz", "e15.cz", "idnes.cz", "novinky.cz",
  "seznamzpravy.cz", "aktualne.cz", "forbes.cz", "hn.cz", "ihned.cz", "denik.cz",
  "root.cz", "lupa.cz", "zive.cz", "businessinfo.cz", "penize.cz", "podnikatel.cz",
];

const CITIES = ["Praha", "Brno", "Ostrava", "Plzeň", "Olomouc", "Liberec", "Hradec Králové", "České Budějovice"];

// Segment → dotazová témata (podsegmenty). Doplňuje se městem a rokem.
const SEGMENT_QUERIES: Record<string, string[]> = {
  "reklamni-agentury": ["reklamní agentura", "marketingová agentura", "reklamní studio", "PPC agentura", "brandingová agentura"],
  "auto-moto": ["autoservis", "autobazar", "prodejce automobilů", "pneuservis", "autodíly e-shop", "autolakovna"],
  "e-shopy": ["e-shop", "internetový obchod", "online obchod"],
  "luxusni-zbozi": ["luxusní zboží obchod", "šperky obchod", "hodinářství", "značkové zboží e-shop"],
  sport: ["sportovní obchod", "fitness centrum", "sportovní vybavení e-shop", "sportcentrum"],
  cestovani: ["cestovní kancelář", "cestovní agentura", "ubytování penzion"],
  gastronomie: ["restaurace", "kavárna", "bistro", "pivnice", "cukrárna", "hotel restaurace"],
  "lokalni-sluzby": ["kadeřnictví", "kosmetický salon", "instalatér", "úklidová firma", "autodoprava"],
  jine: ["firma"],
};

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>()\]]+/gi;

function logSearch(stage: string, data: Record<string, unknown>): void {
  try {
    console.log(`[discover-candidates] ${stage} ${JSON.stringify(data)}`);
  } catch { /* never throw */ }
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
  return NON_OFFICIAL_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

function toHomepage(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    return host ? `${u.protocol}//${host}/` : null;
  } catch {
    return null;
  }
}

interface OpenAiJson {
  output?: Array<{ content?: Array<{ text?: string; annotations?: Array<{ url?: string; url_citation?: { url?: string } }> }> }>;
  output_text?: string;
}

function extractUrls(json: OpenAiJson): string[] {
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
  for (const m of text.match(URL_IN_TEXT_RE) ?? []) urls.push(m.replace(/[),.;]+$/, ""));
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
        tools: [{ type: "web_search_preview" }],
        input: `${query}. Vypiš 10 konkrétních firem a jejich oficiální webové stránky (přímé URL homepage jejich vlastního webu). NE katalogy (Firmy.cz/Živéfirmy), NE sociální sítě, NE zpravodajské články. Ke každé firmě uveď URL.`,
      }),
    });
    if (!res.ok) { logSearch("openai_http_error", { status: res.status }); return []; }
    const json = (await res.json()) as OpenAiJson;
    const urls = extractUrls(json);
    logSearch("openai", { query, raw: urls.length });
    return urls;
  } catch (err) {
    logSearch("openai_failed", { error: err instanceof Error ? err.message : "unknown" });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function parseDdg(html: string): string[] {
  const urls: string[] = [];
  const re = /[?&]uddg=([^&"'\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try { const d = decodeURIComponent(m[1]); if (/^https?:\/\//i.test(d)) urls.push(d); } catch { /* skip */ }
  }
  return urls;
}

async function searchDdg(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=cz-cs`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DDG_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, "Accept-Language": "cs,en;q=0.8" } });
    if (!res.ok) { logSearch("ddg_http_error", { query, status: res.status }); return []; }
    const html = await res.text();
    const urls = parseDdg(html);
    logSearch("ddg", { query, raw: urls.length });
    return urls;
  } catch (err) {
    logSearch("ddg_failed", { error: err instanceof Error ? err.message : "unknown" });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Dotazy pro daný segment a „kolo" (round) — různé podsegmenty × města. */
export function buildQueriesForRound(leadGroup: string, round: number): string[] {
  const terms = SEGMENT_QUERIES[leadGroup] ?? SEGMENT_QUERIES.jine;
  const term = terms[round % terms.length];
  const city = CITIES[Math.floor(round / terms.length) % CITIES.length];
  return [`${term} ${city}`, `${term} Česká republika`];
}

/**
 * Vygeneruje dávku kandidátních homepage URL pro segment + kolo. Nejdřív
 * OpenAI web search (hlavní zdroj), při prázdném výsledku DDG fallback.
 * Odfiltruje katalogy/sítě/zpravodajství. Dedupe podle domény.
 */
export async function generateCandidateUrls(input: {
  leadGroup: string;
  round: number;
  openaiKey?: string;
}): Promise<string[]> {
  const queries = buildQueriesForRound(input.leadGroup, input.round);
  const seen = new Set<string>();
  const out: string[] = [];

  const collect = (rawUrls: string[]) => {
    for (const raw of rawUrls) {
      const host = safeHost(raw);
      if (!host || isNonOfficialHost(host)) continue;
      const home = toHomepage(raw);
      if (!home) continue;
      const key = host.replace(/^www\./, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(home);
    }
  };

  for (const query of queries) {
    let urls: string[] = [];
    if (input.openaiKey) urls = await searchOpenAi(query, input.openaiKey);
    if (urls.length === 0) urls = await searchDdg(query);
    collect(urls);
  }

  logSearch("batch", { leadGroup: input.leadGroup, round: input.round, candidates: out.length });
  return out;
}
