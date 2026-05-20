import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AdminOnlineUserRow {
  userId: string;
  onlineAt: string;
}

const EMPTY_ONLINE_USERS: AdminOnlineUserRow[] = [];
const POLL_INTERVAL_MS  = 30_000; // 30 seconds
const ACTIVE_WINDOW_SEC = 300;    // 5 minutes — matches RPC default

export interface UseAdminOnlineIndicatorResult {
  onlineCount:   number;
  onlineUsers:   AdminOnlineUserRow[];
  /** @deprecated no-op; kept for interface compatibility with AdminSoundIndicator */
  onUserJoin:    (callback: (userId: string) => void) => void;
  statusLabel:   string;
  lastUpdatedAt: Date | null;
}

/**
 * Polls public.get_admin_online_users() every 30 seconds.
 *
 * Returns users who have bumped last_seen_at within the last 5 minutes
 * (i.e. users with the useHeartbeat hook active in their browser session).
 *
 * Admin/superadmin only — returns empty state silently for non-admins.
 * Uses server-side last_seen_at heartbeat; no Supabase Realtime presence.
 */
export function useAdminOnlineIndicator(): UseAdminOnlineIndicatorResult {
  const [onlineUsers,   setOnlineUsers]   = useState<AdminOnlineUserRow[]>(EMPTY_ONLINE_USERS);
  const [statusLabel,   setStatusLabel]   = useState<string>('INIT');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // No-op — kept for interface compatibility; presence join events are not needed
  // with the heartbeat-polling approach.
  const onUserJoin = useCallback((_cb: (userId: string) => void) => {}, []);

  useEffect(() => {
    let mounted = true;

    const fetchOnlineUsers = async () => {
      try {
        const { data, error } = await supabase.rpc('get_admin_online_users', {
          p_active_window_seconds: ACTIVE_WINDOW_SEC,
        });

        if (!mounted) return;

        if (error) {
          console.error('[useAdminOnlineIndicator] RPC error:', error);
          setStatusLabel('ERROR');
          return;
        }

        const payload = data as
          | { success?: boolean; users?: AdminOnlineUserRow[]; message?: string }
          | null;

        if (!payload?.success) {
          // Non-admin callers or auth errors — stay quiet, keep empty state
          setStatusLabel(payload?.message ? 'DENIED' : 'ERROR');
          return;
        }

        setOnlineUsers(payload.users ?? EMPTY_ONLINE_USERS);
        setStatusLabel('OK');
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (!mounted) return;
        console.error('[useAdminOnlineIndicator] fetch error:', err);
        setStatusLabel('ERROR');
      }
    };

    fetchOnlineUsers();
    const intervalId = setInterval(fetchOnlineUsers, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return {
    onlineCount:   onlineUsers.length,
    onlineUsers,
    onUserJoin,
    statusLabel,
    lastUpdatedAt,
  };
}
