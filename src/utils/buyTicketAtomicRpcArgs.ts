/**
 * Args for PostgREST `public.buy_ticket_public(p_contest_id uuid, p_user_id uuid)`.
 * Only UUID strings — never ticket row ids or other types.
 *
 * SECURITY CONTRACT (migration 20260717190000): the server ALWAYS purchases
 * for auth.uid() from the caller's JWT. `p_user_id` is validated only —
 * a missing JWT returns `{ error: 'Unauthorized' }`, a p_user_id different
 * from auth.uid() returns `{ error: 'Forbidden' }`. Always pass the currently
 * signed-in user's id here; never any other user's id.
 */
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BuyTicketAtomicRpcPayload = {
  p_contest_id: string;
  p_user_id: string;
};

function normalizeUuid(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  return CANONICAL_UUID.test(s) ? s.toLowerCase() : null;
}

export function buildBuyTicketAtomicRpcPayload(
  contestId: unknown,
  userId: unknown,
):
  | { ok: true; payload: BuyTicketAtomicRpcPayload }
  | { ok: false; message: string } {
  const p_contest_id = normalizeUuid(contestId);
  const p_user_id = normalizeUuid(userId);
  if (!p_contest_id) {
    return { ok: false, message: "Neplatné ID soutěže." };
  }
  if (!p_user_id) {
    return { ok: false, message: "Neplatný uživatel." };
  }
  return { ok: true, payload: { p_contest_id, p_user_id } };
}
