/**
 * Args for PostgREST `public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)`.
 * Only UUID strings — never ticket row ids or other types.
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
