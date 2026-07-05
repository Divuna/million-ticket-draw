import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-discover — Fáze 5A + 5C: automatické NAVRŽENÍ nových firemních
// leadů VČETNĚ veřejného kontaktního e-mailu
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.0, 17.1, 17.7, 17.8.2, 17.10)
//
// ⚠️ Spouští VÝHRADNĚ člověk s oprávněním `sales_leads.manage` kliknutím v UI.
//    AI smí POUZE navrhnout firmy a uložit je jako `navrzeny` (přes RPC
//    sales_lead_propose_with_contact). AI NIKDY:
//      • nepřipraví finální odeslání,
//      • neodešle e-mail / nezapíše do email_queue,
//      • nevytvoří odesílatelný stav (jen `navrzeny`),
//      • nevyplní ověřený odesílací kontakt (contact_email zůstává null).
//    Každý návrh musí projít RUČNÍM lidským schválením (`navrzeny → novy`).
//
// Fáze 5C — tvrdá bariéra „bez veřejného e-mailu se lead nevytvoří":
//   • AI musí u každé firmy vrátit i veřejně dohledaný kontaktní e-mail +
//     zdrojovou URL (stejná pravidla jako `sales-lead-enrich-contact` —
//     NIKDY nevymýšlet, jen z veřejného webu/kontaktní stránky).
//   • Firma BEZ platného veřejného e-mailu + zdroje se PŘESKOČÍ —
//     RPC se pro ni vůbec nezavolá, žádný lead nevznikne; v odpovědi je jen
//     `outcome:"skipped", reason:"missing_public_email"`.
//   • Firma S veřejným e-mailem: lead (`navrzeny`) i navržený e-mail
//     (`proposed_contact_email`/`_source_url`, `proposed_contact_status='neovereny'`)
//     se vytvoří v JEDNÉ atomické operaci přes RPC `sales_lead_propose_with_contact`
//     — nikdy ve dvou oddělených krocích. Díky tomu nemůže nastat stav „lead
//     existuje, ale bez navrženého e-mailu": pokud e-mail neprojde validací,
//     INSERT se vůbec neprovede a žádný lead nevznikne. `contact_email` a
//     `email_verified_by_admin` zůstávají beze změny (null/false) — vyplní
//     je teprve ČLOVĚK ručním „Schválit e-mail" v detailu leadu (Fáze 5B).
//
// Fáze 5D — TVRDÉ OVĚŘENÍ zdrojové stránky (oprava mezery z Fáze 5C):
//   • AI TVRZENÍ, že e-mail našla na `email_source_url`, SAMO O SOBĚ NESTAČÍ —
//     AI si to mohla vymyslet nebo se splést. Fáze 5C bez tohoto kroku
//     důvěřovala tvrzení AI a mohla uložit lead s e-mailem, který na uvedené
//     stránce vůbec nebyl.
//   • Před voláním RPC EF sama STÁHNE `email_source_url` a ověří, že navržený
//     e-mail se skutečně nachází v obsahu stránky (case-insensitive, tolerantní
//     k HTML entitám a mezerám kolem `@`/`.` — viz `buildEmailSearchVariants`).
//     Teprve po úspěšném ověření se lead uloží.
//   • Fetch má krátký timeout (8 s), limit velikosti stažené stránky (2 MB) a
//     povoluje jen `http/https`; odmítá lokální/privátní/link-local adresy
//     (SSRF ochrana, `isSafePublicUrl`).
//   • Redirecty se NEŘEŠÍ automaticky (`redirect: "follow"`) — každý hop se
//     řeší ručně, max `MAX_REDIRECTS` (3), a KAŽDÁ cílová redirect URL se
//     znovu ověří přes `isSafePublicUrl`, než se na ni funkce přesune. Vede-li
//     redirect na nebezpečnou/neplatnou URL, ověření selže jako
//     `invalid_email_source_url`.
//   • Selže-li stažení stránky nebo e-mail na ní (v žádné z normalizovaných
//     variant) není nalezen, lead se NEULOŽÍ — RPC se vůbec nezavolá
//     (`outcome:"skipped"`, `reason:"email_not_found_on_source_page"`, resp.
//     `"invalid_email_source_url"` pro nebezpečnou/neplatnou URL nebo redirect).
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

