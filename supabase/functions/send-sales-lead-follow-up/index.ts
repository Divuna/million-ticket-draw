import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.17.2";
import { markdownLinksToVisibleText } from "../_shared/salesLeadEmailRendering.ts";
import { parseSalesLeadEmailAttachments } from "../_shared/salesLeadEmailAttachments.ts";
import { buildReplyHeaders, createOutboundCapture, referencesFromMetadata } from "../_shared/salesLeadEmailThreading.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ success: true });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return json({ success: false, error: "missing_authorization_header" }, 401);
    const { data: userData } = await admin.auth.getUser(auth.slice(7));
    if (!userData.user) return json({ success: false, error: "invalid_authorization_token" }, 401);
    const { data: canManage } = await admin.rpc("has_admin_permission", {
      check_key: "sales_leads.manage",
      check_user_id: userData.user.id,
    });
    if (canManage !== true) return json({ success: false, error: "access_denied" }, 403);

    const input = await req.json() as Record<string, unknown>;
    const leadId = String(input.lead_id ?? "");
    const subject = String(input.subject ?? "").trim();
    const body = String(input.body ?? "").trim();
    if (!leadId || !subject || !body || subject.length > 300 || body.length > 20000) {
      return json({ success: false, error: "invalid_input" }, 422);
    }
    const attachmentResult = parseSalesLeadEmailAttachments(input.attachments);
    if (!attachmentResult.ok) return json({ success: false, error: attachmentResult.error }, 422);

    const { data: lead } = await admin.from("sales_leads")
      .select("id,status,contact_email,email_verified_by_admin,do_not_contact")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return json({ success: false, error: "lead_not_found" }, 404);
    if (!["osloveno", "follow_up"].includes(lead.status)) return json({ success: false, error: "follow_up_not_allowed" }, 409);
    if (lead.do_not_contact) return json({ success: false, error: "do_not_contact" }, 403);
    if (!lead.email_verified_by_admin) return json({ success: false, error: "email_not_approved" }, 403);

    const recipient = String(lead.contact_email ?? "").trim().toLowerCase();
    if (!recipient) return json({ success: false, error: "missing_contact_email" }, 422);

    const [{ count: replies }, { data: lastSent }, { data: suppressed }, { data: guard }] = await Promise.all([
      admin.from("sales_lead_activities").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("activity_type", "reply_received"),
      admin.from("sales_lead_activities")
        .select("rfc_message_id,metadata")
        .eq("lead_id", leadId)
        .eq("activity_type", "email_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("sales_lead_email_suppression")
        .select("id")
        .in("email_pattern", [recipient, `@${recipient.split("@")[1] ?? ""}`])
        .limit(1)
        .maybeSingle(),
      admin.rpc("sales_lead_email_send_guard", { p_lead_id: leadId }),
    ]);
    if ((replies ?? 0) > 0) return json({ success: false, error: "lead_already_replied" }, 409);
    if (suppressed) return json({ success: false, error: "suppressed" }, 403);
    if (!(guard as { success?: boolean } | null)?.success) return json({ success: false, error: "duplicate_override_required" }, 409);

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ success: false, error: "email_not_configured" }, 503);

    const renderedBody = markdownLinksToVisibleText(body);
    const parentMessageId = lastSent?.rfc_message_id ?? null;
    const outboundCapture = createOutboundCapture();
    const threadHeaders = buildReplyHeaders(parentMessageId, referencesFromMetadata(lastSent?.metadata));
    const emailPayload: Record<string, unknown> = {
      from: "OneMil obchodní tým <b2b@onemil.cz>",
      to: [recipient],
      bcc: [outboundCapture.address],
      replyTo: "OneMil obchodní tým <b2b@onemil.cz>",
      subject,
      text: renderedBody,
      html: `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(renderedBody)}</div>`,
      headers: threadHeaders,
    };
    if (attachmentResult.attachments.length > 0) emailPayload.attachments = attachmentResult.attachments;

    const sent = await new Resend(key).emails.send(emailPayload as never);
    if (sent.error) return json({ success: false, error: "email_send_failed" }, 502);

    const { error } = await admin.from("sales_lead_activities").insert({
      lead_id: leadId,
      activity_type: "email_sent",
      direction: "outbound",
      subject,
      body_snapshot: body,
      email_message_id: sent.data?.id ?? null,
      performed_by: userData.user.id,
      metadata: {
        sent_by: "human_follow_up",
        from: "b2b@onemil.cz",
        reply_to: "b2b@onemil.cz",
        to: recipient,
        resend_email_id: sent.data?.id ?? null,
        outbound_capture_id: outboundCapture.id,
        attachments: attachmentResult.metadata,
        in_reply_to: threadHeaders["In-Reply-To"] ?? null,
        references: threadHeaders.References?.split(" ") ?? [],
      },
    });
    if (error) return json({ success: true, history_recorded: false, warning: "history_write_failed_after_send" });

    await admin.from("sales_leads").update({ status: "follow_up", next_action_at: null }).eq("id", leadId).in("status", ["osloveno", "follow_up"]);
    return json({ success: true, lead_id: leadId });
  } catch {
    return json({ success: false, error: "internal_error" }, 500);
  }
});
