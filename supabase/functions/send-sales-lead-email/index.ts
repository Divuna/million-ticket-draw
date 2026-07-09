import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

// ============================================================================
// send-sales-lead-email — Fáze 3C: odeslání uloženého konceptu ČLOVĚKEM
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§8, §10, §11, §12, §13)
//
// ⚠️ Tuto funkci spouští VÝHRADNĚ člověk s oprávněním `sales_leads.manage`
//    kliknutím v UI. AI NIKDY nemá cestu k odeslání e-mailu.
//
// Odesílá POUZE existující, ručně/AI připravený a uložený KONCEPT z leadu
// (draft_email_subject + draft_email_body). NIC negeneruje. Tvrdé bariéry:
//   • chybí koncept                 → 422 no_draft
//   • chybí contact_email           → 422 missing_contact_email
//   • lead je do_not_contact        → 403 do_not_contact
//   • e-mail/doména na suppression  → 403 suppressed
//   • chybí RESEND_API_KEY          → 503 email_not_configured (NIC se neodešle)
//
// Po úspěšném odeslání zapíše do historie kontaktu activity 'email_sent'
// se snapshotem předmětu (ne AI). Odesílatel je b2b@onemil.cz.
//
// Oprava po Fázi 6 (§18 spec): po zápisu 'email_sent' volá service-role-only
// RPC `sales_lead_mark_emailed`, která leada ve stavu 'schvaleni_ceka' posune
// na 'osloveno' (jinak stav beze změny — nikdy nevrací zpět, nikdy nepřeskakuje
// stavy). Volání je best-effort: pokud selže, úspěšně odeslaný e-mail se
// NEVRACÍ zpět, jen se nepropíše stav (odesílání zůstává zdrojem pravdy).
//
// Auth: JWT → getUser → has_admin_permission('sales_leads.manage').
// Zápis přes service_role (obchází RLS). Nedotýká se wallets/payments/contests/
// tickets/winners/Stripe/buy_ticket_atomic.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_ADDRESS = "OneMil <b2b@onemil.cz>";
// Fallback reply-to (odesílatelská schránka). Reálné odpovědi směrujeme na
// per-lead adresu `reply+<lead_id>@reply.onemil.cz` (viz REPLY_INBOUND_DOMAIN),
// aby je EF `sales-lead-inbound` deterministicky spárovala s leadem.
const REPLY_TO = "b2b@onemil.cz";
const REPLY_INBOUND_DOMAIN = "reply.onemil.cz";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
      .select("id, company_name, contact_email, do_not_contact, draft_email_subject, draft_email_body")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) return jsonResponse({ success: false, error: "lead_lookup_failed" }, 500);
    if (!lead) return jsonResponse({ success: false, error: "lead_not_found" }, 404);

    // ── 4. Tvrdé bariéry ─────────────────────────────────────────────────────
    // Odesílá se JEN uložený koncept — nic se negeneruje.
    if (!lead.draft_email_subject || !lead.draft_email_body) {
      return jsonResponse({ success: false, error: "no_draft" }, 422);
    }
    const recipient = (lead.contact_email ?? "").trim().toLowerCase();
    if (!recipient) {
      return jsonResponse({ success: false, error: "missing_contact_email" }, 422);
    }
    if (lead.do_not_contact === true) {
      return jsonResponse({ success: false, error: "do_not_contact" }, 403);
    }

    // Poslední bariéra — globální suppression list (§12): přesný e-mail nebo @doména.
    const domain = recipient.includes("@") ? `@${recipient.split("@")[1]}` : recipient;
    const { data: suppressed } = await supabaseAdmin
      .from("sales_lead_email_suppression")
      .select("id")
      .in("email_pattern", [recipient, domain])
      .limit(1)
      .maybeSingle();
    if (suppressed) {
      return jsonResponse({ success: false, error: "suppressed" }, 403);
    }

    // ── 5. Resend ────────────────────────────────────────────────────────────
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      // Řízený stav — NIC se neodešle, žádná mutace.
      return jsonResponse({ success: false, error: "email_not_configured" }, 503);
    }

    const subject = String(lead.draft_email_subject);
    const textBody = String(lead.draft_email_body);
    const htmlBody = `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(textBody)}</div>`;

    // Per-lead reply-to — odpovědi firmy dorazí na adresu s tokenem leadu,
    // kterou EF `sales-lead-inbound` deterministicky spáruje s tímto leadem.
    const replyTo = `reply+${lead.id}@${REPLY_INBOUND_DOMAIN}`;

    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [recipient],
      reply_to: replyTo,
      subject,
      text: textBody,
      html: htmlBody,
    });
    if (emailResponse.error) {
      return jsonResponse({ success: false, error: "email_send_failed" }, 502);
    }

    // ── 6. Historie kontaktu (snapshot; odeslal člověk, ne AI) ───────────────
    await supabaseAdmin.from("sales_lead_activities").insert({
      lead_id: leadId,
      activity_type: "email_sent",
      direction: "outbound",
      subject,
      body_snapshot: textBody,
      email_message_id: (emailResponse.data as { id?: string } | null)?.id ?? null,
      performed_by: caller.id,
      metadata: { sent_by: "human", from: REPLY_TO, reply_to: replyTo, to: recipient },
    });

    // ── 7. Best-effort propsání stavu (§18 spec) ─────────────────────────────
    // E-mail byl už úspěšně odeslán a zapsán — pokud tento krok selže,
    // odpověď zůstává success:true, jen se nepropíše stav leadu.
    try {
      await supabaseAdmin.rpc("sales_lead_mark_emailed", {
        p_lead_id: leadId,
        p_performed_by: caller.id,
      });
    } catch {
      // best-effort — neblokuje úspěšné odeslání e-mailu
    }

    return jsonResponse({ success: true, lead_id: leadId, sent_to: recipient });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
