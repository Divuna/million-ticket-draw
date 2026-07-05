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
