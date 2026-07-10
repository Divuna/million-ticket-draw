import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.17.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const escapeHtml = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "missing_authorization_header" }, 401);
    const { data: userData } = await admin.auth.getUser(authHeader.slice(7).trim());
    const caller = userData.user;
    if (!caller) return json({ success: false, error: "invalid_authorization_token" }, 401);
    const { data: canManage } = await admin.rpc("has_admin_permission", { check_key: "sales_leads.manage", check_user_id: caller.id });
    if (canManage !== true) return json({ success: false, error: "access_denied_sales_leads_manage_only" }, 403);

    const input = await req.json() as Record<string, unknown>;
    const leadId = typeof input.lead_id === "string" ? input.lead_id : "";
    const activityId = typeof input.reply_to_activity_id === "string" ? input.reply_to_activity_id : "";
    const subject = typeof input.subject === "string" ? input.subject.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!leadId || !activityId || !subject || !body || subject.length > 300 || body.length > 20000) {
      return json({ success: false, error: "invalid_input" }, 422);
    }
    const [{ data: lead }, { data: incoming }] = await Promise.all([
      admin.from("sales_leads").select("id,company_name,contact_email,do_not_contact").eq("id", leadId).maybeSingle(),
      admin.from("sales_lead_activities").select("id,lead_id,activity_type,metadata").eq("id", activityId).eq("lead_id", leadId).eq("activity_type", "reply_received").maybeSingle(),
    ]);
    if (!lead) return json({ success: false, error: "lead_not_found" }, 404);
    if (!incoming) return json({ success: false, error: "reply_target_not_found" }, 404);
    if (lead.do_not_contact) return json({ success: false, error: "do_not_contact" }, 403);
    const recipient = String(lead.contact_email ?? "").trim().toLowerCase();
    if (!recipient) return json({ success: false, error: "missing_contact_email" }, 422);
    const domain = `@${recipient.split("@")[1] ?? ""}`;
    const { data: suppressed } = await admin.from("sales_lead_email_suppression").select("id").in("email_pattern", [recipient, domain]).limit(1).maybeSingle();
    if (suppressed) return json({ success: false, error: "suppressed" }, 403);
    const { data: guard, error: guardError } = await admin.rpc("sales_lead_email_send_guard", { p_lead_id: leadId });
    if (guardError) return json({ success: false, error: "duplicate_guard_failed" }, 500);
    if (!(guard as { success?: boolean } | null)?.success) return json({ success: false, error: "duplicate_override_required" }, 409);

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ success: false, error: "email_not_configured" }, 503);
    const messageId = typeof incoming.metadata?.message_id === "string" ? incoming.metadata.message_id : null;
    // Per-lead Reply-To — zákazníkova další odpověď musí dorazit sem, aby ji
    // Resend inbound spároval s leadem. POZOR: Resend SDK v6 očekává `replyTo`
    // (camelCase), NE `reply_to`. Se `reply_to` v6 pole tiše ignoruje a odchozí
    // e-mail nemá Reply-To hlavičku → další odpověď se ztratí (šla by na from).
    const replyTo = `reply+${leadId}@ulduuzoul.resend.app`;
    const response = await new Resend(key).emails.send({
      from: "OneMil <b2b@onemil.cz>", to: [recipient], replyTo,
      subject, text: body, html: `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(body)}</div>`,
      ...(messageId ? { headers: { "In-Reply-To": messageId, "References": messageId } } : {}),
    });
    if (response.error) return json({ success: false, error: "email_send_failed" }, 502);
    const { error: historyError } = await admin.from("sales_lead_activities").insert({
      lead_id: leadId, activity_type: "email_sent", direction: "outbound", subject, body_snapshot: body,
      email_message_id: response.data?.id ?? null, performed_by: caller.id,
      metadata: { sent_by: "human_reply", from: "b2b@onemil.cz", reply_to: replyTo, to: recipient, reply_to_activity_id: activityId },
    });
    // E-mail už byl odeslán. Nevracíme chybu vhodnou k retry, aby člověk
    // nevytvořil duplicitní odpověď; warning je explicitní pro následný audit.
    if (historyError) return json({ success: true, lead_id: leadId, sent_to: recipient, history_recorded: false, warning: "history_write_failed_after_send" });
    return json({ success: true, lead_id: leadId, sent_to: recipient });
  } catch { return json({ success: false, error: "internal_error" }, 500); }
});
