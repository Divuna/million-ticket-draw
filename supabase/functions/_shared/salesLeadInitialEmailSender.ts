import {
  classifyInitialEmailProviderError,
  InitialEmailProviderOutcomeUncertainError,
} from "./salesLeadInitialEmailDelivery.ts";
import type { InitialEmailProvider } from "./salesLeadInitialEmailDelivery.ts";

// Single sender identity for the first business e-mail. The manual sender and
// the batch worker must always use exactly the same identity.
export const SALES_LEAD_INITIAL_EMAIL_FROM = "Miroslav | OneMil <b2b@onemil.cz>";
export const SALES_LEAD_INITIAL_EMAIL_REPLY_TO = "Miroslav | OneMil <b2b@onemil.cz>";

export function resendErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as Record<string, unknown>;
  const candidate = typeof value.name === "string" ? value.name
    : typeof value.code === "string" ? value.code
    : null;
  return candidate?.trim().toLowerCase() || null;
}

type ResendLikeClient = {
  emails: {
    send(payload: unknown, options: { idempotencyKey: string }): Promise<{
      error?: unknown;
      data?: { id?: string } | null;
    }>;
  };
};

// Shared provider adapter. An unprovable outcome must never be downgraded to a
// plain rejection, otherwise an already accepted e-mail could be sent twice.
export function createResendInitialEmailProvider(resend: ResendLikeClient): InitialEmailProvider {
  return {
    send: async (payload, idempotencyKey) => {
      const response = await resend.emails.send(payload as never, { idempotencyKey });
      if (response.error) {
        const decision = classifyInitialEmailProviderError(resendErrorCode(response.error));
        if (decision.outcome === "rejected") {
          return { accepted: false as const, errorCode: "email_send_failed" };
        }
        throw new InitialEmailProviderOutcomeUncertainError(decision.errorCode);
      }
      const messageId = response.data?.id;
      if (!messageId) throw new Error("provider_response_missing_message_id");
      return { accepted: true as const, messageId };
    },
  };
}