const DISCOVER_SYSTEM_PROMPT = `Jsi rešeršní asistent OneMil. Navrhni reálné české firmy vhodné k oslovení do věrnostního programu OneMil pro danou skupinu, VČETNĚ jejich veřejně dohledatelného kontaktního e-mailu.

PŘÍSNÉ ZÁKAZY (nikdy neporušit):
- NIKDY NEVYMÝŠLEJ e-mail. Nehádej podle vzoru (např. "info@domena"). Pokud veřejný e-mail firmy neznáš z jejího oficiálního webu nebo veřejné kontaktní stránky, vrať email = null a email_source_url = null.
- Uveď e-mail POUZE pokud je skutečně veřejně uveden na oficiálním webu firmy nebo její veřejné kontaktní stránce, a uveď přesnou zdrojovou URL (email_source_url), kde je uveden.
- Nevracej e-maily z katalogů třetích stran, sociálních sítí ani odhady.
- Nevymýšlej ani telefony ani jména osob. Vracej jen název firmy, veřejný web, případně IČO a město, pokud je veřejně známé; jinak vynech.
- NETVRDÍ partnerství ani dohodu s OneMil.
- NESLIBUJ žádné ceny ani podmínky.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.

Výstup: vrať POUZE validní JSON objekt {"companies": [...]}. Každá položka:
{"company_name": string, "website": string|null, "ico": string|null, "city": string|null, "industry": string|null, "lead_quality": 0|1|2|3, "rationale": string, "email": string|null, "email_source_url": string|null, "email_confidence": "high"|"low"}
lead_quality = odhad vhodnosti (0 neznámé … 3 vysoká). rationale = krátké zdůvodnění (neveřejné, interní). email/email_source_url vyplň JEN pokud sis jistý (confidence "high") a máš zdroj; jinak null/null/"low". Vše je neověřený návrh k ruční kontrole člověkem.`;

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
  email_confidence?: unknown;
}

// Stejná validace jako v sales-lead-enrich-contact — bez vymýšlení, jen
// důvěryhodný formát + reálný zdroj.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── Fáze 5D — ověření zdrojové stránky ──────────────────────────────────────
// AI tvrzení "e-mail je na téhle URL" NENÍ důkaz — musí se ověřit stažením
// stránky a nalezením e-mailu v jejím obsahu. Bez tohoto kroku by mohl vzniknout
// lead s e-mailem, který na uvedené stránce vůbec není.
const SOURCE_FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BODY_BYTES = 2_000_000; // 2 MB — obranný limit proti velkým stránkám
const MAX_REDIRECTS = 3; // redirecty se řeší ručně — každý hop se znovu ověří (SSRF)

type SourceVerificationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email_source_url" | "email_not_found_on_source_page" };

