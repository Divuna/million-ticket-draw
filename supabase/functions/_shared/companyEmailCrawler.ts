import { isNonOfficialWebsiteUrl } from "./officialWebsitePolicy.ts";

// ============================================================================
// companyEmailCrawler — dohledání VEŘEJNÉHO kontaktního e-mailu na OVĚŘENÉM
// webu firmy. Prochází homepage + kontaktní/o-nás odkazy (jen stejná doména),
// čte mailto: i textové e-maily, filtruje placeholder/technické domény.
//
// Volá se AŽ na webu, který prošel nezávislým ověřením identity
// (companyWebsiteVerifier). AI odhad e-mailu je jen nápověda, nikdy důkaz.
// SSRF ochrana: jen http/https, blokované lokální/privátní adresy, ruční
// redirecty (max 3), timeout, limit velikosti stránky, max stránek na firmu.
// ============================================================================

// Přísná syntaktická validace — lokální část BEZ „:" a dalších neplatných znaků.
export const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const FIND_EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;
const SOURCE_FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BODY_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_PAGES_PER_COMPANY = 5;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const CONTACT_LINK_KEYWORDS = [
  "kontakt", "contact", "kontakty", "o-nas", "o-spolecnosti", "about", "about-us", "impressum",
];

// Placeholder + cizí technické/hostingové domény — NIKDY nebrat jako firemní kontakt.
const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "domain.com", "yourdomain.com",
  "yoursite.com", "email.com", "test.com", "w3.org", "schema.org", "sentry.io",
  "wixpress.com", "godaddy.com", "placeholder.com", "readymag.com", "wix.com",
  "squarespace.com", "shopify.com", "myshoptet.com", "cloudflare.com",
]);

/**
 * Očistí a syntakticky ověří e-mail. Odstraní opakovaný `mailto:` prefix,
 * obalové znaky (uvozovky, závorky, <>), koncové zpětné lomítko a interpunkci.
 * Vrátí platnou adresu, nebo null u malformovaného vstupu — do DB se tak
 * NIKDY nedostane adresa jako `mailto:mailto:x@y.cz` nebo `x@y.cz\`.
 */
export function sanitizeEmail(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[<("'\s]+/, "");
  while (s.startsWith("mailto:")) s = s.slice("mailto:".length);
  s = s.split(/[\s"'<>]/)[0] ?? "";
  s = s.replace(/^[.,;:<(\[{\\/]+/, "").replace(/[.,;:>)\]}\\/]+$/, "");
  if (!EMAIL_RE.test(s)) return null;
  if (s.includes("mailto") || s.includes(":")) return null;
  return s;
}

function normalizeCompanyName(name: string): string {
  return String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Poslední dvě části hostname (aproximace registrovatelné domény pro .cz). */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return labels.length <= 2 ? labels.join(".") : labels.slice(-2).join(".");
}

/**
 * E-mail smí být uložen jen když patří ověřenému webu / firmě:
 *   • jeho registrovatelná doména == doméně ověřeného webu, NEBO
 *   • label jeho domény odpovídá tokenu názvu firmy (stejná značka).
 * Blokuje např. `ondrej@aust.cz` na webu `mediar.cz` u „Wunderman Thompson".
 */
export function emailBelongsToCompany(email: string, siteHost: string, companyName: string): boolean {
  const eHost = email.split("@")[1] ?? "";
  if (!eHost) return false;
  const eReg = registrableDomain(eHost);
  const sReg = registrableDomain(siteHost);
  if (eReg && eReg === sReg) return true;
  const label = eReg.split(".")[0] ?? "";
  if (!label) return false;
  const tokens = normalizeCompanyName(companyName).split(" ").filter((t) => t.length >= 3);
  return tokens.some((t) => label === t || label.includes(t) || t.includes(label));
}

export function isSafePublicUrl(rawUrl: string): boolean {
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
    if (a === 127) return false;
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 0) return false;
  }

  const ipv6Host = hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (ipv6Host === "::1" || ipv6Host.startsWith("fe80:") || ipv6Host.startsWith("fc") || ipv6Host.startsWith("fd")) {
    return false;
  }

  return true;
}

export function normalizeCompanyWebsite(raw: string): string | null {
  let trimmed = raw.trim();
  if (!trimmed) return null;

  const markdownMatch = trimmed.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdownMatch) trimmed = markdownMatch[1].trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return isSafePublicUrl(trimmed) ? trimmed : null;
  }

  const domainLike = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/[^\s]*)?$/i;
  if (!domainLike.test(trimmed)) return null;

  const candidate = `https://${trimmed}`;
  return isSafePublicUrl(candidate) ? candidate : null;
}

