import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-discover — Fáze 5A + 5C + 5E + 6: automatické NAVRŽENÍ nových
// firemních leadů, s volitelným dohledáním veřejného kontaktního e-mailu
// vlastním procházením webu firmy
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.0, 17.1, 17.7, 17.8.2, 17.8.4, 17.11)
//
// ⚠️ Spouští VÝHRADNĚ člověk s oprávněním `sales_leads.manage` kliknutím v UI.
//    AI smí POUZE navrhnout firmy a uložit je jako `navrzeny` (přes RPC
//    sales_lead_propose / sales_lead_propose_with_contact). AI NIKDY:
//      • nepřipraví finální odeslání,
//      • neodešle e-mail / nezapíše do email_queue,
//      • nevytvoří odesílatelný stav (jen `navrzeny`),
//      • nevyplní ověřený odesílací kontakt (contact_email zůstává null).
//    Každý návrh musí projít RUČNÍM lidským schválením (`navrzeny → novy`).
//
// Fáze 6 — discovery NEZAHAZUJE použitelné firmy jen kvůli chybějícímu
// e-mailu (oprava Fáze 5D/5E, kde příliš přísné ověřování často nevytvořilo
// žádný lead):
//   • Každá firma s vyplněným názvem je „použitelná" a VŽDY se pokusí uložit
//     jako lead ve stavu `navrzeny` — bez ohledu na to, jestli se e-mail najde.
//   • Systém se STÁLE pokusí dohledat veřejný e-mail procházením webu firmy
//     (homepage → kontakt/about odkazy → mailto/text — viz Fáze 5E níže).
//     Pokud e-mail najde, uloží ho jako `proposed_contact_email` v JEDNÉ
//     atomické operaci s vytvořením leadu (RPC `sales_lead_propose_with_contact`).
//     Pokud e-mail NENAJDE, lead se STEJNĚ uloží — jen bez navrženého e-mailu
//     (RPC `sales_lead_propose`) — k ručnímu doplnění člověkem.
//   • Jediný důvod, proč lead nevznikne, je RPC-level dedup/blokace (duplicitní
//     IČO/doména, firma už je partner, blokovaná doména/e-mail) — nikdy jen
//     proto, že e-mail nebyl nalezen.
//
// Fáze 5E — SYSTÉM SÁM dohledá e-mail výhradně na WEBU FIRMY (nahrazuje
// spoléhání na AI tvrzenou zdrojovou URL z Fáze 5C/5D):
//   • AI smí stále navrhnout firmu, web a VOLITELNĚ e-mail — ten se ale bere
//     JEN JAKO NÁPOVĚDA, nikdy jako důkaz. Backend prochází VÝHRADNĚ web
//     firmy (`website`): homepage → odkazy typu kontakt/contact/kontakty/
//     o-nas/o-spolecnosti/about/about-us/impressum → `mailto:` odkazy i
//     prostý text stránky.
//   • Firemní web bez protokolu (např. "moser.com", "www.vifsports.cz") se
//     normalizuje na `https://…` (`normalizeCompanyWebsite`). Už platné
//     `http://`/`https://` se zachová beze změny; neplatné/nebezpečné
//     hodnoty se bezpečně ignorují (firma se i tak uloží — jen bez e-mailu).
//   • `email_source_url` (AI nápověda) se prochází JEN pokud je bezpečná A
//     na STEJNÉ doméně jako `website` (dovoleno: přesně stejný host, nebo jen
//     rozdíl v `www.` prefixu) — jinak se úplně ignoruje. Nikdy se neprochází
//     cizí domény, katalogy ani sociální sítě jako "zdroj firmy".
//   • Použije se jen e-mail, který byl SKUTEČNĚ nalezen ve staženém obsahu
//     (viz `extractMailtoEmails`/`extractTextEmails`). Pokud AI navržený
//     e-mail odpovídá některému skutečně nalezenému, použije se (kvůli
//     provenance); jinak se použije první jiný veřejný e-mail nalezený na
//     webu — AI návrh se NIKDY nepoužije bez nálezu na stránce.
//
// Bezpečnost procházení (SSRF ochrana, sdílená s Fází 5D):
//   • jen `http/https`; blokovány lokální/privátní/link-local adresy
//     (`isSafePublicUrl`, volá se pro KAŽDOU navštívenou i redirect URL);
//   • redirecty ŘEŠENÉ RUČNĚ (`redirect: "manual"`), max `MAX_REDIRECTS` (3)
//     hopů, každý cíl znovu ověřen;
//   • timeout na stránku (8 s), limit velikosti stažené stránky (2 MB);
//   • max `MAX_PAGES_PER_COMPANY` (5) stažených stránek na jednu firmu.
//
// Ochrany: limit počtu návrhů na běh; dedup + suppression + partner blokace
// řeší RPC sales_lead_propose_with_contact server-side (bezpečná bariéra).
//
// Auth: JWT → getUser → has_admin_permission('sales_leads.manage').
// Vytváření přes service_role RPC (obchází RLS, ale jen `navrzeny`).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = 25000;
const MAX_PER_RUN = 10;        // tvrdý strop návrhů na jeden běh
const DEFAULT_LIMIT = 5;

