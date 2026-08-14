import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-draft-email — AI návrh oslovovacího e-mailu (Fáze 3B)
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§7, §8)
//
// AI POUZE personalizuje schválenou kostru e-mailu. NIKDY neodesílá e-mail,
// NIKDY nezapisuje do email_queue, NIKDY nemění cenový model / právní tvrzení /
// odesílatele. Výsledek je jen interní KONCEPT uložený do leadu — odeslání je
// samostatná pozdější fáze, kterou vždy potvrdí člověk s `sales_leads.manage`.
//
// Auth: JWT → getUser → has_admin_permission('sales_leads.manage').
// Zápis přes service_role (obchází RLS).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = 20000;
// Odhlášení řeší VÝHRADNĚ systémové CTA „Nemám zájem“, které se k prvnímu
// obchodnímu e-mailu přidává automaticky (_shared/salesLeadResponseCta.ts).
// AI proto nesmí vytvářet žádný konkurenční odhlašovací mechanismus — ani výzvu
// odpovědět e-mailem, ani mailto, ani vlastní odhlašovací větu.
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §25.5.
const NO_OPT_OUT_RULE =
  "- NEPŘIDÁVEJ žádnou odhlašovací větu ani výzvu k odpovědi kvůli odhlášení, žádný mailto odkaz "
  + "a žádnou vlastní možnost odhlášení. Odhlášení řeší systémové tlačítko, které se do e-mailu "
  + "doplní automaticky.";

// Zakázaná slova — pojistka proti hazardnímu wordingu ve výstupu AI.
const FORBIDDEN_WORDS = [
  "casino", "kasino", "hazard", "sázka", "sazka", "sázky", "loterie", "jackpot", "ruleta",
];

// Schválená kostra e-mailu — AI ji smí jen personalizovat (oslovení, odstavec
// „proč OneMil", podpis). Cenový model, právní tvrzení, odesílatele NEMĚNIT.
const DRAFT_SYSTEM_PROMPT = `Jsi asistent obchodního týmu OneMil. Připrav ČESKÝ návrh prvního oslovovacího e-mailu firmě jako interní KONCEPT k ruční kontrole. E-mail se v tuto chvíli NEODESÍLÁ.

PŘÍSNÁ PRAVIDLA:
- Vrať POUZE validní JSON: {"subject": "...", "body": "..."} — nic jiného.
- Odesílatel je OneMil (Iconic Point s.r.o.), kontakt b2b@onemil.cz. Neměň ho.
- Jediná povolená cenová informace: "OneMil účtuje 1 Kč bez DPH za 1 využitý MioCoin, firma platí jen za skutečně využité odměny."
- NETVRDÍ existující partnerství ani dohodu — jde o první oslovení.
- NESLIBUJ konkrétní čísla, garance ani exkluzivitu.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.
- Do těla vlož zdvořilé oslovení, 2–3 odstavce (co OneMil je + proč dává smysl pro tuto firmu + výzva k nezávaznému hovoru) a podpis „Tým OneMil, b2b@onemil.cz".
${NO_OPT_OUT_RULE}`;