function stripWwwPrefix(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isSameCompanyDomain(hostA: string, hostB: string): boolean {
  return stripWwwPrefix(hostA) === stripWwwPrefix(hostB);
}

function stripNonContentHtml(html: string): string {
  return html
    .replace(/<!--\s*[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
}

function buildEmailSearchVariants(html: string): { loose: string; compact: string } {
  const loose = stripNonContentHtml(html)
    .replace(/&amp;/gi, "&")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ")
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

export function isLikelyPlaceholderEmail(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  return PLACEHOLDER_EMAIL_DOMAINS.has(domain);
}

export function extractMailtoEmails(html: string): string[] {
  const emails: string[] = [];
  const re = /mailto:([^"'?&>\s]+)/gi;
  let m: RegExpExecArray | null;
  const contentHtml = stripNonContentHtml(html);
  while ((m = re.exec(contentHtml))) {
    let addr = m[1];
    try { addr = decodeURIComponent(addr); } catch { /* keep raw */ }
    const clean = sanitizeEmail(addr);
    if (clean && !isLikelyPlaceholderEmail(clean) && !emails.includes(clean)) emails.push(clean);
  }
  return emails;
}

export function extractTextEmails(html: string): string[] {
  const variants = buildEmailSearchVariants(html);
  const emails: string[] = [];
  for (const text of [variants.loose, variants.compact]) {
    FIND_EMAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FIND_EMAIL_RE.exec(text))) {
      const clean = sanitizeEmail(m[0]);
      if (clean && !isLikelyPlaceholderEmail(clean) && !emails.includes(clean)) {
        emails.push(clean);
      }
    }
  }
  return emails;
}

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
    if (!isSameCompanyDomain(host, originHost)) continue;

    links.push(absolute);
  }
  return Array.from(new Set(links));
}

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
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "cs,en;q=0.8",
        },
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

export type VerifiedSourceEmailResult =
  | { verified: true; email: string; sourceUrl: string }
  | { verified: false; reason:
    | "invalid_email"
    | "invalid_source_url"
    | "source_not_on_verified_website"
    | "non_official_third_party"
    | "source_fetch_failed"
    | "redirect_left_verified_website"
    | "email_not_found_on_verified_website" };

/**
 * Verifies one exact AI candidate against one exact source page. It never
 * crawls a homepage or guesses an address: the candidate and source URL must
 * both be supplied, every redirect must remain on the already verified host,
 * and the exact normalized address must exist in visible text or a mailto link.
 */
export async function verifyEmailOnOfficialSourcePage(input: {
  officialWebsite: string;
  candidateEmail: string;
  sourceUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedSourceEmailResult> {
  const email = input.candidateEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { verified: false, reason: "invalid_email" };
  if (!isSafePublicUrl(input.officialWebsite) || !isSafePublicUrl(input.sourceUrl)) {
    return { verified: false, reason: "invalid_source_url" };
  }
  if (isNonOfficialWebsiteUrl(input.sourceUrl)) {
    return { verified: false, reason: "non_official_third_party" };
  }

  let officialHost: string;
  let currentUrl = input.sourceUrl;
  try {
    officialHost = new URL(input.officialWebsite).hostname.toLowerCase();
    const sourceHost = new URL(currentUrl).hostname.toLowerCase();
    if (!isSameCompanyDomain(sourceHost, officialHost)) {
      return { verified: false, reason: "source_not_on_verified_website" };
    }
  } catch {
    return { verified: false, reason: "invalid_source_url" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Language": "cs,en;q=0.8",
        },
      });
    } catch {
      return { verified: false, reason: "source_fetch_failed" };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return { verified: false, reason: "source_fetch_failed" };
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
        const nextHost = new URL(nextUrl).hostname.toLowerCase();
        if (!isSafePublicUrl(nextUrl) || !isSameCompanyDomain(nextHost, officialHost)) {
          return { verified: false, reason: "redirect_left_verified_website" };
        }
      } catch {
        return { verified: false, reason: "source_fetch_failed" };
      }
      currentUrl = nextUrl;
      continue;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const isTextPage = contentType === "" || contentType.includes("text/html") ||
      contentType.includes("application/xhtml+xml") || contentType.includes("text/plain");
    if (response.status !== 200 || !isTextPage) {
      return { verified: false, reason: "source_fetch_failed" };
    }

    const html = await readBodyWithLimit(response);
    const exactEmails = new Set([...extractMailtoEmails(html), ...extractTextEmails(html)]);
    return exactEmails.has(email)
      ? { verified: true, email, sourceUrl: currentUrl }
      : { verified: false, reason: "email_not_found_on_verified_website" };
  }

  return { verified: false, reason: "source_fetch_failed" };
}