const ALLOWED_GROUPS = new Set([
  "e-shopy", "auto-moto", "luxusni-zbozi", "sport",
  "cestovani", "gastronomie", "lokalni-sluzby", "jine",
]);

const DISCOVER_SYSTEM_PROMPT = `Jsi rešeršní asistent OneMil. Navrhni reálné české firmy vhodné k oslovení do věrnostního programu OneMil pro danou skupinu.

PŘÍSNÉ ZÁKAZY (nikdy neporušit):
- NIKDY NEVYMÝŠLEJ e-mail, telefon ani jméno osoby. Vracej jen název firmy, veřejný web, případně IČO a město, pokud je veřejně známé; jinak vynech.
- Pokud e-mail firmy neznáš jistě z veřejného webu, vrať email = null — nehádej, backend si e-mail dohledá sám na webu firmy.
- NETVRDÍ partnerství ani dohodu s OneMil.
- NESLIBUJ žádné ceny ani podmínky.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.

Výstup: vrať POUZE validní JSON objekt {"companies": [...]}. Každá položka:
{"company_name": string, "website": string|null, "ico": string|null, "city": string|null, "industry": string|null, "lead_quality": 0|1|2|3, "rationale": string, "email": string|null}
lead_quality = odhad vhodnosti (0 neznámé … 3 vysoká). rationale = krátké zdůvodnění (neveřejné, interní). "email" je JEN VOLITELNÁ NÁPOVĚDA, pokud si jsi jistý — backend si e-mail vždy sám ověří/dohledá na webu firmy, tvůj odhad se nikdy nepoužije bez skutečného nálezu na stránce. Vše je neověřený návrh k ruční kontrole člověkem.`;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ProposedCompany {
  company_name?: unknown;
  website?: unknown;
  ico?: unknown;
  city?: unknown;
  industry?: unknown;
  lead_quality?: unknown;
  rationale?: unknown;
  email?: unknown;
  // Zachováno pro zpětnou kompatibilitu se staršími AI odpověďmi (Fáze 5C/5D);
  // použije se JEN jako volitelná nápověda na kandidátní stránku KE STEJNÉMU
  // webu firmy (musí být na stejné doméně jako `website`) — nikdy jako
  // náhrada za chybějící `website` a nikdy jako důkaz e-mailu bez
  // skutečného nálezu na stránce.
  email_source_url?: unknown;
}

// Bezpečná validace formátu e-mailu — bez vymýšlení, jen důvěryhodný formát.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Obecné hledání kandidátních e-mailů v normalizovaném textu stránky.
const FIND_EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;

