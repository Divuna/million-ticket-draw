import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { renderOneMilEmail } from "../_shared/oneMilEmailTemplate.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

// Site URL for the recovery link redirectTo — reuses the generic /reset-password
// flow (AuthContext handles PASSWORD_RECOVERY for any account type).
// SITE_URL env var allows overriding on staging; defaults to production.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://onemil.cz";
const RESET_PASSWORD_URL = `${SITE_URL}/reset-password`;

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

// Conservative email validation — same shape used across the project.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

/**
 * Find an existing auth user by email via the Supabase Admin API.
 * Returns the user id, or null if not found.
 * Never logs or returns passwords.
 */
async function findAuthUserByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  // listUsers paginates up to 1000; sufficient for current scale.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const found = (data?.users ?? []).find((u: { email?: string }) => u.email === email);
  return found ? (found as { id: string }).id : null;
}

/**
 * Build invite email HTML.
 * Contains the one-time setup link. NEVER contains a generated password.
 */
function buildInviteEmail(params: { setupLink: string }): string {
  return renderOneMilEmail({
    preheader: "Pozvánka do administrace OneMil.",
    eyebrow: "Administrace OneMil",
    title: "Přijměte pozvánku do týmu",
    bodyHtml: `
      <p style="margin:0 0 16px;">Dobrý den,</p>
      <p style="margin:0;">Byli jste pozváni jako administrátor do systému OneMil. Aktivaci účtu dokončíte bezpečným nastavením hesla.</p>
    `,
    action: {
      label: "Nastavit heslo a aktivovat účet",
      url: escapeHtml(params.setupLink),
    },
    footerNote: "Odkaz je jednorázový a platný jen po omezenou dobu. Pokud jste pozvánku nečekali, e-mail ignorujte.",
  });
}

// ─── Handler ───────────────────────────────────────────────────────────────────

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
    // ── 1. Auth guard — caller JWT required ────────────────────────────────
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

    // ── 2. Role check — SUPERADMIN ONLY ────────────────────────────────────
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "superadmin")
      .maybeSingle();

    if (!roleRow) {
      throw new HttpError(403, "access_denied_superadmin_only");
    }

    // ── 3. Parse and validate request body ─────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "invalid_json");
    }

    const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!rawEmail) throw new HttpError(400, "email_required");
    if (!isValidEmail(rawEmail)) throw new HttpError(400, "invalid_email");
    const email = rawEmail;

    // ── 4. Create or reuse the auth user (never with a password) ────────────
    let inviteeId: string;

    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
        // No password — invitee sets it via the recovery link below.
      });

    if (!createError) {
      inviteeId = createData.user.id;
    } else {
      // User already exists — reuse it (idempotent re-invite).
      const existingId = await findAuthUserByEmail(supabaseAdmin, email);
      if (!existingId) {
        throw new Error(
          `createUser failed and user not found by email: ${createError.message}`,
        );
      }
      inviteeId = existingId;
    }

    // ── 5. Guard: never touch an existing superadmin ───────────────────────
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", inviteeId)
      .maybeSingle();

    if (existingRole?.role === "superadmin") {
      // Refuse to modify a superadmin account through this endpoint.
      throw new HttpError(409, "target_is_superadmin");
    }

    // ── 6. Assign role 'admin' (subadmin) — never 'superadmin' ─────────────
    if (existingRole) {
      // Flip an existing row (e.g. 'user') to 'admin'. If already 'admin', no-op.
      if (existingRole.role !== "admin") {
        const { error: updateError } = await supabaseAdmin
          .from("user_roles")
          .update({ role: "admin" })
          .eq("user_id", inviteeId);
        if (updateError) throw new Error(`role update failed: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: inviteeId, role: "admin" });
      if (insertError) throw new Error(`role insert failed: ${insertError.message}`);
    }

    // ── 7. Best-effort audit log ───────────────────────────────────────────
    // Insert directly into public.audit_logs instead of the log_admin_action RPC:
    // that RPC stamps user_id = auth.uid(), which is NULL under the service-role
    // client, so the inviting superadmin was lost. Here we write the verified
    // caller (caller.id) as audit_logs.user_id so it's clear who sent the invite.
    try {
      const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
        event: "subadmin_invited",
        user_id: caller.id,
        metadata: {
          entity_type: "user",
          entity_id: inviteeId,
          target_user_id: inviteeId,
          invited_email: email,
          new_data: { role: "admin", email },
          admin_action: true,
        },
      });
      if (auditError) {
        console.error("invite-subadmin: audit_logs insert failed", auditError.message);
      }
    } catch (logErr) {
      console.error(
        "invite-subadmin: audit_logs insert threw",
        logErr instanceof Error ? logErr.message : String(logErr),
      );
    }

    // ── 8. Generate one-time password setup link ───────────────────────────
    // NEVER log or return this link in the response — only pass to email_queue.
    let inviteLinkPending = false;
    let setupLinkAction: string | null = null;

    try {
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: RESET_PASSWORD_URL },
        });

      if (linkError || !linkData?.properties?.action_link) {
        console.error(
          "invite-subadmin: generateLink failed",
          linkError?.message ?? "no action_link returned",
        );
        inviteLinkPending = true;
      } else {
        setupLinkAction = linkData.properties.action_link;
      }
    } catch (linkErr) {
      console.error(
        "invite-subadmin: generateLink threw",
        linkErr instanceof Error ? linkErr.message : String(linkErr),
      );
      inviteLinkPending = true;
    }

    // ── 9. Queue invite email (best-effort — role already assigned) ────────
    if (!inviteLinkPending && setupLinkAction) {
      try {
        const emailBody = buildInviteEmail({ setupLink: setupLinkAction });
        const { error: emailError } = await supabaseAdmin
          .from("email_queue")
          .insert({
            email,
            subject: "Pozvánka do administrace OneMil — nastavte si heslo",
            body: emailBody,
          });

        if (emailError) {
          console.error("invite-subadmin: email_queue insert failed", emailError.message);
          inviteLinkPending = true;
        }
      } catch (emailErr) {
        console.error(
          "invite-subadmin: email_queue threw",
          emailErr instanceof Error ? emailErr.message : String(emailErr),
        );
        inviteLinkPending = true;
      }
    }

    return jsonResponse({
      success: true,
      status: "invited",
      user_id: inviteeId,
      ...(inviteLinkPending ? { invite_link_pending: true } : {}),
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "unknown_error";

    // Log detail server-side; never return raw internal error to client for 5xx.
    console.error("invite-subadmin failed", { status, message });

    return jsonResponse(
      { success: false, message: status >= 500 ? "internal_error" : message },
      status,
    );
  }
});
