import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_BYTES = 32;
const TOKEN_TTL_DAYS = 7;
const MAX_TEXT_LENGTH = 500;
const MAX_NOTE_LENGTH = 2000;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PRODUCTION_APP_URL = "https://onemil.cz";

type LeadInput = {
  company_name?: unknown;
  company_email?: unknown;
  ico?: unknown;
  dic?: unknown;
  website?: unknown;
  contact_person?: unknown;
  contact_phone?: unknown;
  sales_rep_note?: unknown;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readRequiredText(value: unknown, field: string, max = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} is required`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} is required`);
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }

  return trimmed;
}

function readOptionalText(value: unknown, field: string, max = MAX_TEXT_LENGTH): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }

  return trimmed;
}

function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, "website must be a valid absolute URL");
  }

  if (parsed.protocol !== "https:") {
    throw new HttpError(400, "website must use https");
  }

  return parsed.toString();
}

function isUnsafePublicHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.endsWith(".localhost") ||
    normalized.includes("lovable") ||
    normalized.includes("preview--")
  );
}

function getSafePublicAppUrl(): string {
  const raw = (
    Deno.env.get("COMPANY_LEAD_CONFIRMATION_BASE_URL") ??
    Deno.env.get("PUBLIC_APP_URL") ??
    Deno.env.get("SITE_URL") ??
    Deno.env.get("APP_URL") ??
    ""
  ).trim();

  if (!raw) return PRODUCTION_APP_URL;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || isUnsafePublicHost(url.hostname)) {
      return PRODUCTION_APP_URL;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return PRODUCTION_APP_URL;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);

  let raw = "";
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }

  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildConfirmationEmail(params: {
  companyName: string;
  salesRepName: string;
  token: string;
}): string {
  const baseUrl = getSafePublicAppUrl();
  const token = encodeURIComponent(params.token);
  const confirmUrl = `${baseUrl}/partner/invite?token=${token}&action=confirm`;
  const rejectUrl = `${baseUrl}/partner/invite?token=${token}&action=reject`;
  const companyName = escapeHtml(params.companyName);
  const salesRepName = escapeHtml(params.salesRepName);

  return `
    <h2>Zadost o registraci firmy do OneMil</h2>
    <p>Dobry den,</p>
    <p>obchodnik nebo agentura <strong>${salesRepName}</strong> odeslal(a) zadost o registraci firmy <strong>${companyName}</strong> do OneMil.</p>
    <p>OneMil je platforma pro souteze, odmeny, vouchery a partnerske spoluprace. Firma se do systemu neposune ke schvaleni administratorem, dokud tuto zadost nepotvrdite.</p>
    <p>
      <a href="${confirmUrl}" style="display:inline-block;padding:12px 18px;background:#ff8a00;color:#0a0b0f;text-decoration:none;border-radius:6px;font-weight:700">
        Potvrzuji zadost
      </a>
    </p>
    <p>Pokud zadost nechcete potvrdit, muzete ji odmitnout zde: <a href="${rejectUrl}">Zamitnout zadost</a>.</p>
    <p>Pokud jste tuto zadost necekali, muzete ji ignorovat.</p>
    <p>S pozdravem,<br/>Tym OneMil</p>
  `;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed" }, 405);
  }

  let createdLeadId: string | null = null;

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new HttpError(401, "Missing authorization token");
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;

    if (userError || !user) {
      throw new HttpError(401, "Invalid authorization token");
    }

    const body = (await req.json()) as LeadInput;

    const companyName = readRequiredText(body.company_name, "company_name");
    const companyEmail = readRequiredText(body.company_email, "company_email").toLowerCase();
    if (!EMAIL_REGEX.test(companyEmail)) {
      throw new HttpError(400, "company_email is invalid");
    }

    const ico = readOptionalText(body.ico, "ico");
    const dic = readOptionalText(body.dic, "dic");
    const website = normalizeWebsite(readOptionalText(body.website, "website"));
    const contactPerson = readOptionalText(body.contact_person, "contact_person");
    const contactPhone = readOptionalText(body.contact_phone, "contact_phone");
    const salesRepNote = readOptionalText(body.sales_rep_note, "sales_rep_note", MAX_NOTE_LENGTH);

    const { data: affiliateAccount, error: affiliateError } = await supabaseAdmin
      .from("affiliate_accounts")
      .select("id, auth_user_id, name, email, ref_code, modes, status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (affiliateError) {
      throw new Error(`Failed to load affiliate account: ${affiliateError.message}`);
    }

    if (!affiliateAccount) {
      throw new HttpError(403, "Affiliate account not found");
    }
    if (affiliateAccount.status !== "approved") {
      throw new HttpError(403, "Affiliate account is not approved");
    }
    if (!Array.isArray(affiliateAccount.modes) || !affiliateAccount.modes.includes("sales_rep")) {
      throw new HttpError(403, "Affiliate account is not allowed to create company leads");
    }

    const rawCompanyToken = generateToken();
    const tokenHash = await sha256Hex(rawCompanyToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const { data: insertedLead, error: insertError } = await supabaseAdmin
      .from("affiliate_company_leads")
      .insert({
        affiliate_id: affiliateAccount.id,
        sales_rep_affiliate_id_snapshot: affiliateAccount.id,
        sales_rep_ref_code_snapshot: affiliateAccount.ref_code,
        sales_rep_email_snapshot: affiliateAccount.email,
        sales_rep_name_snapshot: affiliateAccount.name,
        company_name: companyName,
        ico,
        dic,
        company_email: companyEmail,
        website,
        contact_person: contactPerson,
        contact_phone: contactPhone,
        sales_rep_note: salesRepNote,
        status: "sent_to_company",
        company_confirmation_token_hash: tokenHash,
        company_confirmation_sent_at: now.toISOString(),
        company_confirmation_expires_at: expiresAt.toISOString(),
      })
      .select("id, status")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new HttpError(409, "Active company lead already exists");
      }
      throw new Error(`Failed to create company lead: ${insertError.message}`);
    }

    createdLeadId = insertedLead.id;

    const emailBody = buildConfirmationEmail({
      companyName,
      salesRepName: affiliateAccount.name,
      token: rawCompanyToken,
    });

    const { error: emailQueueError } = await supabaseAdmin
      .from("email_queue")
      .insert({
        email: companyEmail,
        subject: "Potvrzeni zadosti o registraci firmy do OneMil",
        body: emailBody,
      });

    if (emailQueueError) {
      await supabaseAdmin.from("affiliate_company_leads").delete().eq("id", createdLeadId);
      throw new Error(`Failed to queue company confirmation email: ${emailQueueError.message}`);
    }

    return jsonResponse({
      success: true,
      lead_id: insertedLead.id,
      status: "sent_to_company",
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("create-affiliate-company-lead failed", {
      status,
      lead_id: createdLeadId,
      message,
    });

    return jsonResponse({ success: false, message }, status);
  }
});
