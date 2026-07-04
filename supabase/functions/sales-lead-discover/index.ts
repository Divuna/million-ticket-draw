import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-discover — Fáze 5A: automatické NAVRŽENÍ nových firemních leadů
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.0, 17.1, 17.7, 17.10)
//
// ⚠️ Spouští VÝHRADNĚ člověk s oprávněním `sales_leads.manage` kliknutím v UI.
//    AI smí POUZE navrhnout firmy a uložit je jako `navrzeny` (přes RPC
//    sales_lead_propose). AI NIKDY:
//      • nepřipraví finální odeslání,
//      • neodešle e-mail / nezapíše do email_queue,
//      • nevytvoří odesílatelný stav (jen `navrzeny`),
//      • nevyplní ověřený odesílací kontakt (contact_email zůstává null).
//    Každý návrh musí projít RUČNÍM lidským schválením (`navrzeny → novy`).
//
// Ochrany: limit počtu návrhů na běh; dedup + suppression + partner blokace
// řeší RPC sales_lead_propose server-side (bezpečná bariéra).
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
- NEVYMÝŠLEJ kontaktní e-maily, telefony ani jména osob. Vracej jen název firmy, veřejný web, případně IČO a město, pokud je veřejně známé; jinak vynech.
- NETVRDÍ partnerství ani dohodu s OneMil.
- NESLIBUJ žádné ceny ani podmínky.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.

Výstup: vrať POUZE validní JSON objekt {"companies": [...]}. Každá položka:
{"company_name": string, "website": string|null, "ico": string|null, "city": string|null, "industry": string|null, "lead_quality": 0|1|2|3, "rationale": string}
lead_quality = odhad vhodnosti (0 neznámé … 3 vysoká). rationale = krátké zdůvodnění (neveřejné, interní). Vše je neověřený návrh k ruční kontrole člověkem.`;

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

    // ── 4. Uložení návrhů přes bezpečné RPC (dedup/blokace řeší RPC) ─────────
    let created = 0;
    let skipped = 0;
    let errored = 0;
    const details: { company: string; outcome: string; reason?: string }[] = [];

    for (const c of companies) {
      const name = typeof c.company_name === "string" ? c.company_name.trim() : "";
      if (!name) { errored++; continue; }
      const qualityRaw = typeof c.lead_quality === "number" ? Math.floor(c.lead_quality) : 0;
      const quality = Math.min(3, Math.max(0, qualityRaw));

      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("sales_lead_propose", {
        p_created_by: caller.id,
        p_company_name: name,
        p_lead_group: leadGroup,
        p_discovery_source: "ai_navrh",
        p_lead_quality: quality,
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
      });

      if (rpcErr) { errored++; details.push({ company: name, outcome: "error", reason: "rpc_failed" }); continue; }
      const res = (rpcData ?? {}) as { outcome?: string; reason?: string };
      if (res.outcome === "created") { created++; details.push({ company: name, outcome: "created" }); }
      else if (res.outcome === "skipped") { skipped++; details.push({ company: name, outcome: "skipped", reason: res.reason }); }
      else { errored++; details.push({ company: name, outcome: "error", reason: res.reason }); }
    }

    return jsonResponse({
      success: true,
      lead_group: leadGroup,
      requested: limit,
      proposed_by_ai: companies.length,
      created,
      skipped,
      errored,
      details,
    });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
