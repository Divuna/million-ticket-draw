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
