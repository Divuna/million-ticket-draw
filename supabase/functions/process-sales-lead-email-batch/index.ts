import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.18.1";
import { createOutboundCapture } from "../_shared/salesLeadEmailThreading.ts";
import { authorizeSalesLeadBatchWorkerRequest } from "../_shared/salesLeadBatchWorkerAuth.ts";
import { deliverSalesLeadInitialEmail } from "../_shared/salesLeadInitialEmailDelivery.ts";
import {
  createResendInitialEmailProvider,
  SALES_LEAD_INITIAL_EMAIL_FROM,
  SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
} from "../_shared/salesLeadInitialEmailSender.ts";

// ============================================================================
// process-sales-lead-email-batch — interní worker připravených dávek (PR 4)
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§23, PR 4)
//
// ⚠️ Tato funkce NIKDY nevybírá firmy, nevytváří dávky ani nezapíná automatiku.
//    Zpracuje výhradně položku, kterou člověk předem připravil a schválil, a to
//    nejvýše JEDNU na jeden request. Bez zapnuté automatiky (`enabled=true`)
//    a bez aktivované dávky (`scheduled`) neudělá nic.
//
// Fail-closed bariéry:
//   • jiná metoda než POST            → 405
//   • chybí SALES_LEAD_BATCH_WORKER_SECRET v prostředí → 500, žádná změna
//   • chybný/chybějící Bearer header  → 401
//   • chybí RESEND_API_KEY            → 503 (claim se vůbec nespustí)
//   • vypnutá automatika              → bezpečný no-op
//   • žádná splatná položka           → bezpečný no-op
//
// Autorizace je výhradně interní sdílený secret. Uživatelské JWT ani veřejné
// admin volání se nepoužívá. Funkce nemá cron; spouští ji jen samostatně
// schválený operační krok.
// ============================================================================

const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type ClaimResult = {
  success?: boolean;
  action?: "noop" | "skipped" | "send" | "commit_only";
  reason?: string;
  batch_item_id?: string;
  batch_id?: string;
  lead_id?: string;
  performed_by?: string;
  recipient?: string;
  subject?: string;
  body_source?: string;
  body_text?: string;
  body_html?: string;
};

serve(async (req) => {
  // Bez nakonfigurovaného secretu nebo bez správného Bearer headeru se nesmí
  // stát vůbec nic — žádný claim, žádná mutace, žádný poskytovatel.
  const authorized = authorizeSalesLeadBatchWorkerRequest({
    method: req.method,
    authorization: req.headers.get("Authorization"),
    secret: Deno.env.get("SALES_LEAD_BATCH_WORKER_SECRET"),
  });
  if (!authorized.ok) {
    return jsonResponse({ success: false, error: authorized.error }, authorized.status);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "worker_not_configured" }, 500);
  }
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    // Nic se neclaimne, dokud není poskytovatel dostupný.
    return jsonResponse({ success: false, error: "email_not_configured" }, 503);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabaseAdmin.rpc("sales_lead_email_batch_claim_next", {});
  if (error) {
    return jsonResponse({ success: false, error: "batch_claim_failed" }, 500);
  }
  const claim = (data ?? {}) as ClaimResult;
  if (claim.success !== true) {
    return jsonResponse({ success: false, error: claim.reason ?? "batch_claim_failed" }, 500);
  }
  if (claim.action === "noop") {
    return jsonResponse({ success: true, action: "noop", reason: claim.reason ?? "nothing_due", email_sent: false });
  }
  if (claim.action === "skipped") {
    // Ochrana neprošla — nic se neodesílá a další položka se v tomto běhu nebere.
    return jsonResponse({
      success: true, action: "skipped", reason: claim.reason,
      batch_item_id: claim.batch_item_id, email_sent: false,
    });
  }
  if (!claim.batch_item_id || !claim.lead_id) {
    return jsonResponse({ success: false, error: "batch_claim_incomplete" }, 500);
  }

  // Pro `commit_only` i `send` používáme stejnou bezpečnou delivery vrstvu.
  // Ta sama pozná, že poskytovatel už e-mail přijal, a druhý provider call
  // neprovede — v jednom requestu je tedy nejvýše jeden provider call.
  const provider = createResendInitialEmailProvider(new Resend(resendApiKey));
  const outboundCapture = createOutboundCapture();
  const deliveryResult = await deliverSalesLeadInitialEmail(supabaseAdmin, provider, {
    leadId: claim.lead_id,
    performedBy: String(claim.performed_by ?? ""),
    mode: "batch_initial",
    batchItemId: claim.batch_item_id,
    recipient: String(claim.recipient ?? ""),
    subject: String(claim.subject ?? ""),
    bodySource: String(claim.body_source ?? ""),
    bodyText: String(claim.body_text ?? ""),
    bodyHtml: String(claim.body_html ?? ""),
    attachmentMetadata: [],
    attachments: [],
    outboundCaptureId: outboundCapture.id,
    from: SALES_LEAD_INITIAL_EMAIL_FROM,
    replyTo: SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
  });

  if (deliveryResult.success) {
    return jsonResponse({
      success: true, action: "sent", email_sent: true,
      batch_item_id: claim.batch_item_id, delivery_id: deliveryResult.deliveryId,
    });
  }

  if (deliveryResult.providerAccepted === true) {
    // Poskytovatel e-mail přijal, ale DB commit selhal. Položka zůstane
    // `processing` a další běh smí provést pouze commit_only.
    return jsonResponse({
      success: false, action: "commit_pending", email_sent: true,
      error: deliveryResult.error, batch_item_id: claim.batch_item_id,
      delivery_id: deliveryResult.deliveryId,
    }, 500);
  }

  const outcome = deliveryResult.error === "email_send_failed" ? "rejected" : "uncertain";
  const { data: failureData, error: failureError } = await supabaseAdmin.rpc(
    "sales_lead_email_batch_item_record_failure",
    {
      p_batch_item_id: claim.batch_item_id,
      p_outcome: outcome,
      p_error_code: deliveryResult.error ?? "email_delivery_outcome_unknown",
    },
  );
  const failure = (failureData ?? {}) as { success?: boolean; batch_status?: string };
  return jsonResponse({
    success: false,
    action: outcome === "rejected" ? "failed" : "uncertain",
    email_sent: false,
    error: deliveryResult.error,
    retry_blocked: deliveryResult.retryBlocked === true,
    batch_item_id: claim.batch_item_id,
    batch_status: failure.batch_status,
    failure_recorded: !failureError && failure.success === true,
  }, 502);
});
