// ============================================================================
// companyRegistryEnrich — AUTORITATIVNÍ doplnění firemních údajů z ARES.
// IČO/DIČ/adresa/město se berou VÝHRADNĚ z ARES (nikdy z AI, nikdy se nehádá).
// Slouží pro Discovery Job worker: po ověření webu doplní tvrdá registrová data.
// ============================================================================

const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
const TIMEOUT_MS = 9000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface RegistryRecord {
  ico: string;
  dic: string | null;
  legalName: string;
  address: string | null;
  city: string | null;
}

export function normalizeIco(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

async function aresFetch(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
    return res.ok ? (await res.json()) as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toRecord(data: Record<string, unknown> | null): RegistryRecord | null {
  if (!data) return null;
  const ico = normalizeIco(data.ico);
  const legalName = typeof data.obchodniJmeno === "string" ? data.obchodniJmeno : "";
  if (!ico || !legalName) return null;
  const dicRaw = typeof data.dic === "string" ? data.dic.trim() : "";
  const dic = /^CZ\d{8,10}$/i.test(dicRaw) ? dicRaw.toUpperCase() : null;
  const sidlo = (data.sidlo ?? {}) as Record<string, unknown>;
  const address = typeof sidlo.textovaAdresa === "string" ? sidlo.textovaAdresa : null;
  const city = typeof sidlo.nazevObce === "string" ? sidlo.nazevObce : null;
  return { ico, dic, legalName, address, city };
}

/** ARES detail podle IČO (autoritativní). */
export async function aresByIco(ico: string): Promise<RegistryRecord | null> {
  const norm = normalizeIco(ico);
  if (!norm) return null;
  const data = await aresFetch(`${ARES_BASE}/${norm}`);
  const rec = toRecord(data);
  return rec && rec.ico === norm ? rec : null;
}

/** ARES hledání podle názvu — jen JEDNOZNAČNÁ přesná shoda (jinak null). */
export async function aresByName(companyName: string): Promise<RegistryRecord | null> {
  const wanted = normalizeName(companyName);
  if (wanted.length < 3) return null;
  const data = await aresFetch(`${ARES_BASE}/vyhledat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ obchodniJmeno: companyName, start: 0, pocet: 10 }),
  });
  const rows = Array.isArray(data?.ekonomickeSubjekty) ? data.ekonomickeSubjekty as Record<string, unknown>[] : [];
  const exact = rows.filter((r) => normalizeName(String(r.obchodniJmeno ?? "")) === wanted);
  if (exact.length !== 1) return null;
  // Detail kvůli DIČ (vyhledat DIČ nemusí vracet).
  const ico = normalizeIco(exact[0].ico);
  if (!ico) return null;
  return (await aresByIco(ico)) ?? toRecord(exact[0]);
}

const ICO_RE = /i[čc]o?\s*[:.]?\s*(\d{2}\s?\d{3}\s?\d{3}|\d{8})/i;

/** Vytáhne IČO uvedené přímo na stránce firmy (např. v patičce). */
export function extractIcoFromText(text: string): string | null {
  const m = ICO_RE.exec(text);
  if (!m) return null;
  return normalizeIco(m[1]);
}

/** Vytáhne kandidátní název firmy z HTML (og:site_name → title → h1). */
export function extractCompanyNameFromHtml(html: string): string | null {
  const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return cleanName(og[1]);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title?.[1]) return cleanName(title[1]);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1?.[1]) return cleanName(h1[1].replace(/<[^>]*>/g, " "));
  return null;
}

function cleanName(raw: string): string | null {
  let s = raw.replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  // odřízni běžné title suffixy „ | Domů", „ – Úvod" apod.
  s = s.split(/\s[|–—\-]\s/)[0]?.trim() ?? s;
  if (s.length < 2 || s.length > 120) return null;
  return s;
}
