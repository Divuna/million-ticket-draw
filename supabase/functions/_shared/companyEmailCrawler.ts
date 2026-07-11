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

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
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

  if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
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

function isSameCompanyDomain(hostA: string, hostB: string): boolean {
  return stripWwwPrefix(hostA) === stripWwwPrefix(hostB);
}

function buildEmailSearchVariants(html: string): { loose: string; compact: string } {
  const loose = html
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
  while ((m = re.exec(html))) {
    let addr = m[1];
    try { addr = decodeURIComponent(addr); } catch { /* keep raw */ }
    addr = addr.trim().toLowerCase();
    if (EMAIL_RE.test(addr) && !isLikelyPlaceholderEmail(addr)) emails.push(addr);
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
      const addr = m[0];
      if (EMAIL_RE.test(addr) && !isLikelyPlaceholderEmail(addr) && !emails.includes(addr)) {
        emails.push(addr);
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
    if (foundEmails.size > 0) break;

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
  const first = Array.from(foundEmails.entries())[0];
  return { found: true, email: first[0], sourceUrl: first[1] };
}
