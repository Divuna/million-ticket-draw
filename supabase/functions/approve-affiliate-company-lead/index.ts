import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_REJECTION_REASON_LENGTH = 1000;

// Site URL for the recovery link redirectTo — partner set-password page.
// SITE_URL env var allows overriding on staging; defaults to production.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://onemil.cz";
const PARTNER_SET_PASSWORD_URL = `${SITE_URL}/partner/set-password`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Find an existing auth user by email via the Supabase Admin REST API.
 * Returns the user id, or null if not found.
 * Never logs or returns passwords.
 */
async function findAuthUserByEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<string | null> {
  // listUsers paginates up to 1000; sufficient for current scale.
  // For larger deployments this should be replaced with a filtered query.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const found = (data?.users ?? []).find((u: { email?: string }) => u.email === email);
  return found ? (found as { id: string }).id : null;
}

/**
 * Build approval email HTML.
 * Contains setup link. NEVER contains a generated password.
 */
function buildApprovalEmail(params: {
  companyName: string;
  setupLink: string;
}): string {
  const companyName = escapeHtml(params.companyName);
  // setupLink is an opaque URL — no sensitive content is embedded other than
  // the one-time recovery token Supabase generates. It is never logged here.
  return `
    <h2>Vas ucet v OneMil byl schvalen</h2>
    <p>Dobry den,</p>
    <p>Firma <strong>${companyName}</strong> byla schvalena administratorem OneMil.</p>
    <p>Pro aktivaci vaseho partnerskeho uctu a nastaveni hesla kliknete na odkaz nize. Odkaz je platny jen jednou a po kratkou dobu.</p>
    <p>
      <a href="${params.setupLink}"
         style="display:inline-block;padding:12px 18px;background:#ff8a00;color:#0a0b0f;text-decoration:none;border-radius:6px;font-weight:700">
        Nastavit heslo a aktivovat ucet
      </a>
    </p>
    <p>Pokud se vam odkaz neotvira, zkopirujte a vlozte tuto adresu do prohlizece:<br/>
       <em>(odkaz je skryt z bezpecnostnich duvodu — pouzijte tlacitko vyse)</em>
    </p>
    <p>Heslo nikdy nesdilime v e-mailu. Odkaz vyse je jednorazovy a bezpecny.</p>
    <p>S pozdravem,<br/>Tym OneMil</p>
  `;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, message: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // ── 1. Admin JWT guard ─────────────────────────────────────────────────
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

    // ── 2. Role check — admin or superadmin only ───────────────────────────
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "superadmin"])
      .maybeSingle();

    if (!roleRow) {
      throw new HttpError(403, "access_denied_admin_only");
    }

    // ── 3. Parse and validate request body ────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "invalid_json");
    }

    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : null;
    if (!leadId) throw new HttpError(400, "lead_id_required");

    const action = typeof body.action === "string" ? body.action.trim() : null;
    if (action !== "approve" && action !== "reject") {
      throw new HttpError(400, "action_must_be_approve_or_reject");
    }

    const rawRejectionReason =
      typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : null;
    const rejectionReason = rawRejectionReason
      ? rawRejectionReason.slice(0, MAX_REJECTION_REASON_LENGTH)
      : null;

    // ── 4. Load lead — pre-validate status before expensive auth calls ─────
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("affiliate_company_leads")
      .select(
        "id, status, company_name, company_email, sales_rep_name_snapshot",
      )
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) throw new Error(`Failed to load lead: ${leadError.message}`);
    if (!lead) throw new HttpError(404, "lead_not_found");
    if (lead.status !== "pending_admin_approval") {
      throw new HttpError(409, `lead_wrong_status:${lead.status}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REJECT path — no auth user creation, no generateLink, no email
    // ═══════════════════════════════════════════════════════════════════════
    if (action === "reject") {
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        "approve_affiliate_company_lead_txn",
        {
          p_lead_id: leadId,
          p_admin_user_id: caller.id,
          p_partner_auth_id: null,
          p_action: "reject",
          p_rejection_reason: rejectionReason,
        },
      );

      if (rpcError) throw new Error(`RPC error: ${rpcError.message}`);
      const result = rpcResult as { status: string; detail?: string } | null;
      if (!result) throw new Error("RPC returned null");
      if (result.status === "conflict") {
        throw new HttpError(409, result.detail ?? "lead_already_processed");
      }
      if (result.status === "error") {
        throw new HttpError(400, result.detail ?? "rpc_error");
      }

      return jsonResponse({
        success: true,
        lead_id: leadId,
        status: "admin_rejected",
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // APPROVE path
    // ═══════════════════════════════════════════════════════════════════════

    const companyEmail: string = lead.company_email;

    // ── 5. Create or reuse auth user for company email ─────────────────────
    // Never pass a password. The user will set their own via the recovery link.
    let partnerAuthId: string;
    let authUserCreated = false;

    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: companyEmail,
        email_confirm: false,
        // No password — user sets it via recovery/invite link below
      });

    if (!createError) {
      partnerAuthId = createData.user.id;
      authUserCreated = true;
    } else {
      // User already exists — check whether they already have a partner record
      const existingAuthId = await findAuthUserByEmail(
        supabaseUrl,
        serviceRoleKey,
        companyEmail,
      );
      if (!existingAuthId) {
        throw new Error(
          `createUser failed and user not found by email: ${createError.message}`,
        );
      }

      // If a partner already exists for this auth_user_id, it's a collision
      const { data: existingPartner } = await supabaseAdmin
        .from("partners")
        .select("id")
        .eq("auth_user_id", existingAuthId)
        .maybeSingle();

      if (existingPartner) {
        throw new HttpError(
          409,
          "company_email_already_has_partner_account",
        );
      }

      // Auth user exists but no partner — safe to reuse (idempotent retry)
      partnerAuthId = existingAuthId;
    }

    // ── 6. Atomic DB approve via SECURITY DEFINER RPC ─────────────────────
    const { data: approveResult, error: approveError } = await supabaseAdmin.rpc(
      "approve_affiliate_company_lead_txn",
      {
        p_lead_id: leadId,
        p_admin_user_id: caller.id,
        p_partner_auth_id: partnerAuthId,
        p_action: "approve",
        p_rejection_reason: null,
      },
    );

    if (approveError) throw new Error(`RPC error: ${approveError.message}`);
    const approveRes = approveResult as {
      status: string;
      partner_id?: string;
      attribution_written?: boolean;
      detail?: string;
    } | null;
    if (!approveRes) throw new Error("RPC returned null");
    if (approveRes.status === "conflict") {
      throw new HttpError(409, approveRes.detail ?? "lead_already_processed");
    }
    if (approveRes.status === "error") {
      throw new HttpError(400, approveRes.detail ?? "rpc_error");
    }

    const partnerId = approveRes.partner_id ?? null;

    // ── 7. Generate one-time password setup link ───────────────────────────
    // NEVER log or return this link in the response — only pass to email_queue.
    let setupLinkPending = false;
    let setupLinkAction: string | null = null;

    try {
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: companyEmail,
          options: { redirectTo: PARTNER_SET_PASSWORD_URL },
        });

      if (linkError || !linkData?.properties?.action_link) {
        console.error(
          "approve-affiliate-company-lead: generateLink failed",
          linkError?.message ?? "no action_link returned",
        );
        setupLinkPending = true;
      } else {
        // action_link captured in closure — never logged, never returned
        setupLinkAction = linkData.properties.action_link;
      }
    } catch (linkErr) {
      console.error(
        "approve-affiliate-company-lead: generateLink threw",
        linkErr instanceof Error ? linkErr.message : String(linkErr),
      );
      setupLinkPending = true;
    }

    // ── 8. Queue approval email (best-effort — never rollback approve) ─────
    if (!setupLinkPending && setupLinkAction) {
      try {
        const emailBody = buildApprovalEmail({
          companyName: lead.company_name ?? companyEmail,
          setupLink: setupLinkAction,
        });

        const { error: emailError } = await supabaseAdmin
          .from("email_queue")
          .insert({
            email: companyEmail,
            subject: "Vas ucet v OneMil byl schvalen — nastavte si heslo",
            body: emailBody,
          });

        if (emailError) {
          console.error(
            "approve-affiliate-company-lead: email_queue insert failed",
            emailError.message,
          );
          setupLinkPending = true;
        }
      } catch (emailErr) {
        console.error(
          "approve-affiliate-company-lead: email_queue threw",
          emailErr instanceof Error ? emailErr.message : String(emailErr),
        );
        setupLinkPending = true;
      }
    }

    // setup_link_pending=true signals admin UI to show a re-send warning
    // (re-send not yet implemented — tracked for a future iteration)
    return jsonResponse({
      success: true,
      lead_id: leadId,
      status: "approved",
      partner_id: partnerId,
      ...(setupLinkPending ? { setup_link_pending: true } : {}),
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "unknown_error";

    // Log detail server-side; never return raw internal error to client for 5xx
    console.error("approve-affiliate-company-lead failed", { status, message });

    return jsonResponse(
      { success: false, message: status >= 500 ? "internal_error" : message },
      status,
    );
  }
});
