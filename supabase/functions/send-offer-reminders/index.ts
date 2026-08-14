/**
 * Block F — send-offer-reminders
 *
 * Called daily by pg_cron job send_offer_reminders_daily (08:00 UTC).
 * Auth: x-internal-token header must match INTERNAL_FUNCTION_TOKEN env secret.
 *
 * Workflow:
 *   1. Call get_due_offer_reminder_rows() RPC — all eligibility logic in DB.
 *   2. Group rows by user_id.
 *   3. For each user: build one summary HTML email, INSERT into email_queue.
 *   4. Bulk-UPDATE user_partner_offers.last_reminder_at for all processed rows.
 *
 * Reminder schedule (enforced in DB function):
 *   First  : obtained_at < now() - 24 h  AND last_reminder_at IS NULL
 *   Weekly : last_reminder_at < now() - 7 days
 *
 * Stop conditions (enforced in DB function):
 *   opened_at IS NOT NULL | hidden_at IS NOT NULL
 *   partner_offers.status != 'approved' | valid_to <= now()
 *
 * Email delivery: rows inserted with status='pending' are picked up
 * automatically by the existing process_email_queue_every_10_min cron job.
 *
 * Invariants:
 *   - Never touches winners, bonus_prizes, or purchase-ticket.
 *   - Failure to update last_reminder_at is logged but non-fatal
 *     (worst case: duplicate reminder on next run, not a data hazard).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  escapeEmailHtml,
  ONE_MIL_EMAIL_COLORS,
  renderOneMilEmail,
} from "../_shared/oneMilEmailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

interface ReminderRow {
  upo_id:               string;
  user_id:              string;
  offer_id:             string;
  obtained_at:          string;
  last_reminder_at:     string | null;
  offer_title:          string;
  offer_short_text:     string;
  valid_to:             string | null;
  partner_display_name: string;
  user_email:           string;
}

function buildEmailHtml(offers: ReminderRow[]): string {
  const listItems = offers
    .map((o) => {
      const validity = o.valid_to
        ? `Platí do: ${new Date(o.valid_to).toLocaleDateString("cs-CZ")}`
        : "Bez expirace";
      return `
        <div style="margin:0 0 12px;padding:18px;background:${ONE_MIL_EMAIL_COLORS.panel};border:1px solid ${ONE_MIL_EMAIL_COLORS.line};border-radius:12px;">
          <span style="font-size:11px;color:${ONE_MIL_EMAIL_COLORS.accent};text-transform:uppercase;letter-spacing:.08em;font-weight:800;">
            ${escapeEmailHtml(o.partner_display_name)}
          </span><br>
          <strong style="display:inline-block;margin-top:5px;font-size:16px;color:${ONE_MIL_EMAIL_COLORS.text};">${escapeEmailHtml(o.offer_title)}</strong><br>
          ${
            o.offer_short_text
              ? `<span style="font-size:13px;color:${ONE_MIL_EMAIL_COLORS.muted};">${escapeEmailHtml(o.offer_short_text)}</span><br>`
              : ""
          }
          <span style="display:inline-block;margin-top:8px;font-size:12px;color:${ONE_MIL_EMAIL_COLORS.muted};">${validity}</span>
        </div>`;
    })
    .join("");

  return renderOneMilEmail({
    preheader: "Vaše nevyužité nabídky partnerů čekají v OneMil.",
    eyebrow: "Připomenutí nabídek",
    title: "Vaše nabídky stále čekají",
    bodyHtml: `
      <p style="margin:0 0 22px;">Připomínáme vám ${offers.length === 1 ? "nabídku" : `${offers.length} nabídky`}, ${offers.length === 1 ? "která čeká" : "které čekají"} na vaše otevření v aplikaci OneMil.</p>
      ${listItems}
    `,
    action: {
      label: "Zobrazit nabídky",
      url: "https://onemil.cz/profile?tab=offers",
    },
    footerNote: "Tuto zprávu dostáváte, protože máte nevyužité partnerské nabídky. Nabídku můžete skrýt přímo v aplikaci.",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Internal auth guard ──
  // Accept the x-internal-token if it matches the deployed Edge secret
  // INTERNAL_FUNCTION_TOKEN OR the current Vault secret internal_function_token
  // (the value pg_cron actually sends). The Vault check keeps the scheduled
  // call working even when the Edge secret has drifted from Vault.
  const providedToken = req.headers.get("x-internal-token") ?? "";
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
  let authorized = internalToken.length > 0 && providedToken === internalToken;
  if (!authorized && providedToken) {
    const { data: vaultOk } = await supabase.rpc("verify_internal_function_token", {
      p_token: providedToken,
    });
    authorized = vaultOk === true;
  }
  if (!authorized) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {

    console.log("send-offer-reminders: fetching due rows...");

    // ── All eligibility logic lives in the DB function ────────────────────
    const { data: dueRows, error: rpcError } = await supabase
      .rpc("get_due_offer_reminder_rows") as { data: ReminderRow[] | null; error: any };

    if (rpcError) throw rpcError;

    if (!dueRows || dueRows.length === 0) {
      console.log("send-offer-reminders: no due rows — nothing to do");
      return new Response(
        JSON.stringify({ success: true, emails_queued: 0, offers_touched: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`send-offer-reminders: ${dueRows.length} due row(s)`);

    // ── Group by user_id ─────────────────────────────────────────────────
    const byUser = new Map<string, ReminderRow[]>();
    for (const row of dueRows) {
      const bucket = byUser.get(row.user_id) ?? [];
      bucket.push(row);
      byUser.set(row.user_id, bucket);
    }

    let emailsQueued  = 0;
    let offersTouched = 0;
    const processedUpoIds: string[] = [];

    // ── One summary email per user ────────────────────────────────────────
    for (const [, offers] of byUser) {
      const email = offers[0].user_email;

      if (!email) {
        console.warn(`send-offer-reminders: no email for user ${offers[0].user_id}, skipping`);
        continue;
      }

      const subject =
        offers.length === 1
          ? `Nabídka od ${offers[0].partner_display_name} čeká na OneMil`
          : `Máte ${offers.length} nevyužitých nabídek na OneMil`;

      const body = buildEmailHtml(offers);

      // INSERT into email_queue — existing cron picks it up within 10 min
      const { error: insertError } = await supabase
        .from("email_queue")
        .insert({ email, subject, body });

      if (insertError) {
        // Non-fatal: log and skip this user; other users still processed
        console.error(
          `send-offer-reminders: email_queue insert failed for user ${offers[0].user_id}:`,
          insertError.message
        );
        continue;
      }

      emailsQueued++;
      for (const o of offers) {
        processedUpoIds.push(o.upo_id);
        offersTouched++;
      }
    }

    // ── Bulk-update last_reminder_at ──────────────────────────────────────
    // Prevents re-sending on the next daily run.
    // Non-fatal: worst case is one duplicate reminder on the next run.
    if (processedUpoIds.length > 0) {
      const { error: updateError } = await supabase
        .from("user_partner_offers")
        .update({ last_reminder_at: new Date().toISOString() })
        .in("id", processedUpoIds);

      if (updateError) {
        console.error(
          "send-offer-reminders: last_reminder_at bulk-update failed (non-fatal):",
          updateError.message
        );
      }
    }

    console.log(
      `send-offer-reminders: done — emails_queued=${emailsQueued}, offers_touched=${offersTouched}`
    );

    return new Response(
      JSON.stringify({ success: true, emails_queued: emailsQueued, offers_touched: offersTouched }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-offer-reminders error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
