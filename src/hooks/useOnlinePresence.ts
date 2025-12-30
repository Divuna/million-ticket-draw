import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook that tracks the current user's online presence using Supabase Realtime Presence.
 * Should be called once in the app for logged-in users.
 */
export const useOnlinePresence = () => {
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user?.id) {
      // Clean up if user logs out
      if (channelRef.current) {
        console.log('[Presence] User logged out, removing channel');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Create presence channel
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
        if (status === 'SUBSCRIBED') {
          // Track this user's presence
          const trackResult = await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
          console.log('[Presence] User tracked:', user.id, trackResult);
        }
      });

    return () => {
      console.log('[Presence] Cleaning up presence channel');
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id]);
};
