import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

/**
 * partner-invoice-auto-send — the weekly partner-invoice automation entrypoint.
 *
 * OFF (partner_invoice_auto_send_enabled != 'true'):
 *   - runs create_partner_invoices_for_last_week() (draft-only; no PDF, no email)
 *   - returns { enabled:false, ... } and sends nothing.
 *
 * ON (partner_invoice_auto_send_enabled = 'true'):
 *   - runs create_partner_invoices_for_last_week() (creates drafts)
 *   - for each draft coin invoice it can atomically claim
 *     (claim_partner_invoice_for_auto_send), it generates the PDF, sends
 *     exactly one email and lets send-partner-invoice-email flip the invoice
 *     to 'issued' only after a successful send. On any error the invoice stays
 *     'draft' and the claim is released so a later run can retry.
 *
 * Duplicate protection is database-side: the claim RPC flips
 * auto_email_sent_at from NULL only while status='draft', so a repeated run
 * cannot send a second email for the same invoice; send-partner-invoice-email
 * additionally only sends for status='draft'.
 *
 * Authorization: internal token (x-internal-token) OR service-role bearer OR a
 * superadmin JWT — same pattern as send-partner-invoice-email.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

async function authorize(req: Request): Promise<{ status: number; error: string } | null> {
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  const provided = req.headers.get("x-internal-token");
  if (internalToken && provided && provided === internalToken) return null;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "missing_authorization" };
  if (serviceKey && token === serviceKey) return null;

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFailure = await authorize(req);
  if (authFailure) {
    return new Response(JSON.stringify({ error: authFailure.error }), {
      status: authFailure.status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  // Payload:
  //  - skip_create?: boolean — skip the create step (tests seed drafts).
  //  - invoice_ids?: string[] — when skip_create is true, the explicit set of
  //    freshly-created ids to process (test hook simulating the create output).
  let skipCreate = false;
  let providedIds: string[] = [];
  try {
    const body = await req.json();
    skipCreate = body?.skip_create === true;
    if (Array.isArray(body?.invoice_ids)) {
      providedIds = body.invoice_ids.filter((x: unknown): x is string => typeof x === "string");
    }
  } catch (_e) {
    /* no body */
  }

  try {
    // 1. Create this week's drafts (draft-only; unchanged VAT / numbers /
    //    lines) and capture the ids created in THIS run. Only these are
    //    eligible for auto-send — older drafts are never touched and stay for
    //    manual approval.
    let targetIds: string[] = [];
    if (!skipCreate) {
      const { data: created, error: createError } = await supabase.rpc(
        "create_partner_invoices_for_last_week",
      );
      if (createError) {
        return new Response(JSON.stringify({ error: "create_failed", detail: createError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      targetIds = (created ?? [])
        .map((r: { invoice_id?: string }) => r?.invoice_id)
        .filter((x: unknown): x is string => typeof x === "string");
    } else {
      targetIds = providedIds;
    }

    // 2. Read the switch.
    const { data: enabledData, error: flagError } = await supabase.rpc(
      "is_partner_invoice_auto_send_enabled",
    );
    if (flagError) {
      return new Response(JSON.stringify({ error: "flag_read_failed", detail: flagError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const enabled = enabledData === true;

    if (!enabled) {
      return new Response(
        JSON.stringify({ enabled: false, created: targetIds.length, processed: 0, issued: 0, emails: 0, errors: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // 3. ON: process ONLY the invoices created in this run. Delegate the whole
    //    "reserve + ensure PDF + one email + close issued" flow to
    //    send-partner-invoice-email so manual and automatic first sends share
    //    the exact same atomic claim, PDF reuse and status-close logic.
    let issued = 0;
    let emails = 0;
    let errors = 0;
    let skipped = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const invoiceId of targetIds) {
      try {
        const { data: sendData, error: sendError } = await supabase.functions.invoke(
          "send-partner-invoice-email",
          { body: { invoice_id: invoiceId }, headers: { "x-internal-token": internalToken } },
        );
        if (sendError) throw new Error(sendError.message);

        if (sendData?.skipped === true) {
          skipped += 1;
          results.push({ invoice_id: invoiceId, outcome: "skipped", reason: sendData?.reason });
        } else if (sendData?.success === true) {
          emails += 1;
          if (sendData?.status_updated) issued += 1;
          results.push({ invoice_id: invoiceId, outcome: "sent", status_updated: !!sendData?.status_updated });
        } else {
          errors += 1;
          results.push({ invoice_id: invoiceId, outcome: "error", detail: sendData?.error ?? sendData?.reason ?? "send_failed" });
        }
      } catch (err) {
        errors += 1;
        results.push({ invoice_id: invoiceId, outcome: "error", detail: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ enabled: true, processed: targetIds.length, issued, emails, skipped, errors, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
