// ============================================================================
// companyCandidateSearch — GENEROVÁNÍ kandidátů firem pro segment (ne AI).
// Kandidáti se získávají AKTIVNÍM webovým vyhledáváním: OpenAI Responses API
// web_search_preview (hlavní) + DuckDuckGo (fallback), více různých dotazů
// podle segmentu, měst a podsegmentů. Vrací kandidátní homepage URL; AI zde
// NENÍ zdrojem firem. Každý web se dál ověřuje a doplňuje z ARES.
// ============================================================================

import { isNonOfficialWebsiteUrl } from "./officialWebsitePolicy.ts";

const OPENAI_MODEL =
  (typeof Deno !== "undefined" ? Deno.env.get("SALES_LEADS_SEARCH_MODEL") : undefined) ?? "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 25000;
const DDG_TIMEOUT_MS = 12000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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
    // signal MUSÍ jít do fetch, jinak se DDG_TIMEOUT_MS nevynutí a viselo by to
    // až do wall-clock limitu celé funkce. Abort skončí v catch → prázdný výsledek.
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "cs,en;q=0.8" },
      signal: controller.signal,
    });
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

/** Důvod spuštění DDG fallbacku v rámci jedné dávky. */
export type CandidateFallbackReason =
  | "openai_empty"
  | "openai_no_usable_candidates"
  | "none";

/** Bezpečná diagnostika dávky — jen počty a důvod, nikdy klíče ani tokeny. */
export interface CandidateSearchDiagnostics {
  openai_raw_count: number;
  openai_usable_count: number;
  ddg_raw_count: number;
  ddg_usable_count: number;
  final_candidate_count: number;
  /** Důvod posledního fallbacku v dávce; "none" = DDG se nevolalo. */
  fallback_reason: CandidateFallbackReason;
}

export interface CandidateSearchResult {
  urls: string[];
  diagnostics: CandidateSearchDiagnostics;
}

/**
 * Normalizace jedné dávky syrových URL na homepage kandidáty: odfiltruje
 * katalogy/sítě/zpravodajství a nevalidní URL, dedupe podle registrovatelné
 * domény uvnitř dávky. „Použitelný kandidát" = to, co projde touto funkcí.
 */
function normalizeCandidates(rawUrls: string[]): string[] {
  const out: string[] = [];
  const seenInBatch = new Set<string>();
  for (const raw of rawUrls) {
    const host = safeHost(raw);
    if (!host || isNonOfficialWebsiteUrl(raw)) continue;
    const home = toHomepage(raw);
    if (!home) continue;
    const key = host.replace(/^www\./, "");
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    out.push(home);
  }
  return out;
}

/**
 * Vygeneruje dávku kandidátních homepage URL pro segment + kolo. Nejdřív
 * OpenAI web search (hlavní zdroj); DDG fallback se spustí, když OpenAI
 * nedodá POUŽITELNÉ kandidáty — tedy i tehdy, když nějaká URL vrátí, ale
 * všechny odpadnou na normalizaci/deny-listu. Dedupe napříč oběma zdroji.
 */
export async function generateCandidateUrlsWithDiagnostics(input: {
  leadGroup: string;
  round: number;
  openaiKey?: string;
}): Promise<CandidateSearchResult> {
  const queries = buildQueriesForRound(input.leadGroup, input.round);
  const seen = new Set<string>();
  const out: string[] = [];
  const diagnostics: CandidateSearchDiagnostics = {
    openai_raw_count: 0,
    openai_usable_count: 0,
    ddg_raw_count: 0,
    ddg_usable_count: 0,
    final_candidate_count: 0,
    fallback_reason: "none",
  };

  const append = (candidates: string[]) => {
    for (const home of candidates) {
      const host = safeHost(home);
      if (!host) continue;
      const key = host.replace(/^www\./, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(home);
    }
  };

  for (const query of queries) {
    const openaiRaw = input.openaiKey ? await searchOpenAi(query, input.openaiKey) : [];
    const openaiUsable = normalizeCandidates(openaiRaw);
    diagnostics.openai_raw_count += openaiRaw.length;
    diagnostics.openai_usable_count += openaiUsable.length;
    append(openaiUsable);

    // Fallback řídí POUŽITELNOST, ne holý počet vrácených URL.
    if (openaiUsable.length === 0) {
      diagnostics.fallback_reason = openaiRaw.length === 0
        ? "openai_empty"
        : "openai_no_usable_candidates";
      const ddgRaw = await searchDdg(query);
      const ddgUsable = normalizeCandidates(ddgRaw);
      diagnostics.ddg_raw_count += ddgRaw.length;
      diagnostics.ddg_usable_count += ddgUsable.length;
      append(ddgUsable);
    }
  }

  diagnostics.final_candidate_count = out.length;
  logSearch("batch", { leadGroup: input.leadGroup, round: input.round, ...diagnostics });
  return { urls: out, diagnostics };
}

/**
 * Jeden záznam diagnostiky ukládaný k discovery jobu (sloupec
 * `sales_lead_discovery_jobs.search_diagnostics`). Jen čísla, ISO timestamp a
 * enum důvodu — nikdy API klíč, token ani jiný secret.
 */
export interface CandidateSearchDiagnosticsEntry extends CandidateSearchDiagnostics {
  round: number;
  at: string;
  added_to_pool: number;
}

/** Kolik posledních kol se u jobu drží, aby jsonb nerostlo bez omezení. */
export const MAX_DIAGNOSTICS_ENTRIES = 50;

/** Sestaví záznam diagnostiky pro jedno search kolo. Pure, bez vedlejších efektů. */
export function buildDiagnosticsEntry(input: {
  round: number;
  diagnostics: CandidateSearchDiagnostics;
  addedToPool: number;
  at?: string;
}): CandidateSearchDiagnosticsEntry {
  return {
    round: input.round,
    at: input.at ?? new Date().toISOString(),
    openai_raw_count: input.diagnostics.openai_raw_count,
    openai_usable_count: input.diagnostics.openai_usable_count,
    ddg_raw_count: input.diagnostics.ddg_raw_count,
    ddg_usable_count: input.diagnostics.ddg_usable_count,
    final_candidate_count: input.diagnostics.final_candidate_count,
    fallback_reason: input.diagnostics.fallback_reason,
    added_to_pool: input.addedToPool,
  };
}

/**
 * Přidá záznam k historii jobu. Zachovává předchozí kola (worker běží opakovaně
 * přes cron), ořezává jen nejstarší nad `MAX_DIAGNOSTICS_ENTRIES`.
 */
export function appendDiagnosticsEntry(
  existing: unknown,
  entry: CandidateSearchDiagnosticsEntry,
): CandidateSearchDiagnosticsEntry[] {
  const history = Array.isArray(existing) ? (existing as CandidateSearchDiagnosticsEntry[]) : [];
  const next = [...history, entry];
  return next.length > MAX_DIAGNOSTICS_ENTRIES ? next.slice(-MAX_DIAGNOSTICS_ENTRIES) : next;
}

/** Zpětně kompatibilní obal — worker konzumuje jen seznam URL. */
export async function generateCandidateUrls(input: {
  leadGroup: string;
  round: number;
  openaiKey?: string;
}): Promise<string[]> {
  const { urls } = await generateCandidateUrlsWithDiagnostics(input);
  return urls;
}
