import {
  isSafePublicUrl,
  normalizeCompanyWebsite,
  sanitizeEmail,
  verifyEmailOnOfficialSourcePage,
} from "./companyEmailCrawler.ts";
import { isNonOfficialWebsiteUrl, registrableDomainOf } from "./officialWebsitePolicy.ts";

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; OneMilWorkIntake/1.0)",
  "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
  "Accept-Language": "cs,en;q=0.8",
};

export interface WorkIntakeCandidate {
  website: string;
  public_email: string;
  email_source_url: string;
}

export type WorkIntakeVerification =
  | { ok: true; website: string; domain: string; email: string; sourceUrl: string; evidence: Record<string, unknown> }
  | { ok: false; reason: string; evidence?: Record<string, unknown> };

function host(raw: string): string {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); }
  catch { return ""; }
}

export function sameCompanyDomain(a: string, b: string): boolean {
  const ah = host(a); const bh = host(b);
  return Boolean(ah && bh && registrableDomainOf(ah) === registrableDomainOf(bh));
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, MAX_BYTES);
  const decoder = new TextDecoder(); let result = ""; let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; result += decoder.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch { /* best effort */ }
  return result;
}

async function fetchWebsite(raw: string, fetchImpl: typeof fetch): Promise<{ url: string; html: string } | null> {
  let current = raw;
  const initial = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(current, { redirect: "manual", signal: controller.signal, headers: HEADERS });
    } catch { return null; } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) return null;
      try {
        const next = new URL(location, current).toString();
        if (!isSafePublicUrl(next) || !sameCompanyDomain(initial, next)) return null;
        current = next;
      } catch { return null; }
      continue;
    }
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (response.status !== 200 || (type && !type.includes("html") && !type.includes("text/plain") && !type.includes("xhtml"))) return null;
    return { url: current, html: await readLimited(response) };
  }
  return null;
}

export function deterministicEshopEvidence(html: string): { accepted: boolean; score: number; signals: string[] } {
  const content = html.replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ").toLowerCase();
  const signals: string[] = [];
  let score = 0;
  const add = (name: string, points: number, pattern: RegExp) => { if (pattern.test(content)) { signals.push(name); score += points; } };
  add("product_schema", 2, /schema\.org\/(?:product|offer)|["']@type["']\s*:\s*["'](?:product|offer)/i);
  add("commerce_platform", 2, /shoptet|woocommerce|shopify|prestashop|upgates|ecwid|shop-system/i);
  add("cart_or_checkout", 2, /ko[sš][ií]k|p[řr]idat do ko[sš][ií]ku|objednat|checkout|add.to.cart|shopping.cart/i);
  add("prices_czk", 1, /\b\d[\d\s.,]{0,10}\s*(?:k[čc]|czk)\b/i);
  add("shop_terms", 1, /obchodn[ií] podm[ií]nky|doprava a platba|reklama[čc]n[ií] [řr][aá]d|vr[aá]cen[ií] zbo[zž][ií]/i);
  const transactional = signals.some((s) => ["product_schema", "commerce_platform", "cart_or_checkout"].includes(s));
  return { accepted: score >= 3 && transactional, score, signals };
}

export async function verifyWorkIntakeCandidate(
  input: WorkIntakeCandidate,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkIntakeVerification> {
  const website = normalizeCompanyWebsite(input.website);
  const email = sanitizeEmail(input.public_email);
  const source = normalizeCompanyWebsite(input.email_source_url);
  if (!website) return { ok: false, reason: "invalid_website" };
  if (!email) return { ok: false, reason: "invalid_email" };
  if (!source) return { ok: false, reason: "invalid_website" };
  if (isNonOfficialWebsiteUrl(website) || isNonOfficialWebsiteUrl(source)) return { ok: false, reason: "catalog_or_marketplace" };
  if (!sameCompanyDomain(website, source)) return { ok: false, reason: "email_source_domain_mismatch" };

  const page = await fetchWebsite(website, fetchImpl);
  if (!page) return { ok: false, reason: "fetch_failed" };
  if (isNonOfficialWebsiteUrl(page.url) || !sameCompanyDomain(website, page.url)) return { ok: false, reason: "email_source_domain_mismatch" };
  const eshop = deterministicEshopEvidence(page.html);
  if (!eshop.accepted) return { ok: false, reason: "not_eshop", evidence: eshop };

  // The shared exact verifier is deliberately stricter than registrable-domain
  // matching: source and website must use the same host apart from www.
  const exact = await verifyEmailOnOfficialSourcePage({
    officialWebsite: page.url,
    candidateEmail: email,
    sourceUrl: source,
    fetchImpl,
  });
  if (!exact.verified) {
    const reason = exact.reason === "email_not_found_on_verified_website" ? "email_not_found_on_source"
      : exact.reason === "source_not_on_verified_website" || exact.reason === "redirect_left_verified_website"
      ? "email_source_domain_mismatch"
      : exact.reason === "invalid_email" ? "invalid_email"
      : exact.reason === "non_official_third_party" ? "catalog_or_marketplace" : "fetch_failed";
    return { ok: false, reason, evidence: eshop };
  }

  const domain = host(page.url);
  return {
    ok: true, website: page.url, domain, email: exact.email, sourceUrl: exact.sourceUrl,
    evidence: { verifier: "deterministic_v1", eshop, email: "exact_source_page_match" },
  };
}
