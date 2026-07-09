import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-research — AI rešerše firmy pro modul Obchod / Leady (Fáze 3B)
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§6)
//
// AI je POUZE asistent pro rešerši. NIKDY neodesílá e-mail, NIKDY nevyplňuje
// contact_email automaticky, NIKDY netvrdí partnerství ani neslibuje ceny mimo
// schválený ceník. Výstup je jen textové shrnutí uložené do leadu + historie.
//
// Auth: JWT → getUser → has_admin_permission('sales_leads.manage') (superadmin
// implicitně true). Zápis přes service_role (obchází RLS).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = 20000;

// Tvrdé zákazy — vloženo do system promptu. Cena je jediná povolená cenová
// informace (dle knowledge base: 1 Kč bez DPH / využitý MioCoin).
const RESEARCH_SYSTEM_PROMPT = `Jsi interní rešeršní asistent OneMil pro obchodní tým. Tvým úkolem je připravit stručné shrnutí firmy jako podklad pro obchodníka.

PŘÍSNÉ ZÁKAZY (nikdy neporušit):
- NEVYMÝŠLEJ kontaktní e-maily, telefony ani jména. Pokud je neznáš z veřejného webu firmy, napiš "neuvedeno".
- NETVRDÍ, že OneMil má s firmou partnerství nebo dohodu.
- NESLIBUJ žádné ceny ani podmínky. Jediná povolená cenová informace je: "OneMil účtuje 1 Kč bez DPH za 1 využitý MioCoin."
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.

Výstup (česky, stručně, max ~200 slov):
1) Čím se firma zabývá a jaký má sortiment.
2) Odhad velikosti / typu zákazníka.
3) Personalizační háček — proč by pro tuto firmu dával OneMil smysl (věrnostní odměny MioCoiny za nákup).
Vše označ jako neověřený návrh k ruční kontrole.`;

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

    // ── 4. OpenAI ────────────────────────────────────────────────────────────
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      // Řízený stav — funkce nespadne, jen oznámí, že AI není nakonfigurovaná.
      return jsonResponse({ success: false, error: "ai_not_configured" }, 503);
    }

    const userPrompt = `Firma: ${lead.company_name}
Web: ${lead.website ?? "neuvedeno"}
IČO: ${lead.ico ?? "neuvedeno"}
Město: ${lead.city ?? "neuvedeno"}
Obor: ${lead.industry ?? "neuvedeno"}

Připrav rešeršní shrnutí dle pravidel.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let summary = "";
    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.4,
          messages: [
            { role: "system", content: RESEARCH_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!aiRes.ok) {
        return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
      }
      const aiJson = await aiRes.json();
      summary = (aiJson?.choices?.[0]?.message?.content ?? "").trim();
    } catch {
      return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
    } finally {
      clearTimeout(timer);
    }
    if (!summary) return jsonResponse({ success: false, error: "ai_empty_response" }, 502);

    // ── 5. Uložit shrnutí + historie (NIKDY nevyplňuje contact_email) ────────
    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("sales_leads")
      .update({ ai_research_summary: summary, ai_research_at: nowIso })
      .eq("id", leadId);
    if (updErr) return jsonResponse({ success: false, error: "save_failed" }, 500);

    await supabaseAdmin.from("sales_lead_activities").insert({
      lead_id: leadId,
      activity_type: "ai_research",
      direction: "internal",
      performed_by: caller.id,
      metadata: { model: AI_MODEL },
    });

    return jsonResponse({ success: true, summary, ai_research_at: nowIso });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
