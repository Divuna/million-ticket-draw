import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";
import { markdownLinksToVisibleText } from "../_shared/salesLeadEmailRendering.ts";
import { createOutboundCapture } from "../_shared/salesLeadEmailThreading.ts";

// ============================================================================
// send-sales-lead-email — odeslání aktuálního obsahu editoru ČLOVĚKEM
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§8, §10, §11, §12, §13)
//
// ⚠️ Tuto funkci spouští VÝHRADNĚ člověk s oprávněním `sales_leads.manage`
//    kliknutím v UI. AI NIKDY nemá cestu k odeslání e-mailu.
//
// Odesílá POUZE předmět a text dodaný otevřeným editorem. NIC negeneruje a
// nikdy nenačítá starší uložený koncept. Tvrdé bariéry:
//   • chybí/neprojde obsah          → 422 chyba validace obsahu
//   • chybí contact_email           → 422 missing_contact_email
//   • lead je do_not_contact        → 403 do_not_contact
//   • e-mail/doména na suppression  → 403 suppressed
//   • chybí RESEND_API_KEY          → 503 email_not_configured (NIC se neodešle)
//
// Po úspěšném odeslání zapíše do historie kontaktu activity 'email_sent'
// se snapshotem předmětu (ne AI). Odesílatel je b2b@onemil.cz.
//
// Navržený lead se nesmí odeslat: nejdřív jej člověk schválí do `novy`.
// Po úspěšném Resend odeslání se stav povinně synchronizuje přes service-role
// RPC `sales_lead_mark_emailed`; teprve pak funkce vrací success:true.
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

const FROM_ADDRESS = "OneMil obchodní tým <b2b@onemil.cz>";
const REPLY_TO = "OneMil obchodní tým <b2b@onemil.cz>";
const INITIAL_EMAIL_ALLOWED_STATUSES = new Set(["novy", "priprava", "schvaleni_ceka"]);
const ALREADY_CONTACTED_STATUSES = new Set(["osloveno", "follow_up", "odpovedel", "jednani", "konvertovan"]);

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

