import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Bumps public.users.last_seen_at for the current authenticated user
 * every 60 seconds via the bump_user_last_seen() SECURITY DEFINER RPC.
 *
 * - Only fires when `userId` is provided (user is signed in).
 * - Safe to mount unconditionally in AppContent — no-op when userId is undefined.
 * - Fires once immediately on mount / sign-in, then every 60 s thereafter.
 * - Does NOT track page history, URLs, or any data beyond the timestamp.
 */
export function useHeartbeat(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;

    const bump = () => {
      supabase
        .rpc('bump_user_last_seen')
        .catch((err) => console.error('[useHeartbeat] bump error:', err));
    };

    bump(); // fire immediately so admin sees user within seconds of sign-in
    const intervalId = setInterval(bump, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [userId]);
}
