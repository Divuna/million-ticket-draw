// Extracted so both the deployed Edge Function and the test suite import the
// exact same logic — no second implementation to drift.
//
// Before this fix, `shoptet_import_row_log` rows for `create_failed` and
// `status_update_failed` were written with `message: null` unconditionally,
// discarding both the RPC's own structured error (e.g.
// "items_required_for_reward_mode", "reward_amount_too_low") and any raw
// Postgres-level error. A repeatedly-failing order was therefore
// undiagnosable from the database alone — see the read-only production audit
// of `import-shoptet-orders` create_failed rows (05. 09. 2026).

export type ShoptetRpcResult = {
  success?: boolean;
  error?: string;
};

/**
 * Picks the most useful available failure reason:
 *   1. the RPC's own structured `error` field, when it returned a result
 *      (this is the normal case — `create_partner_order_reward` and
 *      `update_partner_order_reward_status` never throw for business
 *      rejections, they return `{ success: false, error: '<code>' }`);
 *   2. otherwise the raw Postgres/PostgREST error message, when the RPC call
 *      itself failed;
 *   3. "unknown_error" only if neither is present.
 */
export function failureMessage(
  rpcError: { message?: string } | null | undefined,
  result: unknown,
): string {
  const structured = result && typeof result === "object"
    ? (result as ShoptetRpcResult).error
    : undefined;
  return structured || rpcError?.message || "unknown_error";
}
