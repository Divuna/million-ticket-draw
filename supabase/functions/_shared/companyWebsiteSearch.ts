// ============================================================================
// companyWebsiteSearch — aktivní DOHLEDÁNÍ pravděpodobného oficiálního webu
// firmy pomocí webového vyhledávání OpenAI (model *-search-preview).
//
// AI zde NENÍ zdrojem pravdy. Vrací jen KANDIDÁTNÍ URL, které backend pořád
// nezávisle ověří přes ARES + HTTP + kontrolu identity (companyWebsiteVerifier).
// Účel: firmu nelze spolehlivě najít jen z odhadu domény — proto použijeme
// reálné vyhledávání a jako kandidáty bereme skutečně citované odkazy.
//
// Reuse existujícího OPENAI_API_KEY — žádný nový secret.
// ============================================================================

const SEARCH_MODEL = Deno.env.get("SALES_LEADS_SEARCH_MODEL") ?? "gpt-4o-mini-search-preview";
const SEARCH_TIMEOUT_MS = 20000;
const MAX_SEARCH_CANDIDATES = 4;

// Domény, které NIKDY nejsou „oficiální web firmy": sociální sítě, katalogy,
// mapy, wiki, tech/hostingové domény. Vyhledávač je často vrátí jako první,
// ale nesmí projít jako firemní homepage.
const NON_OFFICIAL_HOST_SUFFIXES = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "youtu.be", "tiktok.com", "pinterest.com",
  "google.com", "google.cz", "goo.gl", "maps.app.goo.gl",
  "wikipedia.org", "wikiwand.com",
  "firmy.cz", "zivefirmy.cz", "najisto.centrum.cz", "najisto.cz", "edb.cz",
  "kurzy.cz", "rejstrik-firem.kurzy.cz", "or.justice.cz", "justice.cz",
  "ares.gov.cz", "merk.cz", "detail.firmy.cz",
  "heureka.cz", "zbozi.cz", "glami.cz",
  "readymag.com", "wixsite.com", "wix.com", "webnode.cz", "webnode.com",
  "sentry.io", "myshoptet.com", "eshop-rychle.cz",
];

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>()\]]+/gi;

interface OpenAiAnnotation {
  type?: string;
  url_citation?: { url?: string };
  url?: string;
}

interface OpenAiSearchResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: OpenAiAnnotation[];
    };
  }>;
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

function collectUrls(res: OpenAiSearchResponse): string[] {
  const urls: string[] = [];
  const msg = res.choices?.[0]?.message;
  // 1) Citované zdroje (nejspolehlivější — reálné výsledky vyhledávání).
  for (const a of msg?.annotations ?? []) {
    const u = a?.url_citation?.url ?? a?.url;
    if (typeof u === "string") urls.push(u);
  }
  // 2) URL zmíněné přímo v textu odpovědi (fallback).
  const content = typeof msg?.content === "string" ? msg.content : "";
  const matches = content.match(URL_IN_TEXT_RE) ?? [];
  for (const m of matches) urls.push(m.replace(/[),.;]+$/, ""));
  return urls;
}

export interface OfficialWebsiteCandidate {
  url: string;
  source: string;
}

/**
 * Aktivně dohledá kandidátní oficiální weby firmy přes webové vyhledávání.
 * Vrací homepage URL (schéma+host) v pořadí relevance, bez sociálních sítí a
 * katalogů. Prázdné pole = nic vhodného nenalezeno. Chyba/nedostupnost = [].
 */
export async function findOfficialWebsiteCandidates(input: {
  companyName: string;
  city?: string | null;
  ico?: string | null;
  openaiKey: string;
}): Promise<OfficialWebsiteCandidate[]> {
  const name = input.companyName.trim();
  if (!name || !input.openaiKey) return [];

  const parts = [`Najdi OFICIÁLNÍ firemní web české firmy „${name}“`];
  if (input.city) parts.push(`(město: ${input.city})`);
  if (input.ico) parts.push(`(IČO: ${input.ico})`);
  const prompt =
    `${parts.join(" ")}. ` +
    `Vrať POUZE reálnou URL homepage oficiálního webu firmy, každou na samostatném řádku. ` +
    `NEVracej sociální sítě (Facebook, Instagram, LinkedIn), katalogy (Firmy.cz, Živéfirmy), ` +
    `mapy ani Wikipedii. Pokud oficiální web neznáš jistě, nevracej nic.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let json: OpenAiSearchResponse;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openaiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: SEARCH_MODEL,
        // search-preview modely nepodporují temperature ani response_format.
        web_search_options: {},
        messages: [
          {
            role: "system",
            content:
              "Jsi vyhledávací asistent. Používáš webové vyhledávání a vracíš jen skutečné, existující URL. Nikdy si URL nevymýšlíš.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return [];
    json = (await res.json()) as OpenAiSearchResponse;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }

  const homepages: string[] = [];
  const seen = new Set<string>();
  for (const rawUrl of collectUrls(json)) {
    const host = safeHost(rawUrl);
    if (!host || isNonOfficialHost(host)) continue;
    const homepage = toHomepage(rawUrl);
    if (!homepage) continue;
    const key = host.replace(/^www\./, "");
    if (seen.has(key)) continue;
    seen.add(key);
    homepages.push(homepage);
    if (homepages.length >= MAX_SEARCH_CANDIDATES) break;
  }

  return homepages.map((url) => ({ url, source: "web_search" }));
}
