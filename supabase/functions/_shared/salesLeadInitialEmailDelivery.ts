import type { SalesLeadEmailAttachmentForResend, SalesLeadEmailAttachmentMetadata } from "./salesLeadEmailAttachments.ts";
import { outboundCaptureAddress } from "./salesLeadEmailThreading.ts";

type RpcResponse = { data: unknown; error: { message?: string; code?: string } | null };

export type SalesLeadDeliveryRpcClient = {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResponse>;
};

export type InitialEmailProviderPayload = {
  from: string;
  to: string[];
  bcc: string[];
  reply_to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: SalesLeadEmailAttachmentForResend[];
};

export type InitialEmailProvider = {
  send(payload: InitialEmailProviderPayload, idempotencyKey: string): Promise<
    { accepted: true; messageId: string } |
    { accepted: false; errorCode: string }
  >;
};

export type DeliverInitialEmailInput = {
  leadId: string;
  performedBy: string;
  recipient: string;
  subject: string;
  bodySource: string;
  bodyText: string;
  bodyHtml: string;
  attachmentMetadata: SalesLeadEmailAttachmentMetadata[];
  attachments: SalesLeadEmailAttachmentForResend[];
  outboundCaptureId: string;
  from: string;
  replyTo: string;
};

export type DeliverInitialEmailResult = {
  success: boolean;
  error?: string;
  providerAccepted?: boolean;
  retryBlocked?: boolean;
  providerMessageId?: string | null;
  deliveryId?: string;
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function attachmentEvidence(
  metadata: SalesLeadEmailAttachmentMetadata[],
  attachments: SalesLeadEmailAttachmentForResend[],
): Promise<Array<SalesLeadEmailAttachmentMetadata & { content_sha256: string }>> {
  return Promise.all(metadata.map(async (item, index) => ({
    ...item,
    content_sha256: await sha256(attachments[index]?.content ?? ""),
  })));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function deliverSalesLeadInitialEmail(
  client: SalesLeadDeliveryRpcClient,
  provider: InitialEmailProvider,
  input: DeliverInitialEmailInput,
): Promise<DeliverInitialEmailResult> {
  const evidence = await attachmentEvidence(input.attachmentMetadata, input.attachments);
  const requestFingerprint = await sha256(canonicalJson({
    lead_id: input.leadId,
    recipient: input.recipient.trim().toLowerCase(),
    subject: input.subject,
    body_source: input.bodySource,
    body_text: input.bodyText,
    body_html: input.bodyHtml,
    attachments: evidence,
    mode: "manual_initial",
  }));
  const deliveryKey = await sha256(`sales-lead-initial:v1:${input.leadId}:${requestFingerprint}`);
  const claimResponse = await client.rpc("sales_lead_initial_email_claim", {
    p_delivery_key: deliveryKey,
    p_request_fingerprint: requestFingerprint,
    p_lead_id: input.leadId,
    p_mode: "manual_initial",
    p_batch_item_id: null,
    p_recipient: input.recipient,
    p_subject: input.subject,
    p_body_source: input.bodySource,
    p_body_text: input.bodyText,
    p_body_html: input.bodyHtml,
    p_attachment_metadata: evidence,
    p_performed_by: input.performedBy,
    p_outbound_capture_id: input.outboundCaptureId,
  });
  if (claimResponse.error) return { success: false, error: "email_delivery_claim_failed" };
  const claim = asObject(claimResponse.data);
  if (claim.success !== true) {
    return {
      success: false,
      error: typeof claim.error === "string" ? claim.error : "email_delivery_claim_failed",
      retryBlocked: claim.retry_blocked === true,
    };
  }
  const deliveryId = String(claim.delivery_id ?? "");
  const claimedCaptureId = String(claim.outbound_capture_id ?? input.outboundCaptureId);
  if (claim.action === "already_committed") {
    return { success: true, deliveryId, providerAccepted: true, providerMessageId: String(claim.provider_message_id ?? "") };
  }

  let providerMessageId = typeof claim.provider_message_id === "string" ? claim.provider_message_id : null;
  if (claim.action === "call_provider") {
    let providerResult: Awaited<ReturnType<InitialEmailProvider["send"]>>;
    try {
      providerResult = await provider.send({
        from: input.from,
        to: [input.recipient],
        bcc: [outboundCaptureAddress(claimedCaptureId)],
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.bodyText,
        html: input.bodyHtml,
        ...(input.attachments.length ? { attachments: input.attachments } : {}),
      }, deliveryKey);
    } catch (_error) {
      await client.rpc("sales_lead_initial_email_record_provider_result", {
        p_delivery_id: deliveryId,
        p_result: "uncertain",
        p_provider_message_id: null,
        p_error_code: "provider_outcome_unknown",
      });
      return {
        success: false,
        error: "email_delivery_outcome_uncertain",
        retryBlocked: true,
        deliveryId,
      };
    }
    if (!providerResult.accepted) {
      const recorded = await client.rpc("sales_lead_initial_email_record_provider_result", {
        p_delivery_id: deliveryId,
        p_result: "rejected",
        p_provider_message_id: null,
        p_error_code: providerResult.errorCode,
      });
      return {
        success: false,
        error: recorded.error || asObject(recorded.data).success !== true
          ? "email_delivery_result_write_failed"
          : providerResult.errorCode,
        providerAccepted: false,
        deliveryId,
      };
    }
    providerMessageId = providerResult.messageId;
    const recorded = await client.rpc("sales_lead_initial_email_record_provider_result", {
      p_delivery_id: deliveryId,
      p_result: "accepted",
      p_provider_message_id: providerMessageId,
      p_error_code: null,
    });
    if (recorded.error || asObject(recorded.data).success !== true) {
      return {
        success: false,
        error: "provider_accepted_result_write_failed",
        providerAccepted: true,
        retryBlocked: true,
        providerMessageId,
        deliveryId,
      };
    }
  }

  const committed = await client.rpc("sales_lead_initial_email_commit", { p_delivery_id: deliveryId });
  if (committed.error || asObject(committed.data).success !== true) {
    return {
      success: false,
      error: "provider_accepted_commit_failed",
      providerAccepted: true,
      retryBlocked: true,
      providerMessageId,
      deliveryId,
    };
  }
  return { success: true, providerAccepted: true, providerMessageId, deliveryId };
}