export type CrawlResult =
  | { found: true; email: string; sourceUrl: string }
  | { found: false };

/**
 * Projde ověřený web firmy a najde první veřejný kontaktní e-mail.
 * `aiHintEmail` / `aiSourceUrl` jsou jen nápověda: použijí se pouze pokud
 * odpovídají skutečnému nálezu na stránce, jinak se ignorují.
 */
export async function crawlCompanyWebsite(
  website: string,
  companyName: string,
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

  if (aiSourceUrl && aiSourceUrl !== website && isSafePublicUrl(aiSourceUrl)) {
    let hintHost = "";
    try {
      hintHost = new URL(aiSourceUrl).hostname.toLowerCase();
    } catch {
      hintHost = "";
    }
    if (hintHost && isSameCompanyDomain(hintHost, originHost)) pushUnique(aiSourceUrl);
  }
  pushUnique(website);

  const foundEmails = new Map<string, string>();
  let pagesFetched = 0;

  while (queue.length > 0 && pagesFetched < MAX_PAGES_PER_COMPANY) {
    const url = queue.shift()!;
    const page = await fetchSafePage(url);
    pagesFetched++;
    if (!page) continue;

    const mailtoEmails = extractMailtoEmails(page.html);
    const textEmails = extractTextEmails(page.html);
    for (const email of [...mailtoEmails, ...textEmails]) {
      if (!foundEmails.has(email)) foundEmails.set(email, page.finalUrl);
    }
    // Zastav se, až když máme e-mail, který PATŘÍ firmě/webu (ne cizí doména).
    const hasOwned = Array.from(foundEmails.keys()).some((e) =>
      emailBelongsToCompany(e, originHost, companyName));
    if (hasOwned) break;

    if (url === website) {
      const links = extractContactLikeLinks(page.html, page.finalUrl, originHost);
      for (const link of links) {
        if (pagesFetched + queue.length < MAX_PAGES_PER_COMPANY) pushUnique(link);
      }
    }
  }

  // Přijmi jen e-maily patřící ověřenému webu/firmě (doménová shoda / značka).
  const owned = Array.from(foundEmails.entries()).filter(([email]) =>
    emailBelongsToCompany(email, originHost, companyName));
  if (owned.length === 0) return { found: false };

  const hint = sanitizeEmail(aiHintEmail);
  const hitHint = hint ? owned.find(([email]) => email === hint) : undefined;
  const [email, sourceUrl] = hitHint ?? owned[0];
  return { found: true, email, sourceUrl };
}
