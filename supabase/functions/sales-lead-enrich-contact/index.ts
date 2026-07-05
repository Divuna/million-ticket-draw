import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-enrich-contact — bezpečné dohledání VEŘEJNÉHO kontaktu (Fáze 5B)
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§17.8)
//
// AI dohledá VEŘEJNĚ uvedený kontaktní e-mail firmy a vrátí ho i se zdrojovou
// URL. Tvrdá pravidla:
//   • AI e-mail NIKDY nevymýšlí. Pokud veřejný e-mail nezná, vrátí null.
//   • E-mail se ukládá jen jako NEOVĚŘENÝ návrh přes RPC sales_lead_propose_contact
//     (nikdy nepřepíše odesílací contact_email — to udělá teprve člověk schválením).
//   • Funkce NIKDY neodesílá e-mail a nemění stav leadu.
//
// Auth: JWT → getUser → has_admin_permission('sales_leads.manage') (superadmin
// implicitně true). Zápis návrhu přes service_role RPC (obchází RLS).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = 20000;

const ENRICH_SYSTEM_PROMPT = `Jsi interní asistent OneMil pro dohledání VEŘEJNĚ uvedeného kontaktního e-mailu firmy.

PŘÍSNÉ ZÁKAZY (nikdy neporušit):
- NIKDY NEVYMÝŠLEJ e-mail. Nehádej podle vzoru (např. "info@domena"). Pokud veřejný e-mail firmy neznáš z její veřejné kontaktní stránky, vrať email = null.
- Uveď e-mail POUZE pokud je skutečně veřejně uveden na oficiálním webu firmy nebo její veřejné kontaktní stránce, a uveď přesnou zdrojovou URL, kde je uveden.
- Preferuj obecný firemní kontakt (info@, obchod@, kontakt@) před osobními adresami.
- Nevracej e-maily z katalogů třetích stran, sociálních sítí ani odhady.

Odpověz VÝHRADNĚ validním JSON objektem bez dalšího textu:
{"email": "<veřejný e-mail nebo null>", "source_url": "<URL kde je uveden nebo null>", "confidence": "<high|low>"}
Pokud si nejsi jistý, vrať {"email": null, "source_url": null, "confidence": "low"}.`;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    // ── 2. Parse ─────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ success: false, error: "invalid_json" }, 400);
    }
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : null;
    if (!leadId) return jsonResponse({ success: false, error: "lead_id_required" }, 400);

    // ── 3. Load lead ─────────────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("sales_leads")
      .select("id, company_name, website, ico, city, industry")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) return jsonResponse({ success: false, error: "lead_lookup_failed" }, 500);
    if (!lead) return jsonResponse({ success: false, error: "lead_not_found" }, 404);

    // ── 4. OpenAI — vrátí veřejný e-mail + zdroj, nebo null (nehádá) ─────────
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ success: false, error: "ai_not_configured" }, 503);
    }

    const userPrompt = `Firma: ${lead.company_name}
Web: ${lead.website ?? "neuvedeno"}
IČO: ${lead.ico ?? "neuvedeno"}
Město: ${lead.city ?? "neuvedeno"}
Obor: ${lead.industry ?? "neuvedeno"}

Dohledej veřejně uvedený kontaktní e-mail této firmy dle pravidel. Pokud ho veřejně neznáš, vrať null.`;

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
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: ENRICH_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!aiRes.ok) {
        return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
      }
      const aiJson = await aiRes.json();
      raw = (aiJson?.choices?.[0]?.message?.content ?? "").trim();
    } catch {
      return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
    } finally {
      clearTimeout(timer);
    }

    // ── 5. Vyhodnocení výstupu — bez vymýšlení ───────────────────────────────
    let parsed: { email?: unknown; source_url?: unknown; confidence?: unknown } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return jsonResponse({ success: false, error: "ai_bad_response" }, 502);
    }

    const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
    const sourceUrl = typeof parsed.source_url === "string" ? parsed.source_url.trim() : "";
    const emailValid = email.length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

    // Nenalezeno / nejisté / bez zdroje → NIC neuloží (AI nehádá).
    if (!emailValid || sourceUrl.length === 0 || parsed.confidence === "low") {
      return jsonResponse({ success: true, found: false });
    }

    // ── 6. Uložit jako NEOVĚŘENÝ návrh (nikdy nepřepíše contact_email) ───────
    const { data: proposeRes, error: proposeErr } = await supabaseAdmin.rpc(
      "sales_lead_propose_contact",
      {
        p_lead_id: leadId,
        p_created_by: caller.id,
        p_email: email,
        p_source_url: sourceUrl,
        p_proposed_by: "ai",
      },
    );
    if (proposeErr) return jsonResponse({ success: false, error: "propose_failed" }, 500);
    const res = proposeRes as { success?: boolean; error?: string } | null;
    if (!res?.success) {
      return jsonResponse({ success: false, error: res?.error ?? "propose_failed" }, 400);
    }

    return jsonResponse({
      success: true,
      found: true,
      proposed_email: email,
      source_url: sourceUrl,
      status: "neovereny",
    });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
