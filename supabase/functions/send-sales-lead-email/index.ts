import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.18.1";
import { renderSalesLeadEmailHtml, renderSalesLeadEmailText } from "../_shared/salesLeadEmailRendering.ts";
import { createOutboundCapture } from "../_shared/salesLeadEmailThreading.ts";
import { parseSalesLeadEmailAttachments } from "../_shared/salesLeadEmailAttachments.ts";
import {
  classifyInitialEmailProviderError,
  deliverSalesLeadInitialEmail,
  InitialEmailProviderOutcomeUncertainError,
} from "../_shared/salesLeadInitialEmailDelivery.ts";

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

const FROM_ADDRESS = "Miroslav Frydrych | OneMil <b2b@onemil.cz>";
const REPLY_TO = "Miroslav Frydrych | OneMil <b2b@onemil.cz>";
const INITIAL_EMAIL_ALLOWED_STATUSES = new Set(["novy", "priprava", "schvaleni_ceka"]);

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateEmailContent(subject: string, body: string): string | null {
  if (!subject.trim()) return "email_subject_required";
  if (!body.trim()) return "email_body_required";
  if (subject.trim().length > 300) return "email_subject_too_long";
  if (body.trim().length > 20_000) return "email_body_too_long";
  if (/\{\{[^{}]+\}\}/.test(`${subject}\n${body}`)) return "unresolved_template_variables";
  return null;
}

