export type VerificationStatus = "verified" | "unverified";

export interface WebsiteCandidate {
  url: string;
  source: string;
}

export interface WebsiteVerification {
  status: VerificationStatus;
  website: string | null;
  source: string | null;
  confidence: number;
  verifiedAt: string;
  legalName: string | null;
  ico: string | null;
  evidence: Record<string, unknown>;
  alternatives: Array<{ url: string; source: string; confidence: number; reason: string }>;
}

const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
const TIMEOUT_MS = 9_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
// Realistická prohlížečová hlavička — spousta firemních webů (Cloudflare/WAF)
// vrací 403 na zjevně botí User-Agent, což dřív zamítalo i správné oficiální
// weby. Ověření identity (ARES + název/IČO) zůstává nezměněné a přísné.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs,en;q=0.8",
};
const PARKED_PATTERNS = [
  /domain (?:is )?for sale/i, /buy this domain/i, /this domain is parked/i,
  /domena je na prodej/i, /doména je na prodej/i, /koupit tuto doménu/i,
  /sedoparking/i, /parkingcrew/i, /dan\.com\/buy-domain/i, /afternic/i,
  /expired domain/i, /domain has expired/i, /webhosting zdarma/i,
];

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedIco(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 8 ? digits.padStart(8, "0") : null;
}

