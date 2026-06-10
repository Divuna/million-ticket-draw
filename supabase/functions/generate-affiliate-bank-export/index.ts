import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BANK_EXPORT_BUCKET = "affiliate-bank-exports";
const MAX_KPC_BYTES = 50 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PreparedBankExportItem = {
  id: string;
  commission_id: string;
  amount_czk: number | string;
  recipient_account: string;
  recipient_bank_code: string;
  recipient_name: string;
  variable_symbol: string;
  payment_message: string | null;
  constant_symbol: string | null;
  specific_symbol: string | null;
};

type PreparedBankExport = {
  success: boolean;
  status: string;
  batch_id: string;
  batch_number: string;
  due_date: string;
  payer_account: string;
  payer_bank_code: string;
  bank_export_format: string;
  bank_export_encoding: string;
  bank_export_line_endings: string;
  total_amount_czk: number | string;
  item_count: number;
  items: PreparedBankExportItem[];
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

function statusToHttpStatus(status: string): number {
  switch (status) {
    case "missing_batch_id":
    case "missing_payer_account":
    case "invalid_payer_account":
    case "invalid_payer_bank_code":
    case "invalid_airbank_payer_bank_code":
    case "missing_due_date":
    case "invalid_due_date":
    case "empty_batch":
    case "missing_recipient_account":
    case "invalid_recipient_account":
    case "missing_recipient_bank_code":
    case "missing_recipient_name":
    case "invalid_amount":
    case "invalid_variable_symbol":
    case "invalid_constant_symbol":
    case "invalid_specific_symbol":
    case "invalid_payment_message":
    case "invalid_storage_path":
    case "invalid_sha256":
    case "invalid_file_size":
    case "kpc_file_too_large":
      return 400;
    case "access_denied_admin_only":
    case "forbidden":
      return 403;
    case "batch_not_found":
      return 404;
    case "invalid_batch_status":
    case "invalid_commission_status":
    case "batch_update_failed":
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

function parseCzechAccount(raw: string): { prefix: string; number: string } {
  const cleaned = raw.replace(/\s/g, "");
  const match = cleaned.match(/^(?:(\d{1,6})-)?(\d{1,10})$/);
  if (!match) {
    throw new HttpError(400, "invalid_account_format", { account: raw });
  }
  return { prefix: match[1] ?? "0", number: match[2] };
}

function padLeft(value: string, length: number, char = "0"): string {
  return value.slice(-length).padStart(length, char);
}

function padRight(value: string, length: number): string {
  return value.slice(0, length).padEnd(length, " ");
}

function formatAccount(account: string): string {
  const parsed = parseCzechAccount(account);
  return `${padLeft(parsed.prefix || "0", 6)}-${padLeft(parsed.number, 10)}`;
}

function dateDDMMYY(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "invalid_due_date");
  }
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function amountToHalere(value: number | string, length: number): string {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new HttpError(400, "invalid_amount");
  }
  return padLeft(String(Math.round(numberValue * 100)), length);
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeMessage(value: string | null | undefined): string {
  return stripDiacritics(value ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 35);
}

function buildAboKpc(prepared: PreparedBankExport): string {
  const payerAccount = formatAccount(prepared.payer_account);
  const dueDate = dateDDMMYY(prepared.due_date);
  const totalHalere = amountToHalere(prepared.total_amount_czk, 14);
  const lines: string[] = [];

  lines.push(`UHL1`);
  lines.push(`1 1501 000001 ${prepared.payer_bank_code}`);
  lines.push(`2 ${payerAccount} ${totalHalere} ${dueDate}`);

  for (const item of prepared.items) {
    const recipientAccount = formatAccount(item.recipient_account);
    const amountHalere = amountToHalere(item.amount_czk, 14);
    const vs = padLeft(item.variable_symbol, 10);
    const bankAndKs = `${item.recipient_bank_code}${item.constant_symbol ?? "0000"}`;
    const ss = padRight(item.specific_symbol ?? "", 10);
    const message = padRight(normalizeMessage(item.payment_message), 35);

    lines.push(
      `${payerAccount} ${recipientAccount} ${amountHalere} ${vs} ${bankAndKs} ${ss} AV:${message}`,
    );
  }

  lines.push("3 +");
  lines.push("5 +");

  return `${lines.join("\r\n")}\r\n`;
}

function encodeWindows1250AsciiSafe(content: string): Uint8Array {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 0x7F) {
      throw new HttpError(400, "windows_1250_non_ascii_character", { index: i });
    }
    bytes[i] = code;
  }
  return bytes;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let uploadedPath: string | null = null;
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
      .in("role", ["admin", "superadmin"])
      .maybeSingle();
    if (!roleRow) {
      throw new HttpError(403, "access_denied_admin_only");
    }

    const { batch_id } = await req.json();
    const batchId = requireString(batch_id, "missing_batch_id");

    const { data: preparedData, error: prepareError } = await supabaseAdmin.rpc(
      "prepare_affiliate_bank_export",
      { p_batch_id: batchId },
    );
    if (prepareError) throw prepareError;

    const prepared = preparedData as PreparedBankExport;
    if (!prepared?.success) {
      const status = String(prepared?.status ?? "prepare_failed");
      throw new HttpError(statusToHttpStatus(status), status, prepared as unknown as Record<string, unknown>);
    }

    const content = buildAboKpc(prepared);
    const bytes = encodeWindows1250AsciiSafe(content);
    if (bytes.byteLength > MAX_KPC_BYTES) {
      throw new HttpError(400, "kpc_file_too_large", { size_bytes: bytes.byteLength });
    }

    const hash = await sha256Hex(bytes);
    const storagePath = `${new Date().getFullYear()}/${prepared.batch_number}.kpc`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BANK_EXPORT_BUCKET)
      .upload(storagePath, bytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    uploadedPath = storagePath;

    const { data: finalizedData, error: finalizeError } = await supabaseAdmin.rpc(
      "finalize_affiliate_bank_export",
      {
        p_batch_id: batchId,
        p_storage_path: storagePath,
        p_sha256: hash,
        p_size_bytes: bytes.byteLength,
      },
    );
    if (finalizeError) throw finalizeError;

    const finalized = finalizedData as Record<string, unknown>;
    if (!finalized?.success) {
      const status = String(finalized?.status ?? "finalize_failed");
      throw new HttpError(statusToHttpStatus(status), status, finalized);
    }

    return jsonResponse({
      success: true,
      status: "exported",
      batch_id: batchId,
      batch_number: prepared.batch_number,
      bank_export_storage_path: storagePath,
      bank_export_sha256: hash,
      bank_export_size_bytes: bytes.byteLength,
    });
  } catch (error) {
    if (uploadedPath && supabaseAdmin) {
      await supabaseAdmin.storage.from(BANK_EXPORT_BUCKET).remove([uploadedPath]);
    }

    const err = error as Error & { status?: number; code?: string; details?: Record<string, unknown> };
    console.error("generate-affiliate-bank-export error:", err);
    return jsonResponse(
      {
        success: false,
        error: err.code ?? err.message ?? "internal_error",
        details: err.details ?? null,
      },
      err.status ?? 500,
    );
  }
};

serve(handler);