// ── Sdílená bezpečnostní/síťová vrstva (Fáze 5D + 5E) ───────────────────────
const SOURCE_FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BODY_BYTES = 2_000_000; // 2 MB — obranný limit proti velkým stránkám
const MAX_REDIRECTS = 3;                 // redirecty se řeší ručně — každý hop se znovu ověří (SSRF)
const MAX_PAGES_PER_COMPANY = 5;         // tvrdý strop stažených stránek na jednu firmu (Fáze 5E)

const CONTACT_LINK_KEYWORDS = [
  "kontakt", "contact", "kontakty", "o-nas", "o-spolecnosti", "about", "about-us", "impressum",
];

// Domény, které se v praxi objevují jako placeholdery/šablony/trackery, nikdy
// jako skutečný firemní kontakt — filtrují false-positive nálezy z textu.
const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "domain.com", "yourdomain.com",
  "yoursite.com", "email.com", "test.com", "w3.org", "schema.org", "sentry.io",
  "wixpress.com", "godaddy.com", "placeholder.com",
]);

/**
 * Bezpečnostní kontrola URL před fetchem (SSRF ochrana):
 *  - jen http/https,
 *  - žádné lokální/privátní/loopback/link-local adresy nebo hostnames,
 *  - žádné credentials v URL.
 * Volá se pro KAŽDOU navštívenou URL i pro KAŽDÝ redirect hop zvlášť — nikdy
 * se nesmí důvěřovat výslednému místu bez opětovné kontroly.
 */
function isSafePublicUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) return false;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (hostname === "0.0.0.0") return false;

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return false; // loopback
    if (a === 10) return false; // private
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 169 && b === 254) return false; // link-local
    if (a === 0) return false;
  }

  if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return false;
  }

  return true;
}

/**
 * Normalizuje firemní web na plnou `https://` (resp. zachovanou `http://`)
 * URL. AI často vrací web bez protokolu ("moser.com", "www.vifsports.cz")
 * nebo občas i v markdown formátu odkazu ("[www.moser.com](https://www.moser.com)")
 * — v obou případech se z toho bezpečně udělá platná URL. Hodnoty, které
 * nevypadají jako doména ani platná URL, se vrátí jako `null` (přeskočí se).
 */
function normalizeCompanyWebsite(raw: string): string | null {
  let trimmed = raw.trim();
  if (!trimmed) return null;

  // AI občas zabalí web do markdown odkazu — vytáhnout jen samotnou URL.
  const markdownMatch = trimmed.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdownMatch) {
    trimmed = markdownMatch[1].trim();
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return isSafePublicUrl(trimmed) ? trimmed : null;
  }

  // Vypadá to jako doména (případně s cestou) bez protokolu? → doplnit https://.
  const domainLike = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/[^\s]*)?$/i;
  if (!domainLike.test(trimmed)) return null;

  const candidate = `https://${trimmed}`;
  return isSafePublicUrl(candidate) ? candidate : null;
}

