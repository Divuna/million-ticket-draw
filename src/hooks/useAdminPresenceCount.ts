import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for admins to get live count of online users via Supabase Presence.
 * Listens to the 'online_users' presence channel and returns current count.
 */
export const useAdminPresenceCount = () => {
  const [onlineCount, setOnlineCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: 'admin_listener',
        },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        // Count unique users (excluding admin_listener key)
        const userKeys = Object.keys(state).filter(key => key !== 'admin_listener');
        console.log('[AdminPresence] Sync - online users:', userKeys.length, userKeys);
        setOnlineCount(userKeys.length);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== 'admin_listener') {
          console.log('[AdminPresence] User joined:', key, newPresences);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (key !== 'admin_listener') {
          console.log('[AdminPresence] User left:', key, leftPresences);
        }
      })
      .subscribe((status) => {
        console.log('[AdminPresence] Subscription status:', status);
      });

    return () => {
      console.log('[AdminPresence] Cleaning up admin presence channel');
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  return onlineCount;
};