function isValidRecipient(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

function resendErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as Record<string, unknown>;
  const candidate = typeof value.name === "string" ? value.name
    : typeof value.code === "string" ? value.code
    : null;
  return candidate?.trim().toLowerCase() || null;
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
    const reuseSourceActivityId = typeof body.reuse_source_activity_id === "string"
      ? body.reuse_source_activity_id.trim()
      : null;
    const reuseMode = body.reuse_mode === "resend" || body.reuse_mode === "forward"
      ? body.reuse_mode
      : null;
    const isReuse = Boolean(reuseSourceActivityId);
    if (isReuse !== Boolean(reuseMode)) {
      return jsonResponse({ success: false, error: "invalid_reuse_request" }, 422);
    }
    const subject = typeof body.subject === "string" ? body.subject : null;
    const textBody = typeof body.body === "string" ? body.body : null;
    if (subject === null || textBody === null) {
      return jsonResponse({ success: false, error: "email_content_required" }, 422);
    }
    const contentError = validateEmailContent(subject, textBody);
    if (contentError) return jsonResponse({ success: false, error: contentError }, 422);
    const attachmentResult = parseSalesLeadEmailAttachments(body.attachments);
    if (!attachmentResult.ok) return jsonResponse({ success: false, error: attachmentResult.error }, 422);

    // ── 3. Load lead ─────────────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("sales_leads")
      .select("id, company_name, status, contact_email, email_verified_by_admin, do_not_contact")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) return jsonResponse({ success: false, error: "lead_lookup_failed" }, 500);
    if (!lead) return jsonResponse({ success: false, error: "lead_not_found" }, 404);
    if (lead.status === "navrzeny") {
      if (!isReuse) {
        return jsonResponse({ success: false, error: "proposal_not_approved" }, 409);
      }
    }
    if (!isReuse && !INITIAL_EMAIL_ALLOWED_STATUSES.has(lead.status)) {
      return jsonResponse({ success: false, error: "initial_email_status_not_allowed" }, 409);
    }

    // ── 4. Tvrdé bariéry ─────────────────────────────────────────────────────
    const recipient = isReuse
      ? (typeof body.recipient === "string" ? body.recipient.trim().toLowerCase() : "")
      : (lead.contact_email ?? "").trim().toLowerCase();
    if (!isReuse && (!recipient || lead.email_verified_by_admin !== true)) {
      return jsonResponse({ success: false, error: "missing_contact_email" }, 422);
    }
    if (!isValidRecipient(recipient)) {
      return jsonResponse({ success: false, error: "invalid_recipient" }, 422);
    }
    if (lead.do_not_contact === true) {
      return jsonResponse({ success: false, error: "do_not_contact" }, 403);
    }

    type ReuseSource = {
      id: string;
      metadata: Record<string, unknown> | null;
    };
    let reuseSource: ReuseSource | null = null;
    if (isReuse) {
      const { data: source, error: sourceError } = await supabaseAdmin
        .from("sales_lead_activities")
        .select("id, metadata")
        .eq("id", reuseSourceActivityId)
        .eq("lead_id", leadId)
        .eq("activity_type", "email_sent")
        .eq("direction", "outbound")
        .maybeSingle();
      if (sourceError) {
        return jsonResponse({ success: false, error: "reuse_source_lookup_failed" }, 500);
      }
      if (!source) {
        return jsonResponse({ success: false, error: "reuse_source_not_found" }, 404);
      }
      reuseSource = source as unknown as ReuseSource;
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
    if (!isReuse) {
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

    const renderedText = renderSalesLeadEmailText(textBody);
    const renderedHtml = renderSalesLeadEmailHtml(textBody);
    const outboundCapture = createOutboundCapture();

    const resend = new Resend(resendApiKey);
    if (!isReuse) {
      const deliveryResult = await deliverSalesLeadInitialEmail(
        supabaseAdmin,
        {
          send: async (payload, idempotencyKey) => {
            const response = await resend.emails.send(payload as never, { idempotencyKey });
            if (response.error) {
              const decision = classifyInitialEmailProviderError(resendErrorCode(response.error));
              if (decision.outcome === "rejected") {
                return { accepted: false as const, errorCode: "email_send_failed" };
              }
              throw new InitialEmailProviderOutcomeUncertainError(decision.errorCode);
            }
            const messageId = (response.data as { id?: string } | null)?.id;
            if (!messageId) throw new Error("provider_response_missing_message_id");
            return { accepted: true as const, messageId };
          },
        },
        {
          leadId,
          performedBy: caller.id,
          recipient,
          subject,
          bodySource: textBody,
          bodyText: renderedText,
          bodyHtml: renderedHtml,
          attachmentMetadata: attachmentResult.metadata,
          attachments: attachmentResult.attachments,
          outboundCaptureId: outboundCapture.id,
          from: FROM_ADDRESS,
          replyTo: REPLY_TO,
        },
      );
      if (!deliveryResult.success) {
        const status = deliveryResult.retryBlocked ? 409
          : deliveryResult.providerAccepted ? 500
          : deliveryResult.error === "email_send_failed" ? 502
          : 409;
        return jsonResponse({
          success: false,
          error: deliveryResult.error,
          email_sent: deliveryResult.providerAccepted === true,
          retry_blocked: deliveryResult.retryBlocked === true,
          delivery_id: deliveryResult.deliveryId,
        }, status);
      }
      return jsonResponse({ success: true, lead_id: leadId, sent_to: recipient, delivery_id: deliveryResult.deliveryId });
    }

    const emailPayload: Record<string, unknown> = {
      from: FROM_ADDRESS,
      to: [recipient],
      bcc: [outboundCapture.address],
      reply_to: REPLY_TO,
      subject,
      text: renderedText,
      html: renderedHtml,
    };
    if (attachmentResult.attachments.length > 0) {
      emailPayload.attachments = attachmentResult.attachments;
    }
    const emailResponse = await resend.emails.send(emailPayload as never);
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
        sent_by: isReuse ? (reuseMode === "forward" ? "human_forward" : "human_resend") : "human",
        from: "b2b@onemil.cz",
        reply_to: "b2b@onemil.cz",
        to: recipient,
        reused_from_activity_id: reuseSource?.id ?? null,
        reuse_mode: reuseMode,
        original_recipient: typeof reuseSource?.metadata?.to === "string"
          ? reuseSource.metadata.to
          : null,
        resend_email_id: (emailResponse.data as { id?: string } | null)?.id ?? null,
        outbound_capture_id: outboundCapture.id,
        attachments: attachmentResult.metadata,
        references: [],
      },
    });
    if (activityError) {
      return jsonResponse({ success: false, error: "history_write_failed_after_send", email_sent: true });
    }

    // ── 7. Povinné propsání stavu (§18 spec) ─────────────────────────────────
    return jsonResponse({
      success: true,
      lead_id: leadId,
      sent_to: recipient,
      reused_from_activity_id: reuseSource?.id ?? null,
    });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