function stripWwwPrefix(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

/** Stejná firemní doména = přesně stejný host, nebo rozdíl jen v `www.` prefixu. */
function isSameCompanyDomain(hostA: string, hostB: string): boolean {
  return stripWwwPrefix(hostA) === stripWwwPrefix(hostB);
}

/**
 * Připraví DVĚ normalizované varianty stažené stránky pro hledání e-mailu:
 *  1) "loose" — HTML entity dekódované, tagy odstraněné, mezery sjednocené,
 *     lowercase. Najde e-mail zapsaný normálně v běžném textu.
 *  2) "compact" — navíc odstraní VŠECHNY mezery kolem `@` a `.` (a mezi nimi),
 *     takže obfuskovaný zápis typu "info @ firma . cz" se porovná jako
 *     "info@firma.cz".
 */
function buildEmailSearchVariants(html: string): { loose: string; compact: string } {
  const loose = html
    .replace(/&amp;/gi, "&")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ") // odstranit HTML tagy, ale zachovat text kolem
    .replace(/\s+/g, " ")
    .toLowerCase();

  let compact = loose;
  let prevLength: number;
  do {
    prevLength = compact.length;
    compact = compact.replace(/\s+@/g, "@").replace(/@\s+/g, "@").replace(/\s+\./g, ".").replace(/\.\s+/g, ".");
  } while (compact.length !== prevLength);

  return { loose, compact };
}

function isLikelyPlaceholderEmail(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  return PLACEHOLDER_EMAIL_DOMAINS.has(domain);
}

/** Vytáhne e-maily z `mailto:` odkazů v SUROVÉM HTML (před odstraněním tagů). */
function extractMailtoEmails(html: string): string[] {
  const emails: string[] = [];
  const re = /mailto:([^"'?&>\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let addr = m[1];
    try { addr = decodeURIComponent(addr); } catch { /* keep raw */ }
    addr = addr.trim().toLowerCase();
    if (EMAIL_RE.test(addr) && !isLikelyPlaceholderEmail(addr)) emails.push(addr);
  }
  return emails;
}

/** Vytáhne e-maily z normalizovaného textu stránky (obě varianty — loose i compact). */
function extractTextEmails(variants: { loose: string; compact: string }): string[] {
  const emails: string[] = [];
  for (const text of [variants.loose, variants.compact]) {
    FIND_EMAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FIND_EMAIL_RE.exec(text))) {
      const addr = m[0];
      if (EMAIL_RE.test(addr) && !isLikelyPlaceholderEmail(addr) && !emails.includes(addr)) {
        emails.push(addr);
      }
    }
  }
  return emails;
}

/**
 * Najde odkazy typu kontakt/contact/kontakty/o-nas/o-spolecnosti/about/
 * about-us/impressum na stránce — jen v rámci STEJNÉHO hostitele jako
 * `originHost` (nesledujeme jinam mimo web firmy) a jen bezpečné URL.
 */
function extractContactLikeLinks(html: string, baseUrl: string, originHost: string): string[] {
  const links: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const hrefRaw = m[1];
    const text = m[2].replace(/<[^>]*>/g, " ").toLowerCase();
    const hrefLower = hrefRaw.toLowerCase();
    const matchesKeyword = CONTACT_LINK_KEYWORDS.some((k) => hrefLower.includes(k) || text.includes(k));
    if (!matchesKeyword) continue;

    let absolute: string;
    try {
      absolute = new URL(hrefRaw, baseUrl).toString();
    } catch {
      continue;
    }
    if (!isSafePublicUrl(absolute)) continue;

    let host: string;
    try {
      host = new URL(absolute).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!isSameCompanyDomain(host, originHost)) continue; // zůstat jen na webu firmy

    links.push(absolute);
  }
  return Array.from(new Set(links));
}

/** Přečte tělo odpovědi jako text, s obranným limitem velikosti (MAX_SOURCE_BODY_BYTES). */
async function readBodyWithLimit(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();

  const decoder = new TextDecoder();
  let html = "";
  let received = 0;
  while (received < MAX_SOURCE_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch { /* best-effort */ }
  return html;
}

/**
 * Bezpečně stáhne jednu stránku. Redirecty se řeší RUČNĚ (`redirect: "manual"`),
 * max `MAX_REDIRECTS` hopů, každý cíl znovu ověřen přes `isSafePublicUrl`.
 * Vrací `null` při jakémkoli selhání (timeout, síť, nebezpečná/neplatná URL,
 * non-2xx odpověď, vyčerpaný limit redirectů).
 */
async function fetchSafePage(url: string): Promise<{ finalUrl: string; html: string } | null> {
  let currentUrl = url;
  if (!isSafePublicUrl(currentUrl)) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "OneMilSalesLeadVerifier/1.0" },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    const isRedirectStatus = res.status >= 300 && res.status < 400;
    if (res.type === "opaqueredirect" || isRedirectStatus) {
      const location = res.headers.get("location");
      if (!location) return null;
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return null;
      }
      if (!isSafePublicUrl(nextUrl)) return null;
      if (hop === MAX_REDIRECTS) return null;
      currentUrl = nextUrl;
      continue;
    }

    if (!res.ok) return null;
    const html = await readBodyWithLimit(res);
    return { finalUrl: currentUrl, html };
  }

  return null;
}

