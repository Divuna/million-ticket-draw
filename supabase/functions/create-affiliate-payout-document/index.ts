import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const PAYOUT_DOC_BUCKET = "affiliate-payout-docs";

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

type DocumentType = "commission_statement" | "self_billed_tax_invoice";

type PreparedPayoutDocument = {
  success: boolean;
  status: string;
  commission_id: string;
  affiliate_id: string;
  document_number: string;
  document_type: DocumentType;
  recipient_name: string;
  recipient_email: string;
  recipient_ico: string | null;
  recipient_vat_id: string | null;
  recipient_billing_address: string | null;
  recipient_is_vat_payer: boolean;
  recipient_subject_type: string | null;
  amount_base_czk: number;
  vat_rate: number;
  amount_total_czk: number;
  accounting_email: string;
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

function statusToHttpStatus(status: string): number {
  switch (status) {
    case "missing_commission_id":
    case "missing_accounting_email":
    case "missing_recipient_name":
    case "missing_recipient_email":
    case "missing_recipient_vat_id":
    case "invalid_amount":
    case "invalid_document_number":
    case "missing_pdf_storage_path":
    case "invalid_pdf_sha256":
      return 400;
    case "access_denied_admin_only":
    case "access_denied_superadmin_only":
      return 403;
    case "commission_not_found":
      return 404;
    case "invalid_commission_status":
    case "document_already_exists":
    case "commission_update_failed":
      return 409;
    default:
      return 500;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createPdf(input: {
  documentNumber: string;
  documentType: DocumentType;
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

  const [regularBytes, boldBytes] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf").then((res) => res.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf").then((res) => res.arrayBuffer()),
  ]);

  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
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

  page.drawText("OneMil - affiliate payout document", {
    x: 48,
    y: 60,
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

  let uploadedPdfPath: string | null = null;
  let supabaseAdmin: ReturnType<typeof createClient> | null = null;

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "method_not_allowed");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
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
      .eq("role", "superadmin")
      .maybeSingle();
    if (!roleRow) {
      throw new HttpError(403, "access_denied_superadmin_only");
    }

    const { commission_id } = await req.json();
    const commissionId = requireString(commission_id, "missing_commission_id");

    const { data: preparedData, error: prepareError } = await supabaseAdmin.rpc(
      "prepare_affiliate_payout_document",
      { p_commission_id: commissionId },
    );
    if (prepareError) throw prepareError;

    const prepared = preparedData as PreparedPayoutDocument;
    if (!prepared?.success) {
      const status = String(prepared?.status ?? "prepare_failed");
      throw new HttpError(statusToHttpStatus(status), status);
    }

    const createdAt = new Date();
    const pdfBytes = await createPdf({
      documentNumber: prepared.document_number,
      documentType: prepared.document_type,
      recipientName: prepared.recipient_name,
      recipientEmail: prepared.recipient_email,
      recipientIco: prepared.recipient_ico,
      recipientVatId: prepared.recipient_vat_id,
      recipientAddress: prepared.recipient_billing_address,
      recipientIsVatPayer: prepared.recipient_is_vat_payer,
      amountBase: Number(prepared.amount_base_czk),
      vatRate: Number(prepared.vat_rate),
      amountTotal: Number(prepared.amount_total_czk),
      createdAt,
    });
    const pdfHash = await sha256Hex(pdfBytes);
    const pdfStoragePath = `${new Date().getFullYear()}/${commissionId}/${prepared.document_number}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PAYOUT_DOC_BUCKET)
      .upload(pdfStoragePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    uploadedPdfPath = pdfStoragePath;

    const { data: finalizedData, error: finalizeError } = await supabaseAdmin.rpc(
      "finalize_affiliate_payout_document",
      {
        p_commission_id: commissionId,
        p_document_number: prepared.document_number,
        p_pdf_storage_path: pdfStoragePath,
        p_pdf_sha256: pdfHash,
        p_affiliate_email_subject: `OneMil payout doklad ${prepared.document_number}`,
        p_affiliate_email_body: buildAffiliateEmail({
          recipientName: prepared.recipient_name,
          documentNumber: prepared.document_number,
          amountTotal: Number(prepared.amount_total_czk),
        }),
        p_accounting_email_subject: `Kopie payout dokladu ${prepared.document_number}`,
        p_accounting_email_body: buildAccountingEmail({
          recipientName: prepared.recipient_name,
          documentNumber: prepared.document_number,
          amountTotal: Number(prepared.amount_total_czk),
        }),
      },
    );
    if (finalizeError) throw finalizeError;

    const finalized = finalizedData as Record<string, unknown>;
    if (!finalized?.success) {
      throw new HttpError(
        statusToHttpStatus(String(finalized?.status ?? "finalize_failed")),
        String(finalized?.status ?? "finalize_failed"),
      );
    }

    uploadedPdfPath = null;

    return jsonResponse({
      success: true,
      status: "created",
      document_id: finalized.document_id,
      document_number: finalized.document_number,
      pdf_storage_path: finalized.pdf_storage_path,
      email_queue_id: finalized.email_queue_id,
      accounting_email_queue_id: finalized.accounting_email_queue_id,
      commission_status: finalized.commission_status,
    });
  } catch (error: any) {
    if (uploadedPdfPath && supabaseAdmin) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(PAYOUT_DOC_BUCKET)
        .remove([uploadedPdfPath]);
      if (cleanupError) {
        console.error("create-affiliate-payout-document cleanup failed:", cleanupError.message);
      }
    }

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
