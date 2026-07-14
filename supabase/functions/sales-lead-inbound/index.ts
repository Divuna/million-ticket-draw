import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.17.2";
import {
  decideInboundRoute,
  extractMessageIds,
  headerValue,
  normalizeMessageId,
} from "../_shared/salesLeadInboundRouting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySvixSignature(rawBody: string, headers: Headers, secret: string): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretBytes = Uint8Array.from(
    atob(secret.startsWith("whsec_") ? secret.slice(6) : secret),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return svixSignature.split(" ").some((part) => {
    const [, value] = part.split(",");
    return Boolean(value && timingSafeEqual(value, expected));
  });
}

function toAddressList(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      return String(row.address ?? row.email ?? "");
    }
    return "";
  }).filter(Boolean);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseMailbox(raw: string): { email: string; name: string | null } {
  const match = raw.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!match) return { email: raw.trim().toLowerCase(), name: null };
  return {
    email: match[2].trim().toLowerCase(),
    name: match[1].replace(/^"|"$/g, "").trim() || null,
  };
}

function providerThreadId(...sources: Array<Record<string, unknown>>): string | null {
  for (const source of sources) {
    const value = asString(source.thread_id) ?? asString(source.threadId);
    if (value) return value;
  }
  return null;
}

function logReceivingFailure(emailId: string, error: unknown): void {
  let name: string | null = null;
  let message: string | null = null;
  let statusCode: number | null = null;
  if (error && typeof error === "object") {
    const row = error as Record<string, unknown>;
    name = asString(row.name);
    message = asString(row.message);
    statusCode = typeof row.statusCode === "number" ? row.statusCode : null;
  }
  console.error("sales-lead-inbound receiving_api_access_failed", JSON.stringify({
    email_id: emailId,
    resend_error_name: name,
    resend_error_message: message,
    resend_status_code: statusCode,
  }));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("SALES_LEAD_INBOUND_WEBHOOK_SECRET") ?? "";
  if (!secret) return jsonResponse({ success: false, error: "inbound_not_configured" }, 503);

  const rawBody = await req.text();
  if (!(await verifySvixSignature(rawBody, req.headers, secret))) {
    return jsonResponse({ success: false, error: "invalid_signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const eventType = asString(payload.type);
  const deliveryTypes: Record<string, string> = {
    "email.delivered": "email_delivered",
    "email.delivery_delayed": "email_delivery_delayed",
    "email.bounced": "email_bounced",
    "email.failed": "email_failed",
    "email.suppressed": "email_suppressed",
  };

  if (eventType && deliveryTypes[eventType]) {
    const eventData = (payload.data ?? {}) as Record<string, unknown>;
    const outboundId = asString(eventData.email_id);
    if (!outboundId) return jsonResponse({ success: true, ignored: true, reason: "missing_email_id" });

    const { data: sent } = await admin.from("sales_lead_activities")
      .select("id,lead_id,subject,body_snapshot,metadata")
      .eq("activity_type", "email_sent")
      .eq("email_message_id", outboundId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sent) return jsonResponse({ success: true, ignored: true, reason: "email_not_linked" });

    const rfcMessageId = normalizeMessageId(asString(eventData.message_id));
    const threadId = providerThreadId(eventData);
    if (rfcMessageId || threadId) {
      const metadata = (sent.metadata && typeof sent.metadata === "object") ? sent.metadata : {};
      await admin.from("sales_lead_activities").update({
        rfc_message_id: rfcMessageId,
        provider_thread_id: threadId,
        metadata: { ...metadata, message_id: rfcMessageId, provider_thread_id: threadId },
      }).eq("id", sent.id);
    }

    const eventKey = req.headers.get("svix-id") ?? `${eventType}:${outboundId}`;
    const { data: seen } = await admin.from("sales_lead_activities").select("id")
      .eq("activity_type", deliveryTypes[eventType]).eq("email_message_id", eventKey)
      .limit(1).maybeSingle();
    if (seen) return jsonResponse({ success: true, duplicate: true });

    const { error } = await admin.from("sales_lead_activities").insert({
      lead_id: sent.lead_id,
      activity_type: deliveryTypes[eventType],
      direction: "internal",
      subject: sent.subject,
      body_snapshot: sent.body_snapshot,
      email_message_id: eventKey,
      rfc_message_id: rfcMessageId,
      provider_thread_id: threadId,
      metadata: {
        event_type: eventType,
        event_id: eventKey,
        email_id: outboundId,
        message_id: rfcMessageId,
        provider_thread_id: threadId,
        created_at: payload.created_at ?? null,
      },
    });
    if (error) {
      if (error.code === "23505") return jsonResponse({ success: true, duplicate: true });
      return jsonResponse({ success: false, error: "activity_insert_failed" }, 500);
    }
    if (["email.bounced", "email.failed", "email.suppressed"].includes(eventType)) {
      await admin.from("sales_leads").update({ next_action_at: null }).eq("id", sent.lead_id);
    }
    return jsonResponse({ success: true, lead_id: sent.lead_id });
  }

  if (eventType && eventType !== "email.received") {
    return jsonResponse({ success: true, ignored: true, reason: "unsupported_event_type" });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;
  const emailId = asString(data.email_id);
  if (!emailId) return jsonResponse({ success: true, ignored: true, reason: "missing_email_id" });

  // Idempotency is checked globally before the Receiving API call.
  const [{ data: existingActivity }, { data: existingUnassigned }] = await Promise.all([
    admin.from("sales_lead_activities").select("id,lead_id")
      .eq("activity_type", "reply_received").eq("email_message_id", emailId)
      .limit(1).maybeSingle(),
    admin.from("sales_lead_unassigned_emails").select("id,assigned_lead_id")
      .eq("resend_email_id", emailId).limit(1).maybeSingle(),
  ]);
  if (existingActivity || existingUnassigned) {
    return jsonResponse({
      success: true,
      duplicate: true,
      lead_id: existingActivity?.lead_id ?? existingUnassigned?.assigned_lead_id ?? null,
    });
  }

  const receivingApiKey = Deno.env.get("RESEND_RECEIVING_API_KEY");
  if (!receivingApiKey) {
    return jsonResponse({ success: false, error: "receiving_api_not_configured" }, 503);
  }

  let received: Record<string, unknown>;
  try {
    const response = await new Resend(receivingApiKey).emails.receiving.get(emailId);
    if (response.error || !response.data) {
      logReceivingFailure(emailId, response.error);
      return jsonResponse({ success: false, error: "receiving_api_access_failed" }, 502);
    }
    received = response.data as unknown as Record<string, unknown>;
  } catch (error) {
    logReceivingFailure(emailId, error);
    return jsonResponse({ success: false, error: "receiving_api_access_failed" }, 502);
  }

  const headers = received.headers;
  const inReplyTo = extractMessageIds(headerValue(headers, "in-reply-to"))[0] ?? null;
  const referenceIds = extractMessageIds(headerValue(headers, "references"));
  const threadId = providerThreadId(received, data);

  const lookupLeads = async (column: "rfc_message_id" | "provider_thread_id", values: string[]) => {
    if (values.length === 0) return [] as string[];
    const query = admin.from("sales_lead_activities").select("lead_id")
      .eq("activity_type", "email_sent");
    const { data: rows } = values.length === 1
      ? await query.eq(column, values[0])
      : await query.in(column, values);
    return [...new Set((rows ?? []).map((row: { lead_id: string }) => row.lead_id))];
  };

  const [inReplyToLeadIds, referenceLeadIds, providerThreadLeadIds] = await Promise.all([
    lookupLeads("rfc_message_id", inReplyTo ? [inReplyTo] : []),
    lookupLeads("rfc_message_id", referenceIds),
    lookupLeads("provider_thread_id", threadId ? [threadId] : []),
  ]);
  const decision = decideInboundRoute({
    inReplyToLeadIds,
    referenceLeadIds,
    providerThreadLeadIds,
  });

  const textBody = asString(received.text) ?? asString(received.html);
  const subject = asString(received.subject) ?? asString(data.subject);
  const rawFrom = toAddressList(received.from)[0] ?? toAddressList(data.from)[0] ?? "";
  const sender = parseMailbox(rawFrom);
  const recipients = [
    ...toAddressList(received.to),
    ...toAddressList(data.to),
    ...toAddressList(data.received_for),
  ];
  const rfcMessageId = normalizeMessageId(asString(received.message_id) ?? asString(data.message_id));
  const receivedAt = asString(received.created_at) ?? asString(payload.created_at) ?? new Date().toISOString();

  if (!decision.leadId) {
    const { error } = await admin.from("sales_lead_unassigned_emails").insert({
      resend_email_id: emailId,
      rfc_message_id: rfcMessageId,
      provider_thread_id: threadId,
      in_reply_to: inReplyTo,
      references_ids: referenceIds,
      from_email: sender.email || "unknown",
      from_name: sender.name,
      to_addresses: [...new Set(recipients)],
      subject,
      body_snapshot: textBody,
      received_at: receivedAt,
    });
    if (error && error.code !== "23505") {
      return jsonResponse({ success: false, error: "unassigned_insert_failed" }, 500);
    }
    return jsonResponse({
      success: true,
      unassigned: true,
      ambiguous: decision.ambiguous,
      evidence: decision.method,
    });
  }

  const { error: insertError } = await admin.from("sales_lead_activities").insert({
    lead_id: decision.leadId,
    activity_type: "reply_received",
    direction: "inbound",
    subject,
    body_snapshot: textBody,
    email_message_id: emailId,
    rfc_message_id: rfcMessageId,
    provider_thread_id: threadId,
    performed_by: null,
    metadata: {
      from: sender.email,
      to: [...new Set(recipients)],
      email_id: emailId,
      message_id: rfcMessageId,
      in_reply_to: inReplyTo,
      references: referenceIds,
      provider_thread_id: threadId,
      assignment_method: decision.method,
    },
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return jsonResponse({ success: true, duplicate: true, lead_id: decision.leadId });
    }
    return jsonResponse({ success: false, error: "activity_insert_failed" }, 500);
  }

  let statusChanged: unknown = null;
  try {
    const { data: rpcResult } = await admin.rpc("sales_lead_mark_replied", {
      p_lead_id: decision.leadId,
      p_performed_by: null,
    });
    statusChanged = rpcResult;
  } catch {
    // Activity is the source of truth; status synchronization remains best effort.
  }

  return jsonResponse({ success: true, lead_id: decision.leadId, status: statusChanged });
});
