import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

/**
 * Hook that tracks the current user's online presence using Supabase Realtime Presence.
 * Should be called once in the app for logged-in users.
 * Includes heartbeat and visibility change handling for mobile reliability.
 */
export const useOnlinePresence = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const isSubscribedRef = useRef(false);
  const isAdminRef = useRef(isAdmin);

  // Keep isAdminRef in sync
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  const trackPresence = useCallback(async () => {
    if (!channelRef.current || !user?.id || !isSubscribedRef.current) {
      return;
    }
    
    try {
      const trackResult = await channelRef.current.track({
        user_id: user.id,
        is_admin: isAdminRef.current,
        online_at: new Date().toISOString(),
      });
      console.log('[Presence] User tracked:', user.id, 'isAdmin:', isAdminRef.current, trackResult);
    } catch (error) {
      console.error('[Presence] Track error:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      // Clean up if user logs out
      if (channelRef.current) {
        console.log('[Presence] User logged out, removing channel');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      isSubscribedRef.current = false;
      return;
    }

    console.log('[Presence] Creating presence channel for user:', user.id);

    // Create presence channel with user.id as key
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[Presence] Sync event');
      })
      .subscribe(async (status) => {
        console.log('[Presence] Subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          
          // Initial track
          await trackPresence();
          
          // Start heartbeat interval
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          heartbeatIntervalRef.current = window.setInterval(() => {
            console.log('[Presence] Heartbeat track');
            trackPresence();
          }, HEARTBEAT_INTERVAL_MS);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isSubscribedRef.current = false;
          console.warn('[Presence] Channel disconnected:', status);
        }
      });

    // Visibility change handler for mobile - re-track when app returns to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isSubscribedRef.current) {
        console.log('[Presence] App returned to foreground, re-tracking');
        trackPresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      console.log('[Presence] Cleaning up presence channel');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      supabase.removeChannel(channel);
      channelRef.current = null;
      isSubscribedRef.current = false;
    };
  }, [user?.id, trackPresence]);
};
