import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type LeadRow = {
  id: string;
  status: string;
  company_name: string;
  sales_rep_name_snapshot: string | null;
  company_confirmation_expires_at: string | null;
  company_confirmation_used_at: string | null;
};

async function findAndValidateLead(
  supabaseAdmin: ReturnType<typeof createClient>,
  tokenHash: string,
): Promise<LeadRow> {
  const { data: lead, error } = await supabaseAdmin
    .from("affiliate_company_leads")
    .select(
      "id, status, company_name, sales_rep_name_snapshot, company_confirmation_expires_at, company_confirmation_used_at",
    )
    .eq("company_confirmation_token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(`DB lookup failed: ${error.message}`);
  if (!lead) throw new HttpError(404, "invalid_token");

  // Check expiry
  if (lead.company_confirmation_expires_at) {
    const expiresAt = new Date(lead.company_confirmation_expires_at);
    if (expiresAt < new Date()) throw new HttpError(410, "expired_token");
  }

  // Check already processed (token was used or status advanced)
  if (lead.status !== "sent_to_company") {
    throw new HttpError(409, "already_processed");
  }

  return lead as LeadRow;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const url = new URL(req.url);

    // ── GET — return safe request summary for page display ──────────────────
    if (req.method === "GET") {
      const rawToken = url.searchParams.get("token");
      if (!rawToken) throw new HttpError(400, "missing_token");

      const tokenHash = await sha256Hex(rawToken);
      const lead = await findAndValidateLead(supabaseAdmin, tokenHash);

      return jsonResponse({
        success: true,
        company_name: lead.company_name,
        sales_rep_name: lead.sales_rep_name_snapshot ?? null,
        expires_at: lead.company_confirmation_expires_at ?? null,
      });
    }

    // ── POST — perform confirm or reject ────────────────────────────────────
    if (req.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "invalid_json");
      }

      const rawToken = typeof body.token === "string" ? body.token.trim() : null;
      if (!rawToken) throw new HttpError(400, "missing_token");

      const action = typeof body.action === "string" ? body.action.trim() : null;
      if (action !== "confirm" && action !== "reject") {
        throw new HttpError(400, "action must be confirm or reject");
      }

      const tokenHash = await sha256Hex(rawToken);
      const lead = await findAndValidateLead(supabaseAdmin, tokenHash);

      const now = new Date().toISOString();

      if (action === "confirm") {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("affiliate_company_leads")
          .update({
            status: "pending_admin_approval",
            company_confirmed_at: now,
            company_confirmation_used_at: now,
            submitted_to_admin_at: now,
            company_confirmation_token_hash: null,
          })
          .eq("id", lead.id)
          .eq("status", "sent_to_company")
          .select("id")
          .maybeSingle();

        if (updateError) throw new Error(`DB update failed: ${updateError.message}`);
        if (!updated) throw new HttpError(409, "already_processed");

        return jsonResponse({
          success: true,
          action: "confirm",
          status: "pending_admin_approval",
          company_name: lead.company_name,
        });
      }

      // action === "reject"
      const rejectionReason =
        typeof body.rejection_reason === "string" && body.rejection_reason.trim()
          ? body.rejection_reason.trim().slice(0, 1000)
          : null;

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("affiliate_company_leads")
        .update({
          status: "company_rejected",
          company_rejected_at: now,
          company_confirmation_used_at: now,
          company_rejection_reason: rejectionReason,
          company_confirmation_token_hash: null,
        })
        .eq("id", lead.id)
        .eq("status", "sent_to_company")
        .select("id")
        .maybeSingle();

      if (updateError) throw new Error(`DB update failed: ${updateError.message}`);
      if (!updated) throw new HttpError(409, "already_processed");

      return jsonResponse({
        success: true,
        action: "reject",
        status: "company_rejected",
        company_name: lead.company_name,
      });
    }

    return jsonResponse({ success: false, message: "method_not_allowed" }, 405);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("confirm-affiliate-company-lead failed", { status, message });
    return jsonResponse({ success: false, message }, status);
  }
});