type CrawlResult =
  | { found: true; email: string; sourceUrl: string }
  | { found: false };

/**
 * Fáze 5E — systém SÁM dohledá veřejný e-mail firmy procházením jejího webu.
 *
 * `website` MUSÍ být platná, bezpečná, již normalizovaná URL firemního webu
 * (viz `normalizeCompanyWebsite` — volající zajistí, že sem nikdy nepřijde
 * prázdná hodnota ani cizí doména). Je to JEDINÝ zdroj pravdy pro to, čí web
 * se prochází — nikdy se nenahrazuje AI navrženou URL.
 *
 * `aiHintEmail` a `aiSourceUrl` jsou POUZE nápověda z AI návrhu. `aiSourceUrl`
 * se prochází jako kandidátní stránka JEN pokud je bezpečná A na STEJNÉ
 * doméně jako `website` (přesně stejný host, nebo jen rozdíl v `www.`
 * prefixu) — jinak se úplně ignoruje (nikdy se neprochází cizí doména,
 * katalog ani sociální síť jako "zdroj firmy"). Bez ohledu na to se vždy
 * prochází i samotná homepage a z ní nalezené kontakt/about odkazy (max
 * `MAX_PAGES_PER_COMPANY` stránek celkem).
 *
 * Použije se JEN e-mail skutečně nalezený v `mailto:` odkazu nebo textu
 * některé stažené stránky. AI navržený e-mail se preferuje jen pokud se
 * shoduje s takto skutečně nalezeným — jinak se uloží první jiný nalezený.
 */