function publicUrl(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (!h || h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

function hostKey(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { 'User-Agent': BROWSER_UA, ...(init?.headers ?? {}) } });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

async function lookupAres(companyName: string, ico: string | null): Promise<{ legalName: string; ico: string } | null> {
  if (ico) {
    const data = await fetchJson(`${ARES_BASE}/${ico}`) as Record<string, unknown> | null;
    const legalName = typeof data?.obchodniJmeno === 'string' ? data.obchodniJmeno : '';
    const foundIco = normalizedIco(data?.ico);
    return legalName && foundIco === ico ? { legalName, ico } : null;
  }
  const data = await fetchJson(`${ARES_BASE}/vyhledat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ obchodniJmeno: companyName, start: 0, pocet: 10 }),
  }) as Record<string, unknown> | null;
  const rows = Array.isArray(data?.ekonomickeSubjekty) ? data.ekonomickeSubjekty as Record<string, unknown>[] : [];
  const wanted = normalizeText(companyName);
  const exact = rows.filter(r => normalizeText(String(r.obchodniJmeno ?? '')) === wanted);
  if (exact.length !== 1) return null;
  const foundIco = normalizedIco(exact[0].ico);
  return foundIco ? { legalName: String(exact[0].obchodniJmeno), ico: foundIco } : null;
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const decoder = new TextDecoder(); let out = ''; let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; out += decoder.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch { /* best effort */ }
  return out;
}

async function fetchPage(rawUrl: string): Promise<{ finalUrl: string; html: string; redirected: boolean } | null> {
  let current = publicUrl(rawUrl); if (!current) return null;
  const initialHost = hostKey(current);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try { res = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: BROWSER_HEADERS }); }
    catch { return null; } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location'); if (!location || hop === MAX_REDIRECTS) return null;
      const next = publicUrl(new URL(location, current).toString()); if (!next) return null;
      current = next; continue;
    }
    // Přijmi HTML i když server neposílá content-type (běžné u WAF/proxy). Identitu
    // stejně potvrdí až obsah stránky; sem nepatří jen zjevně neHTML odpovědi.
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const looksHtml = contentType === '' || contentType.includes('html') || contentType.includes('text/plain') || contentType.includes('application/xhtml');
    if (res.status !== 200 || !looksHtml) return null;
    const html = await readLimited(res);
    return { finalUrl: current, html, redirected: hostKey(current) !== initialHost };
  }
  return null;
}

function pageText(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function identityLinks(html: string, baseUrl: string): string[] {
  const host = hostKey(baseUrl); const out: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const hint = `${m[1]} ${m[2].replace(/<[^>]+>/g, ' ')}`.toLowerCase();
    if (!/kontakt|contact|obchodni|obchodn[ií]|podminky|podm[ií]nky|o-nas|o-spolecnosti|about|impressum/.test(hint)) continue;
    try {
      const url = new URL(m[1], baseUrl).toString();
      if (publicUrl(url) && hostKey(url) === host && !out.includes(url)) out.push(url);
    } catch { /* ignore malformed link */ }
  }
  return out.slice(0, 4);
}

function identityScore(text: string, companyName: string, legalName: string | null, ico: string | null): { score: number; matches: string[] } {
  const normalized = normalizeText(text); const matches: string[] = [];
  const compactDigits = text.replace(/\D/g, '');
  if (ico && (compactDigits.includes(ico) || compactDigits.includes(ico.replace(/^0+/, '')))) matches.push('ico');
  const names = Array.from(new Set([companyName, legalName].filter(Boolean).map(v => normalizeText(String(v)))));
  if (names.some(n => n.length >= 4 && normalized.includes(n))) matches.push('company_name');
  const tokens = normalizeText(legalName ?? companyName).split(' ').filter(t => t.length >= 4);
  if (tokens.length >= 2 && tokens.filter(t => normalized.includes(t)).length >= Math.min(2, tokens.length)) matches.push('name_tokens');
  const supporting = /kontakt|contact|obchodni podminky|obchodn[ií] podm[ií]nky|copyright|\u00a9/i.test(text);
  if (supporting) matches.push('official_page_marker');
  const strong = matches.includes('ico') || matches.includes('company_name');
  return { score: strong && supporting ? (matches.includes('ico') ? 100 : 95) : strong ? 88 : 0, matches };
}

export async function verifyCompanyWebsite(input: { companyName: string; ico?: string | null; candidates: WebsiteCandidate[] }): Promise<WebsiteVerification> {
  const verifiedAt = new Date().toISOString(); const ico = normalizedIco(input.ico ?? null);
  const registry = await lookupAres(input.companyName, ico);
  const byUrl = new Map<string, WebsiteCandidate>();
  for (const candidate of input.candidates) {
    const url = publicUrl(candidate.url); if (url && !byUrl.has(url)) byUrl.set(url, candidate);
  }
  const unique = Array.from(byUrl.values()).slice(0, 6);
  const evaluated: Array<{ url: string; source: string; confidence: number; reason: string; finalUrl?: string; matches?: string[] }> = [];
  for (const candidate of unique) {
    const normalized = publicUrl(candidate.url); if (!normalized) continue;
    const page = await fetchPage(normalized);
    if (!page) { evaluated.push({ url: normalized, source: candidate.source, confidence: 0, reason: 'http_or_content_failed' }); continue; }
    let text = pageText(page.html);
    if (text.length < 250) { evaluated.push({ url: normalized, source: candidate.source, confidence: 0, reason: 'empty_page' }); continue; }
    if (PARKED_PATTERNS.some(p => p.test(text))) { evaluated.push({ url: normalized, source: candidate.source, confidence: 0, reason: 'parked_or_for_sale' }); continue; }
    let identity = identityScore(text, input.companyName, registry?.legalName ?? null, registry?.ico ?? ico);
    for (const link of identityLinks(page.html, page.finalUrl)) {
      if (identity.score >= 88) break;
      const detail = await fetchPage(link); if (!detail || hostKey(detail.finalUrl) !== hostKey(page.finalUrl)) continue;
      const detailText = pageText(detail.html); text += ` ${detailText}`;
      identity = identityScore(text, input.companyName, registry?.legalName ?? null, registry?.ico ?? ico);
    }
    evaluated.push({ url: normalized, finalUrl: page.finalUrl, source: candidate.source, confidence: identity.score, reason: identity.score > 0 ? 'identity_confirmed' : 'company_identity_not_confirmed', matches: identity.matches });
  }
  const accepted = evaluated.filter(e => e.confidence >= 88).sort((a, b) => b.confidence - a.confidence);
  const best = accepted[0];
  return {
    status: best ? 'verified' : 'unverified', website: best?.finalUrl ?? null,
    source: best ? (best.confidence === 100 ? 'ARES + oficiální web' : 'Oficiální web') : null,
    confidence: best?.confidence ?? 0, verifiedAt, legalName: registry?.legalName ?? null,
    ico: registry?.ico ?? ico, evidence: { registry: registry ? 'ARES' : null, selected: best ?? null, candidates_checked: evaluated.length },
    alternatives: evaluated.filter(e => !best || e.url !== best.url).map(e => ({ url: e.finalUrl ?? e.url, source: e.source, confidence: e.confidence, reason: e.reason })),
  };
}