/**
 * Bezpečnostní kontrola URL před fetchem (SSRF ochrana):
 *  - jen http/https,
 *  - žádné lokální/privátní/loopback/link-local adresy nebo hostnames,
 *  - žádné credentials v URL, žádný neobvyklý port scheme.
 * Volá se pro PŮVODNÍ URL i pro KAŽDÝ redirect hop zvlášť — nikdy se nesmí
 * důvěřovat výslednému místu, kam redirect vede, bez opětovné kontroly.
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

  // IPv4 literal — blokovat private/loopback/link-local/reserved rozsahy.
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

  // IPv6 loopback/link-local literal (hostname bývá v hranatých závorkách odstraněný URL parserem).
  if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return false;
  }

  return true;
}

/**
 * Připraví DVĚ normalizované varianty stažené stránky pro hledání e-mailu:
 *  1) "loose" — HTML entity dekódované, tagy odstraněné, mezery sjednocené,
 *     lowercase. Najde e-mail zapsaný normálně v běžném textu.
 *  2) "compact" — navíc odstraní VŠECHNY mezery kolem `@` a `.` (a mezi nimi),
 *     takže obfuskovaný zápis typu "info @ firma . cz" se porovná jako
 *     "info@firma.cz". Bez této varianty by běžná typografická mezera kolem
 *     zavináče (časté v ochraně proti spam-botům) test shody nechtěně shodila.
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

  // Compact: odstranit mezery bezprostředně kolem @ a . (v obou směrech,
  // opakovaně — "info  @  firma . cz" → "info@firma.cz").
  let compact = loose;
  let prevLength: number;
  do {
    prevLength = compact.length;
    compact = compact.replace(/\s+@/g, "@").replace(/@\s+/g, "@").replace(/\s+\./g, ".").replace(/\.\s+/g, ".");
  } while (compact.length !== prevLength);

  return { loose, compact };
}

/** Porovná e-mail proti oběma normalizovaným variantám stránky (case-insensitive). */
function pageContainsEmail(variants: { loose: string; compact: string }, email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return variants.loose.includes(normalizedEmail) || variants.compact.includes(normalizedEmail);
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
 * Stáhne `sourceUrl` a ověří, že `email` je skutečně obsažen na stránce.
 *
 * Redirecty se NENECHÁVAJÍ řešit automaticky (`redirect: "follow"` by mohlo
 * skončit na jiné, neověřené adrese) — řeší se ručně (`redirect: "manual"`),
 * max `MAX_REDIRECTS` hopů, a KAŽDÁ cílová redirect URL se znovu projde přes
 * `isSafePublicUrl` (SSRF ochrana i pro místo, kam redirect skutečně vede).
 * Pokud redirect vede na nebezpečnou/neplatnou URL, vrací se
 * `invalid_email_source_url`.
 *
 * Porovnání e-mailu je case-insensitive a tolerantní k HTML entitám i
 * mezerám kolem `@`/`.` (viz `buildEmailSearchVariants`), ale e-mail se
 * nikdy nehádá — musí být skutečně nalezen v obsahu stažené stránky.
 */
async function verifyEmailOnSourcePage(
  email: string,
  sourceUrl: string,
): Promise<SourceVerificationResult> {
  let currentUrl = sourceUrl;
  if (!isSafePublicUrl(currentUrl)) {
    return { ok: false, reason: "invalid_email_source_url" };
  }

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
      // Fetch selhal (timeout, DNS, síť, …) → lead se neuloží.
      return { ok: false, reason: "email_not_found_on_source_page" };
    } finally {
      clearTimeout(timer);
    }

    // Manuální redirect: fetch vrátí "opaqueredirect" (type) nebo status 3xx
    // s Location headerem — v obou případech je nutné cíl znovu ověřit.
    const isRedirectStatus = res.status >= 300 && res.status < 400;
    if (res.type === "opaqueredirect" || isRedirectStatus) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "invalid_email_source_url" };
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, reason: "invalid_email_source_url" };
      }
      if (!isSafePublicUrl(nextUrl)) {
        return { ok: false, reason: "invalid_email_source_url" };
      }
      if (hop === MAX_REDIRECTS) {
        return { ok: false, reason: "invalid_email_source_url" };
      }
      currentUrl = nextUrl;
      continue;
    }

    if (!res.ok) return { ok: false, reason: "email_not_found_on_source_page" };

    const html = await readBodyWithLimit(res);
    const variants = buildEmailSearchVariants(html);
    if (pageContainsEmail(variants, email)) {
      return { ok: true };
    }
    return { ok: false, reason: "email_not_found_on_source_page" };
  }

  return { ok: false, reason: "invalid_email_source_url" };
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

    // ── 4. Uložení návrhů — POUZE firmy s veřejně dohledaným e-mailem ────────
    // Firma bez platného veřejného e-mailu + zdrojové URL se PŘESKOČÍ dřív,
    // než se vůbec zavolá RPC — žádný lead pro ni nevznikne. Firma s e-mailem
    // se uloží přes ATOMICKOU RPC sales_lead_propose_with_contact, která
    // vytvoří lead i navržený e-mail v JEDNOM INSERTu (nemůže nastat stav
    // „lead existuje, ale bez navrženého e-mailu").
    let created = 0;
    let skipped = 0;
    let skippedMissingEmail = 0;
    let errored = 0;
    const details: { company: string; outcome: string; reason?: string }[] = [];

    for (const c of companies) {
      const name = typeof c.company_name === "string" ? c.company_name.trim() : "";
      if (!name) { errored++; continue; }

      // ── Bariéra: bez veřejného e-mailu + zdroje se lead vůbec nevytvoří ──
      // (i tak ji ověří ještě jednou uvnitř RPC — obranná kontrola navíc.)
      const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
      const emailSourceUrl = typeof c.email_source_url === "string" ? c.email_source_url.trim() : "";
      const emailValid = email.length > 0 && EMAIL_RE.test(email);
      if (!emailValid || emailSourceUrl.length === 0 || c.email_confidence === "low") {
        skipped++;
        skippedMissingEmail++;
        details.push({ company: name, outcome: "skipped", reason: "missing_public_email" });
        continue;
      }

      // ── Fáze 5D: AI TVRZENÍ nestačí — sami stáhneme zdrojovou stránku a
      // ověříme, že navržený e-mail v jejím obsahu skutečně je. Bez tohoto
      // kroku by AI mohla uvést URL, na které e-mail vůbec není. ──────────
      // Poznámka: neprošlé ověření se nezapočítává do skippedMissingEmail —
      // e-mail sice byl navržen, ale neprošel ověřením obsahu stránky.
      const verification = await verifyEmailOnSourcePage(email, emailSourceUrl);
      if (!verification.ok) {
        skipped++;
        details.push({ company: name, outcome: "skipped", reason: verification.reason });
        continue;
      }

      const qualityRaw = typeof c.lead_quality === "number" ? Math.floor(c.lead_quality) : 0;
      const quality = Math.min(3, Math.max(0, qualityRaw));

      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("sales_lead_propose_with_contact", {
        p_created_by: caller.id,
        p_company_name: name,
        p_lead_group: leadGroup,
        p_discovery_source: "ai_navrh",
        p_email: email,
        p_email_source_url: emailSourceUrl,
        p_discovery_meta: {
          model: AI_MODEL,
          rationale: typeof c.rationale === "string" ? c.rationale : null,
          run_at: new Date().toISOString(),
          run_by: caller.id,
        },
        p_website: typeof c.website === "string" ? c.website : null,
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
        details.push({ company: name, outcome: "created" });
      } else if (res.outcome === "skipped") {
        skipped++;
        if (res.reason === "missing_public_email") skippedMissingEmail++;
        details.push({ company: name, outcome: "skipped", reason: res.reason });
      } else {
        errored++;
        details.push({ company: name, outcome: "error", reason: res.reason });
      }
    }

    return jsonResponse({
      success: true,
      lead_group: leadGroup,
      requested: limit,
      proposed_by_ai: companies.length,
      created,
      skipped,
      skipped_missing_email: skippedMissingEmail,
      errored,
      details,
    });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