async function crawlCompanyWebsite(
  website: string,
  aiHintEmail: string,
  aiSourceUrl: string,
): Promise<CrawlResult> {
  if (!website || !isSafePublicUrl(website)) return { found: false };

  let originHost: string;
  try {
    originHost = new URL(website).hostname.toLowerCase();
  } catch {
    return { found: false };
  }

  const seen = new Set<string>();
  const queue: string[] = [];
  const pushUnique = (u: string) => {
    if (!seen.has(u)) {
      seen.add(u);
      queue.push(u);
    }
  };

  // AI nápověda (email_source_url) se prochází JEN na stejné doméně jako
  // firemní web — jinak by šlo o "výmluvu" na cizí katalog/soc. síť.
  if (aiSourceUrl && aiSourceUrl !== website && isSafePublicUrl(aiSourceUrl)) {
    let hintHost = "";
    try {
      hintHost = new URL(aiSourceUrl).hostname.toLowerCase();
    } catch {
      hintHost = "";
    }
    if (hintHost && isSameCompanyDomain(hintHost, originHost)) {
      pushUnique(aiSourceUrl);
    }
  }
  pushUnique(website);

  const foundEmails = new Map<string, string>(); // email → stránka, kde byl nalezen
  let pagesFetched = 0;

  while (queue.length > 0 && pagesFetched < MAX_PAGES_PER_COMPANY) {
    const url = queue.shift()!;
    const page = await fetchSafePage(url);
    pagesFetched++;
    if (!page) continue;

    const mailtoEmails = extractMailtoEmails(page.html);
    const variants = buildEmailSearchVariants(page.html);
    const textEmails = extractTextEmails(variants);
    for (const email of [...mailtoEmails, ...textEmails]) {
      if (!foundEmails.has(email)) foundEmails.set(email, page.finalUrl);
    }
    if (foundEmails.size > 0) break;

    // Kandidátní kontakt/about odkazy hledáme jen na skutečné homepage webu
    // firmy (ne na AI-navržené zdrojové URL, která už sama může být kontakt
    // stránka).
    if (url === website) {
      const links = extractContactLikeLinks(page.html, page.finalUrl, originHost);
      for (const link of links) {
        if (pagesFetched + queue.length < MAX_PAGES_PER_COMPANY) pushUnique(link);
      }
    }
  }

  if (foundEmails.size === 0) return { found: false };

  if (aiHintEmail && foundEmails.has(aiHintEmail)) {
    return { found: true, email: aiHintEmail, sourceUrl: foundEmails.get(aiHintEmail)! };
  }
  const first = foundEmails.entries().next().value as [string, string];
  return { found: true, email: first[0], sourceUrl: first[1] };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // ── 1. Auth: JWT + sales_leads.manage ────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "missing_authorization_header" }, 401);
    }
    const jwtToken = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwtToken);
    const caller = userData?.user;
    if (userError || !caller) {
      return jsonResponse({ success: false, error: "invalid_authorization_token" }, 401);
    }
    const { data: canManage } = await supabaseAdmin.rpc("has_admin_permission", {
      check_key: "sales_leads.manage",
      check_user_id: caller.id,
    });
    if (canManage !== true) {
      return jsonResponse({ success: false, error: "access_denied_sales_leads_manage_only" }, 403);
    }

    // ── 2. Parse + validace vstupu ───────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ success: false, error: "invalid_json" }, 400);
    }
    const leadGroup = typeof body.lead_group === "string" ? body.lead_group.trim() : "";
    if (!ALLOWED_GROUPS.has(leadGroup)) {
      return jsonResponse({ success: false, error: "invalid_lead_group" }, 400);
    }
    let limit = typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT;
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_PER_RUN) limit = MAX_PER_RUN; // tvrdý strop

    // ── 3. OpenAI — návrh firem ──────────────────────────────────────────────
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ success: false, error: "ai_not_configured" }, 503);
    }

    const userPrompt = `Skupina: ${leadGroup}\nPočet návrhů: ${limit}\n\nNavrhni ${limit} reálných českých firem pro tuto skupinu dle pravidel. Vrať JSON {"companies":[...]}.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let raw = "";
    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.5,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: DISCOVER_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!aiRes.ok) return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
      const aiJson = await aiRes.json();
      raw = (aiJson?.choices?.[0]?.message?.content ?? "").trim();
    } catch {
      return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
    } finally {
      clearTimeout(timer);
    }

    let companies: ProposedCompany[] = [];
    try {
      const parsed = JSON.parse(raw) as { companies?: unknown };
      companies = Array.isArray(parsed.companies) ? (parsed.companies as ProposedCompany[]) : [];
    } catch {
      return jsonResponse({ success: false, error: "ai_invalid_format" }, 502);
    }
    // Nikdy víc než limit (a strop).
    companies = companies.slice(0, limit);

    // ── 4. Uložení návrhů — Fáze 6: KAŽDÁ použitelná firma (má název) se
    // vždy pokusí uložit jako lead, bez ohledu na to, jestli se e-mail najde.
    // E-mail se dohledá jen jako BONUS (Fáze 5E) — pokud se nenajde, lead se
    // STEJNĚ uloží, jen bez proposed_contact_email. Jediný důvod, proč lead
    // nevznikne, je RPC-level dedup/blokace (duplicitní IČO/doména, firma už
    // je partner, blokovaná doména/e-mail) — nikdy jen kvůli chybějícímu
    // e-mailu.
    let created = 0;
    let createdWithEmail = 0;
    let createdWithoutEmail = 0;
    let skipped = 0;
    let errored = 0;
    const details: { company: string; outcome: string; reason?: string; has_email?: boolean }[] = [];

    for (const c of companies) {
      const name = typeof c.company_name === "string" ? c.company_name.trim() : "";
      if (!name) { errored++; continue; }

      const websiteRaw = typeof c.website === "string" ? c.website.trim() : "";
      const website = websiteRaw ? normalizeCompanyWebsite(websiteRaw) : null;
      const aiEmailRaw = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
      const aiHintEmail = EMAIL_RE.test(aiEmailRaw) ? aiEmailRaw : "";
      const aiSourceUrlRaw = typeof c.email_source_url === "string" ? c.email_source_url.trim() : "";
      const aiSourceUrl = aiSourceUrlRaw ? (normalizeCompanyWebsite(aiSourceUrlRaw) ?? "") : "";

      // ── Fáze 5E (bonus, nikdy blokující): pokusit se dohledat e-mail
      // procházením webu firmy — AI e-mail/URL jsou jen nápověda. Pokud web
      // chybí nebo e-mail nenajde, `crawl.found` bude false a lead se i tak
      // uloží (Fáze 6) — jen bez proposed_contact_email. ──────────────────
      const crawl = website ? await crawlCompanyWebsite(website, aiHintEmail, aiSourceUrl) : { found: false as const };

      const qualityRaw = typeof c.lead_quality === "number" ? Math.floor(c.lead_quality) : 0;
      const quality = Math.min(3, Math.max(0, qualityRaw));
      const discoveryMeta = {
        model: AI_MODEL,
        rationale: typeof c.rationale === "string" ? c.rationale : null,
        run_at: new Date().toISOString(),
        run_by: caller.id,
      };

      if (crawl.found) {
        // Lead + navržený e-mail vzniknou atomicky v jednom kroku (Fáze 5C/5D).
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("sales_lead_propose_with_contact", {
          p_created_by: caller.id,
          p_company_name: name,
          p_lead_group: leadGroup,
          p_discovery_source: "ai_navrh",
          p_email: crawl.email,
          p_email_source_url: crawl.sourceUrl,
          p_discovery_meta: discoveryMeta,
          p_website: website,
          p_ico: typeof c.ico === "string" ? c.ico : null,
          p_city: typeof c.city === "string" ? c.city : null,
          p_industry: typeof c.industry === "string" ? c.industry : null,
          p_lead_quality: quality,
          p_proposed_by: "ai",
        });

        if (rpcErr) { errored++; details.push({ company: name, outcome: "error", reason: "rpc_failed" }); continue; }
        const res = (rpcData ?? {}) as { outcome?: string; reason?: string };

        if (res.outcome === "created") {
          created++;
          createdWithEmail++;
          details.push({ company: name, outcome: "created", has_email: true });
        } else if (res.outcome === "skipped") {
          skipped++;
          details.push({ company: name, outcome: "skipped", reason: res.reason });
        } else {
          errored++;
          details.push({ company: name, outcome: "error", reason: res.reason });
        }
      } else {
        // Fáze 6: e-mail se nenašel (nebo firma nemá web) — lead se i tak
        // uloží, jen bez proposed_contact_email. `sales_lead_propose`
        // (Fáze 5A) nevyplňuje žádný kontakt — jen bezpečný základní návrh.
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("sales_lead_propose", {
          p_created_by: caller.id,
          p_company_name: name,
          p_lead_group: leadGroup,
          p_discovery_source: "ai_navrh",
          p_lead_quality: quality,
          p_discovery_meta: discoveryMeta,
          p_website: website || null,
          p_ico: typeof c.ico === "string" ? c.ico : null,
          p_city: typeof c.city === "string" ? c.city : null,
          p_industry: typeof c.industry === "string" ? c.industry : null,
        });

        if (rpcErr) { errored++; details.push({ company: name, outcome: "error", reason: "rpc_failed" }); continue; }
        const res = (rpcData ?? {}) as { outcome?: string; reason?: string };

        if (res.outcome === "created") {
          created++;
          createdWithoutEmail++;
          details.push({ company: name, outcome: "created", has_email: false });
        } else if (res.outcome === "skipped") {
          skipped++;
          details.push({ company: name, outcome: "skipped", reason: res.reason });
        } else {
          errored++;
          details.push({ company: name, outcome: "error", reason: res.reason });
        }
      }
    }

    return jsonResponse({
      success: true,
      lead_group: leadGroup,
      requested: limit,
      proposed_by_ai: companies.length,
      created,
      created_with_email: createdWithEmail,
      created_without_email: createdWithoutEmail,
      skipped,
      errored,
      details,
    });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
