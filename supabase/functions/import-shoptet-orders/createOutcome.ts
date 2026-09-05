// Extracted so both the deployed Edge Function and the test suite import the
// exact same logic — no second implementation to drift.
//
// Why this exists: `create_partner_order_reward` has THREE successful outcomes
// and they must not be collapsed:
//
//   * duplicate           — the order already has a reward code,
//   * created             — a new pending reward code was issued,
//   * skipped_no_reward   — partner runs `reward_mode = 'selected_products'`
//                           and the order contains no selected product. That is
//                           a normal order without a MioCoin entitlement, NOT a
//                           failure: no reward code, no customer e-mail, and the
//                           import run must not go `partial`.
//
// Before this fix the "no selected product" case surfaced as
// `{ success: false, error: 'reward_amount_too_low' }`, which the importer
// counted in `rows_failed` and which therefore turned every single Shoptet run
// into `partial` for as long as such an order stayed in the export window.
//
// A genuine `reward_amount_too_low` — a selected product IS present but the
// computed reward lands under `miocoin_min_partner_reward_mc()` — still maps to
// `failed` and is unchanged by this module.

export type CreateRewardResult = {
  success?: boolean;
  error?: string;
  duplicate?: boolean;
  skipped?: boolean;
  reason?: string;
};

export type CreateOutcome = "failed" | "duplicate" | "skipped_no_reward" | "created";

function isResultObject(value: unknown): value is CreateRewardResult {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Classifies one `create_partner_order_reward` call.
 *
 * Order of checks matters:
 *   1. transport/RPC error or a non-success payload  -> failed
 *   2. duplicate                                     -> duplicate
 *   3. skipped (no eligible product)                 -> skipped_no_reward
 *   4. otherwise                                     -> created
 *
 * `skipped_no_reward` is only returned for an explicit `skipped === true`; a
 * missing flag can never be mistaken for a skip.
 */
export function classifyCreateOutcome(
  rpcError: { message?: string } | null | undefined,
  result: unknown,
): CreateOutcome {
  if (rpcError) return "failed";
  if (!isResultObject(result)) return "failed";
  if (result.success !== true) return "failed";
  if (result.duplicate === true) return "duplicate";
  if (result.skipped === true) return "skipped_no_reward";
  return "created";
}

/**
 * True when the importer must NOT follow up with
 * `update_partner_order_reward_status` — there is no reward code to move.
 */
export function skipsStatusUpdate(outcome: CreateOutcome): boolean {
  return outcome === "skipped_no_reward" || outcome === "failed";
}
