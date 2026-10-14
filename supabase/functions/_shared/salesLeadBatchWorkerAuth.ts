// Internal worker authorization. The batch worker never accepts a user JWT and
// never runs without its own configured shared secret.
export type BatchWorkerAuthDecision =
  | { ok: true }
  | { ok: false; status: number; error: string };

export const SALES_LEAD_BATCH_WORKER_SECRET_MIN_LENGTH = 32;

export function authorizeSalesLeadBatchWorkerRequest(input: {
  method: string;
  authorization: string | null;
  secret: string | null | undefined;
}): BatchWorkerAuthDecision {
  if (input.method !== "POST") {
    return { ok: false, status: 405, error: "method_not_allowed" };
  }
  const secret = input.secret?.trim() ?? "";
  if (!secret || secret.length < SALES_LEAD_BATCH_WORKER_SECRET_MIN_LENGTH) {
    // A missing or too weak secret is a configuration error, never a silent run.
    return { ok: false, status: 500, error: "worker_secret_not_configured" };
  }
  const header = input.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented || presented.length !== secret.length) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  let mismatch = 0;
  for (let index = 0; index < secret.length; index += 1) {
    mismatch |= presented.charCodeAt(index) ^ secret.charCodeAt(index);
  }
  if (mismatch !== 0) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}
