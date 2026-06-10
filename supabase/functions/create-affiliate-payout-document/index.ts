import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPLIER = {
  name: "ICONIC POINT s.r.o.",
  ico: "17795851",
  vatId: "CZ17795851",
  address: "Tyrsova 1832/7, Nove Mesto, 120 00 Praha 2",
};

class HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, details?: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, code);
  }
  return value.trim();
}

function formatCzk(value: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function buildBillingAddress(affiliate: Record<string, unknown>): string | null {
  const parts = [
    affiliate.billing_street,
    [affiliate.billing_zip, affiliate.billing_city].filter(Boolean).join(" "),
    affiliate.billing_country,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createPdf(input: {
  documentNumber: string;
  documentType: "commission_statement" | "self_billed_tax_invoice";
  recipientName: string;
  recipientEmail: string;
  recipientIco: string | null;
  recipientVatId: string | null;
  recipientAddress: string | null;
  recipientIsVatPayer: boolean;
  amountBase: number;
  vatRate: number;
  amountTotal: number;
  createdAt: Date;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const regularBytes = await fetch(
    "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
  ).then((res) => res.arrayBuffer());
  const boldBytes = await fetch(
    "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
  ).then((res) => res.arrayBuffer());

  const regular = await pdf.embedFont(regularBytes);
  const bold = await pdf.embedFont(boldBytes);
  const page = pdf.addPage([595.28, 841.89]);
  const { height } = page.getSize();
  let y = height - 58;

  const draw = (text: string, x: number, size = 10, useBold = false) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: useBold ? bold : regular,
      color: rgb(0.08, 0.09, 0.11),
    });
    y -= size + 8;
  };

  const title =
    input.documentType === "self_billed_tax_invoice"
      ? "Faktura - danovy doklad (vystaveno zakaznikem)"
      : "Vyuctovani provize";

  draw(title, 48, 18, true);
  draw(`Cislo dokladu: ${input.documentNumber}`, 48, 11, true);
  draw(`Datum vystaveni: ${formatDate(input.createdAt)}`, 48);
  y -= 12;

  draw("Vystavitel / zakaznik", 48, 12, true);
  draw(SUPPLIER.name, 48);
  draw(`ICO: ${SUPPLIER.ico}, DIC: ${SUPPLIER.vatId}`, 48);
  draw(SUPPLIER.address, 48);
  y -= 10;

  draw("Prijemce provize", 48, 12, true);
  draw(input.recipientName, 48);
  draw(input.recipientEmail, 48);
  if (input.recipientIco) draw(`ICO: ${input.recipientIco}`, 48);
  if (input.recipientVatId) draw(`DIC: ${input.recipientVatId}`, 48);
  if (input.recipientAddress) draw(input.recipientAddress, 48);
  y -= 12;

  draw("Polozka", 48, 12, true);
  draw("Affiliate / obchodni provize OneMil", 48);
  draw(`Zaklad: ${formatCzk(input.amountBase)}`, 48);
  draw(`Sazba DPH: ${Math.round(input.vatRate * 100)} %`, 48);
  draw(`Celkem k vyplate: ${formatCzk(input.amountTotal)}`, 48, 12, true);
  y -= 12;

  if (input.recipientIsVatPayer) {
    draw("Doklad je vystaven zakaznikem na zaklade souhlasu se samofakturaci.", 48);
    draw("Text pro danovy doklad: vystaveno zakaznikem.", 48);
  } else {
    draw("Prijemce neni platce DPH, DPH se neuplatnuje.", 48);
  }

  y = 60;
  page.drawText("OneMil - affiliate payout document", {
    x: 48,
    y,
    size: 8,
    font: regular,
    color: rgb(0.45, 0.48, 0.52),
  });

  return await pdf.save();
}

function buildAffiliateEmail(input: {
  recipientName: string;
  documentNumber: string;
  amountTotal: number;
}) {
  return `
    <p>Dobry den,</p>
    <p>v priloze posilame doklad k vyplate affiliate / obchodni provize.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Prijemce:</td><td>${input.recipientName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Doklad:</td><td><strong>${input.documentNumber}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Castka:</td><td><strong>${formatCzk(input.amountTotal)}</strong></td></tr>
    </table>
    <p>S pozdravem,<br/>Tym OneMil</p>
  `;
}

function buildAccountingEmail(input: {
  recipientName: string;
  documentNumber: string;
  amountTotal: number;
}) {
  return `
    <p>Dobry den,</p>
    <p>v priloze je kopie payout dokladu pro ucetnictvi.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Prijemce:</td><td>${input.recipientName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Doklad:</td><td><strong>${input.documentNumber}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Castka:</td><td><strong>${formatCzk(input.amountTotal)}</strong></td></tr>
    </table>
  `;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "method_not_allowed");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new HttpError(401, "missing_authorization_header");
    }

    const jwtToken = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwtToken);
    const caller = userData?.user;
    if (userError || !caller) {
      throw new HttpError(401, "invalid_authorization_token");
    }

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "superadmin"])
      .maybeSingle();
    if (!roleRow) {
      throw new HttpError(403, "access_denied_admin_only");
    }

    const { commission_id } = await req.json();
    const commissionId = requireString(commission_id, "missing_commission_id");

    const { data: settingsRow, error: settingsError } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "accounting_email")
      .maybeSingle();
    if (settingsError) throw settingsError;

    const accountingEmail = settingsRow?.value?.trim();
    if (!accountingEmail) {
      throw new HttpError(400, "missing_accounting_email");
    }

    const { data: commission, error: commissionError } = await supabaseAdmin
      .from("affiliate_commissions")
      .select(
        `id, affiliate_id, status, commission_type, amount_base_czk, vat_rate, amount_total_czk, payout_document_id,
         affiliate_accounts!affiliate_commissions_affiliate_id_fkey(
           id, name, email, ico, vat_id, is_vat_payer, payout_account, payout_bank,
           billing_street, billing_city, billing_zip, billing_country
         )`,
      )
      .eq("id", commissionId)
      .maybeSingle();
    if (commissionError) throw commissionError;
    if (!commission) throw new HttpError(404, "commission_not_found");
    if (commission.status !== "approved") {
      throw new HttpError(409, "invalid_commission_status", { current_status: commission.status });
    }
    if (commission.payout_document_id) {
      throw new HttpError(409, "payout_document_already_linked");
    }

    const affiliate = (commission as any).affiliate_accounts;
    if (!affiliate) throw new HttpError(400, "missing_affiliate_account");

    const recipientName = requireString(affiliate.name, "missing_recipient_name");
    const recipientEmail = requireString(affiliate.email, "missing_recipient_email");
    const amountBase = Number(commission.amount_base_czk ?? 0);
    const vatRate = Number(commission.vat_rate ?? 0);
    const amountTotal = Number(commission.amount_total_czk ?? 0);
    if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
      throw new HttpError(400, "invalid_amount");
    }

    const documentType = affiliate.is_vat_payer
      ? "self_billed_tax_invoice"
      : "commission_statement";
    if (affiliate.is_vat_payer && !affiliate.vat_id) {
      throw new HttpError(400, "missing_recipient_vat_id");
    }

    const { data: documentNumber, error: numberError } = await supabaseAdmin.rpc(
      "next_affiliate_payout_document_number",
    );
    if (numberError || !documentNumber) {
      throw new Error(numberError?.message ?? "document_number_generation_failed");
    }

    const createdAt = new Date();
    const recipientAddress = buildBillingAddress(affiliate);
    const pdfBytes = await createPdf({
      documentNumber,
      documentType,
      recipientName,
      recipientEmail,
      recipientIco: affiliate.ico ?? null,
      recipientVatId: affiliate.vat_id ?? null,
      recipientAddress,
      recipientIsVatPayer: Boolean(affiliate.is_vat_payer),
      amountBase,
      vatRate,
      amountTotal,
      createdAt,
    });
    const pdfHash = await sha256Hex(pdfBytes);
    const pdfStoragePath = `${new Date().getFullYear()}/${commissionId}/${documentNumber}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("affiliate-payout-docs")
      .upload(pdfStoragePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: document, error: documentError } = await supabaseAdmin
      .from("affiliate_payout_documents")
      .insert({
        commission_id: commission.id,
        affiliate_id: commission.affiliate_id,
        document_number: documentNumber,
        document_type: documentType,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        recipient_ico: affiliate.ico ?? null,
        recipient_vat_id: affiliate.vat_id ?? null,
        recipient_billing_address: recipientAddress,
        recipient_is_vat_payer: Boolean(affiliate.is_vat_payer),
        recipient_subject_type: affiliate.is_vat_payer ? "vat_payer" : "non_vat_payer",
        amount_base_czk: amountBase,
        vat_rate: vatRate,
        amount_total_czk: amountTotal,
        pdf_url: null,
        pdf_storage_path: pdfStoragePath,
        pdf_generated_at: createdAt.toISOString(),
        pdf_sha256: pdfHash,
        email_status: "pending",
        affiliate_email: recipientEmail,
        accounting_email: accountingEmail,
      } as any)
      .select("id")
      .single();
    if (documentError || !document) throw documentError;

    const attachment = {
      attachment_storage_bucket: "affiliate-payout-docs",
      attachment_storage_path: pdfStoragePath,
      attachment_filename: `${documentNumber}.pdf`,
      attachment_content_type: "application/pdf",
      attachment_required: true,
    };

    const { data: affiliateEmail, error: affiliateEmailError } = await supabaseAdmin
      .from("email_queue")
      .insert({
        email: recipientEmail,
        subject: `OneMil payout doklad ${documentNumber}`,
        body: buildAffiliateEmail({ recipientName, documentNumber, amountTotal }),
        ...attachment,
      } as any)
      .select("id")
      .single();
    if (affiliateEmailError || !affiliateEmail) throw affiliateEmailError;

    const { data: accountingEmailRow, error: accountingEmailError } = await supabaseAdmin
      .from("email_queue")
      .insert({
        email: accountingEmail,
        subject: `Kopie payout dokladu ${documentNumber}`,
        body: buildAccountingEmail({ recipientName, documentNumber, amountTotal }),
        ...attachment,
      } as any)
      .select("id")
      .single();
    if (accountingEmailError || !accountingEmailRow) throw accountingEmailError;

    const { error: updateDocumentError } = await supabaseAdmin
      .from("affiliate_payout_documents")
      .update({
        email_queue_id: affiliateEmail.id,
        accounting_email_queue_id: accountingEmailRow.id,
      } as any)
      .eq("id", document.id);
    if (updateDocumentError) throw updateDocumentError;

    const { error: updateCommissionError } = await supabaseAdmin
      .from("affiliate_commissions")
      .update({
        status: "ready_to_pay",
        payout_document_id: document.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", commission.id)
      .eq("status", "approved");
    if (updateCommissionError) throw updateCommissionError;

    return jsonResponse({
      success: true,
      status: "created",
      document_id: document.id,
      document_number: documentNumber,
      pdf_storage_path: pdfStoragePath,
      email_queue_id: affiliateEmail.id,
      accounting_email_queue_id: accountingEmailRow.id,
      commission_status: "ready_to_pay",
    });
  } catch (error: any) {
    console.error("create-affiliate-payout-document error:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "internal_error";
    return jsonResponse(
      {
        success: false,
        status: code,
        error: code,
        details: error instanceof HttpError ? error.details ?? null : error?.message ?? null,
      },
      status,
    );
  }
});
