import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";
import {
  escapeEmailHtml,
  renderOneMilDetailRows,
  renderOneMilEmail,
} from "../_shared/oneMilEmailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAGING_REF = "dxmowysntemfqfnanxua";
const SAFE_STAGING_RECIPIENT = "eshop@onemil.cz";

/**
 * Authorization:
 *  1. backend/automation path — `x-internal-token` matching INTERNAL_FUNCTION_TOKEN
 *     OR service-role bearer token
 *  2. admin fallback path — logged-in superadmin JWT (no secret in browser)
 * Resend (explicit superadmin re-send) always requires the admin JWT path.
 */
async function authorizeRequest(
  req: Request,
  options: { adminJwtOnly?: boolean } = {},
): Promise<{ status: number; error: string } | null> {
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  const provided = req.headers.get("x-internal-token");
  if (!options.adminJwtOnly && internalToken && provided && provided === internalToken) return null;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "missing_authorization" };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!options.adminJwtOnly && serviceKey && token === serviceKey) return null;

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return { status: 401, error: "invalid_authorization_token" };

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "superadmin")
    .maybeSingle();
  if (!roleRow) return { status: 403, error: "access_denied_superadmin_only" };

  return null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** Latest recorded PDF export (reused so we never create a duplicate PDF). */
async function latestPdfExport(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
): Promise<{ id: string; storage_bucket: string; storage_path: string } | null> {
  const { data } = await supabase
    .from("partner_invoice_exports")
    .select("id, storage_bucket, storage_path, created_at")
    .eq("invoice_id", invoiceId)
    .eq("format", "pdf")
    .eq("storage_bucket", "partner-invoices")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.storage_bucket && data?.storage_path) {
    return {
      id: data.id as string,
      storage_bucket: data.storage_bucket as string,
      storage_path: data.storage_path as string,
    };
  }
  return null;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function buildAttachment(
  supabase: ReturnType<typeof createClient>,
  exportRow: { storage_bucket: string; storage_path: string },
  periodStart: string,
  periodEnd: string,
) {
  const { data, error } = await supabase.storage
    .from(exportRow.storage_bucket)
    .download(exportRow.storage_path);
  if (error || !data) throw new Error("pdf_storage_download_failed");
  const arrayBuffer = await data.arrayBuffer();
  const base64Content = base64FromBytes(new Uint8Array(arrayBuffer));
  return {
    filename: `faktura-${periodStart}-${periodEnd}.pdf`,
    content: base64Content,
    content_type: "application/pdf",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: { invoice_id?: string; resend?: boolean; mode?: string };
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ error: "invalid_json" }, 400);
  }

  const isResend = payload.resend === true || payload.mode === "resend";
  const authFailure = await authorizeRequest(req, { adminJwtOnly: isResend });
  if (authFailure) return json({ error: authFailure.error }, authFailure.status);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);
  const isStaging = supabaseUrl.includes(STAGING_REF);

  const { invoice_id } = payload;
  if (!invoice_id) return json({ error: "Missing invoice_id" }, 400);

  // Load invoice + partner.
  const { data: invoice, error: invError } = await supabase
    .from("partner_invoices")
    .select("*, partner:partners(name, company_name, contact_email)")
    .eq("id", invoice_id)
    .maybeSingle();
  if (invError) return json({ error: `load_failed: ${invError.message}` }, 500);
  if (!invoice) return json({ error: "invoice_not_found" }, 404);

  const partner = invoice.partner as { name?: string; company_name?: string | null; contact_email?: string | null } | null;
  if (!partner) return json({ error: "partner_not_found" }, 404);
  const recipientEmail = partner.contact_email ?? null;
  if (!recipientEmail) return json({ error: "partner_has_no_contact_email" }, 400);
  if (isStaging && recipientEmail !== SAFE_STAGING_RECIPIENT) {
    return json(
      { error: "recipient_not_allowed_for_staging_test", sent_to: recipientEmail, allowed_recipient: SAFE_STAGING_RECIPIENT },
      403,
    );
  }

  const periodStart = invoice.period_start;
  const periodEnd = invoice.period_end;
  const partnerName = partner.company_name || partner.name || "Partner";
  const amountGross = Number(invoice.amount_gross ?? 0);
  const formattedAmount = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(amountGross);

  // ── Resend path: explicit superadmin re-send. Requires an existing PDF,
  //    does NOT touch the first-send claim, does NOT change status. ──────────
  if (isResend) {
    const pdf = await latestPdfExport(supabase, invoice_id);
    if (!pdf) return json({ error: "pdf_export_required_for_resend" }, 409);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json({ error: "email_service_not_configured" }, 503);

    let attachment;
    try {
      attachment = await buildAttachment(supabase, pdf, periodStart, periodEnd);
    } catch (_e) {
      return json({ error: "pdf_fetch_failed" }, 502);
    }

    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: "OneMil <noreply@onemil.cz>",
      to: [recipientEmail],
      subject: `Faktura OneMil – ${periodStart} – ${periodEnd}`,
      html: renderEmail(partnerName, periodStart, periodEnd, formattedAmount),
      attachments: [attachment],
    });
    if (emailResponse.error) return json({ error: `resend_error: ${emailResponse.error.message}` }, 502);
    return json({ success: true, resend: true, sent_to: recipientEmail, pdf_export_id: pdf.id, status_updated: false }, 200);
  }

  // ── Initial send path (manual "Odeslat e-mailem" AND weekly automation). ──
  if (invoice.status !== "draft") {
    return json({ success: false, skipped: true, reason: `invoice_status_${invoice.status}_not_draft` }, 200);
  }

  // 1. Atomic shared reservation. Two concurrent callers / auto+manual: only
  //    one wins; the loser is skipped and sends nothing.
  const { data: claimed, error: claimError } = await supabase.rpc("claim_partner_invoice_for_auto_send", {
    p_invoice_id: invoice_id,
  });
  if (claimError) return json({ error: `claim_failed: ${claimError.message}` }, 500);
  if (claimed !== true) {
    return json({ success: false, skipped: true, reason: "already_claimed_or_sent" }, 200);
  }

  let emailSent = false;
  try {
    // 2. Ensure a PDF exists — REUSE the latest export; only generate when none
    //    exists (so retries and repeated runs never add a duplicate PDF).
    let pdf = await latestPdfExport(supabase, invoice_id);
    if (!pdf) {
      const { data: gen, error: genError } = await supabase.functions.invoke("generate-partner-invoice-pdf", {
        body: { invoice_id },
        headers: { "x-internal-token": internalToken },
      });
      if (genError || !gen?.success) throw new Error(genError?.message ?? "pdf_generation_failed");
      pdf = await latestPdfExport(supabase, invoice_id);
      if (!pdf) throw new Error("pdf_unavailable_after_generate");
    }

    // 3. Build the attachment from the (reused or freshly generated) PDF.
    const attachment = await buildAttachment(supabase, pdf, periodStart, periodEnd);

    // 4. Send exactly one email.
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("email_service_not_configured");
    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: "OneMil <noreply@onemil.cz>",
      to: [recipientEmail],
      subject: `Faktura OneMil – ${periodStart} – ${periodEnd}`,
      html: renderEmail(partnerName, periodStart, periodEnd, formattedAmount),
      attachments: [attachment],
    });
    if (emailResponse.error) throw new Error(`resend_error: ${emailResponse.error.message}`);
    emailSent = true;

    // 5. Only after a successful send: close draft -> issued and verify that
    //    EXACTLY ONE row changed. If zero rows changed, do not report success.
    const { data: updatedRows, error: updateError } = await supabase
      .from("partner_invoices")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("id", invoice_id)
      .eq("status", "draft")
      .select("id");
    if (updateError) {
      return json({ success: false, sent_to: recipientEmail, status_updated: false, reason: `status_update_error: ${updateError.message}` }, 500);
    }
    if (!updatedRows || updatedRows.length !== 1) {
      return json({ success: false, sent_to: recipientEmail, status_updated: false, reason: "status_close_zero_rows" }, 409);
    }

    return json({ success: true, sent_to: recipientEmail, status_updated: true }, 200);
  } catch (error) {
    // Failure before a successful send: release the reservation so a later
    // attempt can retry; the invoice stays 'draft' and no duplicate PDF is
    // created (existing export is reused on retry).
    if (!emailSent) {
      await supabase.rpc("release_partner_invoice_auto_send_claim", { p_invoice_id: invoice_id });
    }
    const message = (error as Error).message;
    const status = message === "email_service_not_configured" ? 503 : 500;
    return json({ success: false, error: message, status_updated: false }, status);
  }
});

