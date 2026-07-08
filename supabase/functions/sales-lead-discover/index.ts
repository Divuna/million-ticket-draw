import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-discover — automatické NAVRŽENÍ nových firemních leadů.
// Spouští výhradně člověk s oprávněním sales_leads.manage.
// AI pouze navrhne firmy a uloží je jako `navrzeny`; nic se neodesílá.
// Skupiny leadů se primárně načítají z DB tabulky sales_lead_groups.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = 25000;
const MAX_PER_RUN = 10;
const DEFAULT_LIMIT = 5;

const FALLBACK_GROUP_LABELS: Record<string, string> = {
  "e-shopy": "E-shopy",
  "auto-moto": "Auto / moto",
  "luxusni-zbozi": "Luxusní zboží",
  sport: "Sport",
  cestovani: "Cestování",
  gastronomie: "Gastronomie",
  "lokalni-sluzby": "Lokální služby",
  jine: "Jiné",
};

const DISCOVER_SYSTEM_PROMPT = `Jsi rešeršní asistent OneMil. Navrhni reálné české firmy vhodné k oslovení do věrnostního programu OneMil pro zadanou skupinu.

PŘÍSNÉ ZÁKAZY:
- NIKDY NEVYMÝŠLEJ e-mail, telefon ani jméno osoby. Vracej jen název firmy, veřejný web, případně IČO a město, pokud je veřejně známé; jinak vynech.
- Pokud e-mail firmy neznáš jistě z veřejného webu, vrať email = null — nehádej, backend si e-mail dohledá sám na webu firmy.
- NETVRDÍ partnerství ani dohodu s OneMil.
- NESLIBUJ žádné ceny ani podmínky.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.

Výstup: vrať POUZE validní JSON objekt {"companies": [...]}. Každá položka:
{"company_name": string, "website": string|null, "ico": string|null, "city": string|null, "industry": string|null, "lead_quality": 0|1|2|3, "rationale": string, "email": string|null}
lead_quality = odhad vhodnosti (0 neznámé … 3 vysoká). rationale = krátké interní zdůvodnění. "email" je jen volitelná nápověda; backend si e-mail vždy ověřuje/dohledává na webu firmy. Vše je neověřený návrh k ruční kontrole člověkem.`;

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
  email_source_url?: unknown;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIND_EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;
const SOURCE_FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BODY_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_PAGES_PER_COMPANY = 5;

const CONTACT_LINK_KEYWORDS = [
  "kontakt", "contact", "kontakty", "o-nas", "o-spolecnosti", "about", "about-us", "impressum",
];

const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "domain.com", "yourdomain.com",
  "yoursite.com", "email.com", "test.com", "w3.org", "schema.org", "sentry.io",
  "wixpress.com", "godaddy.com", "placeholder.com",
]);

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

function normalizeCompanyWebsite(raw: string): string | null {
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

function isLikelyPlaceholderEmail(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  return PLACEHOLDER_EMAIL_DOMAINS.has(domain);
}

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
    const variants = buildEmailSearchVariants(page.html);
    const textEmails = extractTextEmails(variants);
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

async function resolveLeadGroup(
  supabaseAdmin: ReturnType<typeof createClient>,
  leadGroup: string,
): Promise<{ valid: true; label: string } | { valid: false }> {
  if (!leadGroup) return { valid: false };

  const { data, error } = await supabaseAdmin
    .from("sales_lead_groups")
    .select("slug, label, is_active")
    .eq("slug", leadGroup)
    .eq("is_active", true)
    .maybeSingle();

  if (!error) {
    if (data?.label) return { valid: true, label: String(data.label) };
    return { valid: false };
  }

  const fallbackLabel = FALLBACK_GROUP_LABELS[leadGroup];
  if (fallbackLabel) return { valid: true, label: fallbackLabel };
  return { valid: false };
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ success: false, error: "invalid_json" }, 400);
    }

    const leadGroup = typeof body.lead_group === "string" ? body.lead_group.trim() : "";
    const resolvedGroup = await resolveLeadGroup(supabaseAdmin, leadGroup);
    if (!resolvedGroup.valid) {
      return jsonResponse({ success: false, error: "invalid_lead_group" }, 400);
    }

    let limit = typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT;
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_PER_RUN) limit = MAX_PER_RUN;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ success: false, error: "ai_not_configured" }, 503);
    }

    const userPrompt = `Skupina: ${resolvedGroup.label} (${leadGroup})\nPočet návrhů: ${limit}\n\nNavrhni ${limit} reálných českých firem pro tuto skupinu dle pravidel. Vrať JSON {"companies":[...]}.`;

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
    companies = companies.slice(0, limit);

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
      const crawl = website ? await crawlCompanyWebsite(website, aiHintEmail, aiSourceUrl) : { found: false as const };

      const qualityRaw = typeof c.lead_quality === "number" ? Math.floor(c.lead_quality) : 0;
      const quality = Math.min(3, Math.max(0, qualityRaw));
      const discoveryMeta = {
        model: AI_MODEL,
        rationale: typeof c.rationale === "string" ? c.rationale : null,
        run_at: new Date().toISOString(),
        run_by: caller.id,
        lead_group_label: resolvedGroup.label,
      };

      if (crawl.found) {
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
      lead_group_label: resolvedGroup.label,
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