function validateEmailContent(subject: string, body: string): string | null {
  if (!subject.trim()) return "email_subject_required";
  if (!body.trim()) return "email_body_required";
  if (subject.trim().length > 300) return "email_subject_too_long";
  if (body.trim().length > 20_000) return "email_body_too_long";
  if (/\{\{[^{}]+\}\}/.test(`${subject}\n${body}`)) return "unresolved_template_variables";
  return null;
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
    const subject = typeof body.subject === "string" ? body.subject : null;
    const textBody = typeof body.body === "string" ? body.body : null;
    if (subject === null || textBody === null) {
      return jsonResponse({ success: false, error: "email_content_required" }, 422);
    }
    const contentError = validateEmailContent(subject, textBody);
    if (contentError) return jsonResponse({ success: false, error: contentError }, 422);

    // ── 3. Load lead ─────────────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("sales_leads")
      .select("id, company_name, status, contact_email, email_verified_by_admin, do_not_contact")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) return jsonResponse({ success: false, error: "lead_lookup_failed" }, 500);
    if (!lead) return jsonResponse({ success: false, error: "lead_not_found" }, 404);
    if (lead.status === "navrzeny") {
      return jsonResponse({ success: false, error: "proposal_not_approved" }, 409);
    }
    if (!INITIAL_EMAIL_ALLOWED_STATUSES.has(lead.status)) {
      return jsonResponse({ success: false, error: "initial_email_status_not_allowed" }, 409);
    }

    // ── 4. Tvrdé bariéry ─────────────────────────────────────────────────────
    const recipient = (lead.contact_email ?? "").trim().toLowerCase();
    if (!recipient || lead.email_verified_by_admin !== true) {
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

    // Idempotency guard: if Resend succeeded previously but a later DB step
    // failed, the same first e-mail must never be sent again.
    const { data: previousInitialEmail, error: previousInitialEmailError } = await supabaseAdmin
      .from("sales_lead_activities")
      .select("id")
      .eq("lead_id", leadId)
      .eq("activity_type", "email_sent")
      .eq("direction", "outbound")
      .contains("metadata", { sent_by: "human" })
      .limit(1)
      .maybeSingle();
    if (previousInitialEmailError) {
      return jsonResponse({ success: false, error: "initial_email_history_check_failed" }, 500);
    }
    if (previousInitialEmail) {
      return jsonResponse({ success: false, error: "initial_email_already_sent" }, 409);
    }

    // Autoritativní kontrola duplicit těsně před odesláním. Frontend ji nemůže
    // obejít: bez auditované výjimky pro všechny aktuální shody se nic neodešle.
    const { data: duplicateGuard, error: duplicateGuardError } = await supabaseAdmin.rpc(
      "sales_lead_email_send_guard",
      { p_lead_id: leadId },
    );
    if (duplicateGuardError) {
      return jsonResponse({ success: false, error: "duplicate_guard_failed" }, 500);
    }
    const guard = duplicateGuard as { success?: boolean; error?: string } | null;
    if (!guard?.success) {
      return jsonResponse({ success: false, error: guard?.error ?? "duplicate_override_required" }, 409);
    }

    // ── 5. Resend ────────────────────────────────────────────────────────────
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      // Řízený stav — NIC se neodešle, žádná mutace.
      return jsonResponse({ success: false, error: "email_not_configured" }, 503);
    }

    const renderedBody = markdownLinksToVisibleText(textBody);
    const htmlBody = `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(renderedBody)}</div>`;
    const outboundCapture = createOutboundCapture();

    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [recipient],
      bcc: [outboundCapture.address],
      reply_to: REPLY_TO,
      subject,
      text: renderedBody,
      html: htmlBody,
    });
    if (emailResponse.error) {
      return jsonResponse({ success: false, error: "email_send_failed" }, 502);
    }

    // ── 6. Historie kontaktu (snapshot; odeslal člověk, ne AI) ───────────────
    const { error: activityError } = await supabaseAdmin.from("sales_lead_activities").insert({
      lead_id: leadId,
      activity_type: "email_sent",
      direction: "outbound",
      subject,
      body_snapshot: textBody,
      email_message_id: (emailResponse.data as { id?: string } | null)?.id ?? null,
      performed_by: caller.id,
      metadata: {
        sent_by: "human",
        from: "b2b@onemil.cz",
        reply_to: "b2b@onemil.cz",
        to: recipient,
        resend_email_id: (emailResponse.data as { id?: string } | null)?.id ?? null,
        outbound_capture_id: outboundCapture.id,
        references: [],
      },
    });
    if (activityError) {
      return jsonResponse({ success: false, error: "history_write_failed_after_send", email_sent: true });
    }

    // ── 7. Povinné propsání stavu (§18 spec) ─────────────────────────────────
    const { data: statusData, error: statusError } = await supabaseAdmin.rpc("sales_lead_mark_emailed", {
      p_lead_id: leadId,
      p_performed_by: caller.id,
    });
    const statusResult = statusData as {
      success?: boolean;
      status_changed?: boolean;
      new_status?: string;
      current_status?: string;
    } | null;
    const movedToContacted = statusResult?.success === true
      && statusResult.status_changed === true
      && statusResult.new_status === "osloveno";
    const alreadyProgressed = statusResult?.success === true
      && statusResult.status_changed === false
      && typeof statusResult.current_status === "string"
      && ALREADY_CONTACTED_STATUSES.has(statusResult.current_status);
    if (statusError || (!movedToContacted && !alreadyProgressed)) {
      return jsonResponse({ success: false, error: "status_sync_failed_after_send", email_sent: true });
    }

    return jsonResponse({ success: true, lead_id: leadId, sent_to: recipient });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