function renderEmail(partnerName: string, periodStart: string, periodEnd: string, formattedAmount: string): string {
  // Note: the invoice status is intentionally NOT shown — on the first
  // successful send the invoice is being issued, so "draft" must never appear.
  return renderOneMilEmail({
    preheader: `Faktura OneMil za období ${periodStart} až ${periodEnd}.`,
    eyebrow: "Partnerská fakturace",
    title: "Vaše faktura OneMil",
    bodyHtml: `
      <p style="margin:0 0 18px;">Dobrý den,</p>
      <p style="margin:0 0 22px;">pro partnera <strong>${escapeEmailHtml(partnerName)}</strong> jsme připravili fakturu. PDF dokument najdete v příloze tohoto e-mailu.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7EBDD;border:1px solid #F2A16B;border-radius:12px;border-collapse:separate;overflow:hidden;">
        ${renderOneMilDetailRows([
          { label: "Období", value: `${escapeEmailHtml(periodStart)} – ${escapeEmailHtml(periodEnd)}` },
          { label: "Celková částka", value: escapeEmailHtml(formattedAmount) },
        ])}
      </table>
    `,
    action: {
      label: "Otevřít partnerský portál",
      url: "https://onemil.cz/partner/dashboard",
    },
    footerNote: "PDF faktura je přiložena k tomuto e-mailu.",
  });
}
