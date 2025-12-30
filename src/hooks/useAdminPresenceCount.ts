import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OnlineUser {
  userId: string;
  onlineAt: string;
}

interface AdminPresenceResult {
  onlineCount: number;
  onlineUsers: OnlineUser[];
}

/**
 * Hook for admins to get live count and list of online users via Supabase Presence.
 * Listens to the 'online_users' presence channel and returns current count + user IDs.
 */
export const useAdminPresenceCount = (): AdminPresenceResult => {
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
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

    const updatePresenceState = () => {
      const state = channel.presenceState();
      // Get all user keys (excluding admin_listener)
      const users: OnlineUser[] = [];
      Object.entries(state).forEach(([key, presences]) => {
        if (key !== 'admin_listener' && presences && presences.length > 0) {
          const presence = presences[0] as { user_id?: string; online_at?: string };
          if (presence.user_id) {
            users.push({
              userId: presence.user_id,
              onlineAt: presence.online_at || new Date().toISOString(),
            });
          }
        }
      });
      console.log('[AdminPresence] Sync - online users:', users.length, users);
      setOnlineCount(users.length);
      setOnlineUsers(users);
    };

    channel
      .on('presence', { event: 'sync' }, updatePresenceState)
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

  return { onlineCount, onlineUsers };
};
