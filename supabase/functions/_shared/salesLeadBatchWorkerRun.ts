import { deliverSalesLeadInitialEmail } from "./salesLeadInitialEmailDelivery.ts";
import type {
  InitialEmailProvider,
  SalesLeadDeliveryRpcClient,
} from "./salesLeadInitialEmailDelivery.ts";

// One worker run = at most one claimed item and at most one provider call.
export type SalesLeadBatchWorkerRunResult = {
  status: number;
  body: Record<string, unknown>;
};

type ClaimResult = {
  success?: boolean;
  action?: "noop" | "skipped" | "send" | "commit_only";
  reason?: string;
  batch_item_id?: string;
  batch_id?: string;
  lead_id?: string;
  delivery_id?: string;
  performed_by?: string;
  recipient?: string;
  subject?: string;
  body_source?: string;
  body_text?: string;
  body_html?: string;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

export async function runSalesLeadEmailBatchWorker(deps: {
  client: SalesLeadDeliveryRpcClient;
  /**
   * Lazy on purpose: the provider is constructed only when an item is actually
   * going to be sent. A noop, skipped, commit_only, or malformed claim must
   * never even build a provider client or an outbound capture.
   */
  providerFactory: () => InitialEmailProvider;
  newOutboundCaptureId: () => string;
  from: string;
  replyTo: string;
}): Promise<SalesLeadBatchWorkerRunResult> {
  const claimResponse = await deps.client.rpc("sales_lead_email_batch_claim_next", {});
  if (claimResponse.error) {
    return { status: 500, body: { success: false, error: "batch_claim_failed" } };
  }
  const claim = asObject(claimResponse.data) as ClaimResult;
  if (claim.success !== true) {
    return { status: 500, body: { success: false, error: claim.reason ?? "batch_claim_failed" } };
  }
  if (claim.action === "noop") {
    return {
      status: 200,
      body: { success: true, action: "noop", reason: claim.reason ?? "nothing_due", email_sent: false },
    };
  }
  if (claim.action === "skipped") {
    // A barrier failed. Nothing is sent and no further item is taken this run.
    return {
      status: 200,
      body: {
        success: true, action: "skipped", reason: claim.reason,
        batch_item_id: claim.batch_item_id, email_sent: false,
      },
    };
  }

  if (claim.action === "commit_only") {
    // The provider already accepted this e-mail. Only the database commit may
    // be finished — never a provider call, never a recorded failure.
    const deliveryId = String(claim.delivery_id ?? "").trim();
    if (!deliveryId) {
      return { status: 500, body: { success: false, error: "batch_claim_incomplete", email_sent: true } };
    }
    const committed = await deps.client.rpc("sales_lead_initial_email_commit", { p_delivery_id: deliveryId });
    if (committed.error || asObject(committed.data).success !== true) {
      // The item stays safely blocked for the next commit-only attempt.
      return {
        status: 500,
        body: {
          success: false, action: "commit_pending", email_sent: true,
          error: "provider_accepted_commit_failed",
          batch_item_id: claim.batch_item_id, delivery_id: deliveryId,
        },
      };
    }
    return {
      status: 200,
      body: {
        success: true, action: "committed", email_sent: true,
        batch_item_id: claim.batch_item_id, delivery_id: deliveryId,
      },
    };
  }

  if (claim.action !== "send" || !claim.batch_item_id || !claim.lead_id) {
    return { status: 500, body: { success: false, error: "batch_claim_incomplete" } };
  }

  // Only here — with a real item to send — may a provider and an outbound
  // capture come into existence.
  const provider = deps.providerFactory();
  const deliveryResult = await deliverSalesLeadInitialEmail(deps.client, provider, {
    leadId: claim.lead_id,
    performedBy: String(claim.performed_by ?? ""),
    mode: "batch_initial",
    batchItemId: claim.batch_item_id,
    recipient: String(claim.recipient ?? ""),
    subject: String(claim.subject ?? ""),
    bodySource: String(claim.body_source ?? ""),
    bodyText: String(claim.body_text ?? ""),
    bodyHtml: String(claim.body_html ?? ""),
    attachmentMetadata: [],
    attachments: [],
    outboundCaptureId: deps.newOutboundCaptureId(),
    from: deps.from,
    replyTo: deps.replyTo,
  });

  if (deliveryResult.success) {
    return {
      status: 200,
      body: {
        success: true, action: "sent", email_sent: true,
        batch_item_id: claim.batch_item_id, delivery_id: deliveryResult.deliveryId,
      },
    };
  }
  if (deliveryResult.providerAccepted === true) {
    // Accepted by the provider but the commit failed: keep the item blocked and
    // let a later run finish it with commit_only. Never record a failure here.
    return {
      status: 500,
      body: {
        success: false, action: "commit_pending", email_sent: true,
        error: deliveryResult.error, batch_item_id: claim.batch_item_id,
        delivery_id: deliveryResult.deliveryId,
      },
    };
  }

  const outcome = deliveryResult.error === "email_send_failed" ? "rejected" : "uncertain";
  const { data: failureData, error: failureError } = await deps.client.rpc(
    "sales_lead_email_batch_item_record_failure",
    {
      p_batch_item_id: claim.batch_item_id,
      p_outcome: outcome,
      p_error_code: deliveryResult.error ?? "email_delivery_outcome_unknown",
    },
  );
  const failure = asObject(failureData) as { success?: boolean; batch_status?: string };
  return {
    status: 502,
    body: {
      success: false,
      action: outcome === "rejected" ? "failed" : "uncertain",
      email_sent: false,
      error: deliveryResult.error,
      retry_blocked: deliveryResult.retryBlocked === true,
      batch_item_id: claim.batch_item_id,
      batch_status: failure.batch_status,
      failure_recorded: !failureError && failure.success === true,
    },
  };
}
