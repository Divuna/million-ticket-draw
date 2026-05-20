import { useCallback } from 'react';

export interface AdminOnlineUserRow {
  userId: string;
  onlineAt: string;
}

const EMPTY_ONLINE_USERS: AdminOnlineUserRow[] = [];

export interface UseAdminOnlineIndicatorResult {
  onlineCount: number;
  onlineUsers: AdminOnlineUserRow[];
  onUserJoin: (callback: (userId: string) => void) => void;
  /** Display-only; not wired to Supabase Realtime. */
  statusLabel: string;
  lastUpdatedAt: Date | null;
}

/**
 * Static data for the admin "Online teď" control. No channels, tracking, or heartbeats.
 * Realtime messaging uses `postgres_changes` elsewhere.
 *
 * TODO (issue: restore admin "Online teď" presence): this hook intentionally
 * returns onlineCount=0 and statusLabel='CLOSED' until a real presence source
 * is restored. The previous Supabase Realtime presence implementation was
 * removed; do not rebuild it here without a dedicated PR that adds a proper
 * presence channel (or a server-side last_seen_at query) — out of scope for
 * the "Hry dnes" fix in this PR.
 */
export function useAdminOnlineIndicator(): UseAdminOnlineIndicatorResult {
  const onUserJoin = useCallback((_callback: (userId: string) => void) => {}, []);

  return {
    onlineCount: 0,
    onlineUsers: EMPTY_ONLINE_USERS,
    onUserJoin,
    statusLabel: 'CLOSED',
    lastUpdatedAt: null,
  };
}