const ASSIST_SYSTEM_PROMPT = `Jsi textový asistent obchodního týmu OneMil. Upravuješ výhradně pracovní text v editoru. Nic neukládáš ani neodesíláš.

PŘÍSNÁ PRAVIDLA:
- Vrať POUZE validní JSON: {"subject": "...", "body": "..."} — nic jiného.
- Zachovej význam, pravdivost, obchodní nabídku, ceny, právní tvrzení i podpis vstupního textu.
- Nevymýšlej partnerství, dohody, čísla, garance, exkluzivitu ani informace, které nejsou v kontextu.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.
- Akce "personalize" přizpůsobí text doloženým údajům firmy; akce "improve" zlepší stručnost, čitelnost a češtinu bez změny významu.
${NO_OPT_OUT_RULE}`;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function containsForbidden(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_WORDS.some((w) => lower.includes(w));
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
    // ── 1. Auth ──────────────────────────────────────────────────────────────
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
    const assistMode = body.mode === "assist";
    const mode = body.mode === "follow_up" ? "follow_up" : "initial";
    const assistAction = body.action === "improve" ? "improve" : "personalize";
    const emailType = body.email_type === "reply" || body.email_type === "follow_up" ? body.email_type : "initial";
    const currentSubject = typeof body.subject === "string" ? body.subject.trim() : "";
    const currentBody = typeof body.body === "string" ? body.body.trim() : "";
    const replyToActivityId = typeof body.reply_to_activity_id === "string" ? body.reply_to_activity_id.trim() : "";
    if (!leadId) return jsonResponse({ success: false, error: "lead_id_required" }, 400);
    if (assistMode && (currentSubject.length > 300 || currentBody.length > 20000)) {
      return jsonResponse({ success: false, error: "invalid_email_content" }, 400);
    }
    if (assistMode && emailType !== "follow_up" && (!currentSubject || !currentBody)) {
      return jsonResponse({ success: false, error: "email_content_required" }, 400);
    }

    // ── 3. Load lead + research ──────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("sales_leads")
      .select("id, company_name, website, city, industry, contact_person, contact_role, ai_research_summary, status")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) return jsonResponse({ success: false, error: "lead_lookup_failed" }, 500);
    if (!lead) return jsonResponse({ success: false, error: "lead_not_found" }, 404);
    let previousSubject = "";
    let previousBody = "";
    if (mode === "follow_up" || (assistMode && emailType === "follow_up")) {
      if (!['osloveno','follow_up'].includes(lead.status)) return jsonResponse({ success:false,error:'follow_up_not_allowed' },409);
      const [{data:lastSent},{count:replyCount}] = await Promise.all([
        supabaseAdmin.from('sales_lead_activities').select('subject,body_snapshot').eq('lead_id',leadId).eq('activity_type','email_sent').order('created_at',{ascending:false}).limit(1).maybeSingle(),
        supabaseAdmin.from('sales_lead_activities').select('id',{count:'exact',head:true}).eq('lead_id',leadId).eq('activity_type','reply_received'),
      ]);
      if ((replyCount??0)>0) return jsonResponse({success:false,error:'lead_already_replied'},409);
      if (!lastSent) return jsonResponse({success:false,error:'first_email_missing'},409);
      previousSubject=lastSent.subject??''; previousBody=lastSent.body_snapshot??'';
    }
    let receivedSubject = "";
    let receivedBody = "";
    if (assistMode && emailType === "reply") {
      if (!replyToActivityId) return jsonResponse({ success: false, error: "reply_to_activity_id_required" }, 400);
      const { data: received } = await supabaseAdmin
        .from("sales_lead_activities")
        .select("subject,body_snapshot")
        .eq("id", replyToActivityId)
        .eq("lead_id", leadId)
        .eq("activity_type", "reply_received")
        .maybeSingle();
      if (!received) return jsonResponse({ success: false, error: "reply_activity_not_found" }, 404);
      receivedSubject = received.subject ?? "";
      receivedBody = received.body_snapshot ?? "";
    }

    // ── 4. OpenAI ────────────────────────────────────────────────────────────
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ success: false, error: "ai_not_configured" }, 503);
    }

    const userPrompt = assistMode ? `Firma: ${lead.company_name}
Web: ${lead.website ?? "neuvedeno"}
Obor: ${lead.industry ?? "neuvedeno"}
Město: ${lead.city ?? "neuvedeno"}
Kontaktní osoba: ${lead.contact_person ?? "neuvedeno"}
Role kontaktu: ${lead.contact_role ?? "neuvedeno"}
Rešerše: ${lead.ai_research_summary ?? "(zatím neprovedena)"}
Typ e-mailu: ${emailType}
Akce: ${assistAction}
${emailType === "follow_up" ? `Původní odeslaný předmět: ${previousSubject}\nPůvodní odeslaný e-mail: ${previousBody}` : ""}
${emailType === "reply" ? `Přijatý předmět: ${receivedSubject}\nPřijatý e-mail: ${receivedBody}` : ""}

Aktuální předmět editoru: ${currentSubject || "(zatím prázdný — vytvoř stručný předmět)"}
Aktuální text editoru: ${currentBody || "(zatím prázdný — vytvoř stručný personalizovaný follow-up)"}

Vrať upravený JSON {"subject","body"}.` : `Firma: ${lead.company_name}
Obor: ${lead.industry ?? "neuvedeno"}
Město: ${lead.city ?? "neuvedeno"}
Kontaktní osoba: ${lead.contact_person ?? "neuvedeno"}
Rešerše: ${lead.ai_research_summary ?? "(zatím neprovedena)"}
Režim: ${mode === 'follow_up' ? 'ručně potvrzený follow-up bez odpovědi firmy' : 'první oslovení'}
${mode === 'follow_up' ? `Původní předmět: ${previousSubject}\nPůvodní e-mail: ${previousBody}\nNapiš stručné zdvořilé připomenutí, nevymýšlej nové skutečnosti.` : ''}

Vrať JSON {"subject","body"} dle pravidel.`;

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
            { role: "system", content: assistMode ? ASSIST_SYSTEM_PROMPT : DRAFT_SYSTEM_PROMPT },
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

    let subject = "";
    let emailBody = "";
    try {
      const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
      subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
      emailBody = typeof parsed.body === "string" ? parsed.body.trim() : "";
    } catch {
      return jsonResponse({ success: false, error: "ai_invalid_format" }, 502);
    }
    if (!subject || !emailBody) {
      return jsonResponse({ success: false, error: "ai_empty_response" }, 502);
    }

    // ── 5. Obsahová pojistka — zakázaný wording ──────────────────────────────
    if (containsForbidden(subject) || containsForbidden(emailBody)) {
      return jsonResponse({ success: false, error: "forbidden_wording_detected" }, 422);
    }

    // Režim asistenta pouze vrací upravený text do existujícího editoru.
    // Záměrně nic nezapisuje do leadu ani historie a nikdy nic neodesílá.
    if (assistMode) return jsonResponse({ success: true, subject, body: emailBody });

    // ── 6. Uložit KONCEPT (NIKDY neodesílá, NIKDY neenqueue do email_queue) ──
    const { error: updErr } = mode === 'initial' ? await supabaseAdmin
      .from("sales_leads")
      .update({
        draft_email_subject: subject,
        draft_email_body: emailBody,
        draft_prepared_by: "ai",
      })
      .eq("id", leadId) : { error: null };
    if (updErr) return jsonResponse({ success: false, error: "save_failed" }, 500);

    await supabaseAdmin.from("sales_lead_activities").insert({
      lead_id: leadId,
      activity_type: "draft_created",
      direction: "internal",
      performed_by: caller.id,
      metadata: { model: AI_MODEL, prepared_by: "ai", mode },
    });

    return jsonResponse({ success: true, subject, body: emailBody });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
