/** Partner / influencer / admin thread: fetch limit + small in-memory window. */
export const CHAT_MESSAGES_STATE_CAP = 20;

/** Main user chat: page size for initial + “load older” fetches. */
export const CHAT_PAGE_SIZE = 20;

/**
 * Main user chat: max rows after a **tail growth** event (realtime INSERT / send).
 * Prepended “load older” history is not trimmed by this limit.
 */
export const CHAT_THREAD_MEMORY_MAX = 50;

/** Drops oldest rows when over cap; preserves order when already at or under cap. */
export function capChatMessagesState<T extends { created_at: string }>(
  rows: T[],
  cap: number = CHAT_MESSAGES_STATE_CAP,
): T[] {
  if (rows.length <= cap) return rows;
  return [...rows]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-cap);
}

/**
 * When the list **grew** (new message at bottom), trim oldest past `max`.
 * UPDATE/DELETE-only changes and prepended history keep full length until a tail insert exceeds `max`.
 */
export function capAfterTailGrowth<T extends { created_at: string }>(
  previousLength: number,
  nextRows: T[],
  max: number = CHAT_THREAD_MEMORY_MAX,
): T[] {
  if (nextRows.length <= previousLength || nextRows.length <= max) {
    return nextRows;
  }
  return capChatMessagesState(nextRows, max);
}
