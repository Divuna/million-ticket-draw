import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OnlineUser {
  userId: string;
  onlineAt: string;
}

type PresenceStatus = 'connecting' | 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT';

interface AdminPresenceResult {
  onlineCount: number;
  onlineUsers: OnlineUser[];
  onUserJoin: (callback: (userId: string) => void) => void;
  presenceStatus: PresenceStatus;
  lastSyncAt: Date | null;
}

/**
 * Hook for admins to get live count and list of online users via Supabase Presence.
 * Uses a SEPARATE Supabase client to avoid channel conflicts with useOnlinePresence.
 */
export const useAdminPresenceCount = (): AdminPresenceResult => {
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinCallbackRef = useRef<((userId: string) => void) | null>(null);
  const initialSyncDoneRef = useRef(false);

  const onUserJoin = useCallback((callback: (userId: string) => void) => {
    joinCallbackRef.current = callback;
  }, []);

  useEffect(() => {
    console.log('[AdminPresence] Creating admin presence channel');
    
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
      console.log('[AdminPresence] Raw presence state:', state);
      
      // Get all user keys (excluding admin_listener and admin users)
      const users: OnlineUser[] = [];
      Object.entries(state).forEach(([key, presences]) => {
        if (key !== 'admin_listener' && presences && presences.length > 0) {
          const presence = presences[0] as { user_id?: string; online_at?: string; is_admin?: boolean };
          
          // Skip admin users - only show customers
          if (presence.is_admin) {
            console.log('[AdminPresence] Skipping admin user:', key);
            return;
          }
          
          // Fallback: use key as userId if user_id not present
          const userId = presence.user_id || key;
          users.push({
            userId,
            onlineAt: presence.online_at || new Date().toISOString(),
          });
        }
      });
      console.log('[AdminPresence] Sync - online customers:', users.length, users);
      setOnlineCount(users.length);
      setOnlineUsers(users);
      setLastSyncAt(new Date());
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[AdminPresence] Sync event received');
        updatePresenceState();
        // Mark initial sync as done after first sync
        if (!initialSyncDoneRef.current) {
          initialSyncDoneRef.current = true;
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== 'admin_listener') {
          const presence = newPresences[0] as { user_id?: string; is_admin?: boolean };
          
          // Skip admin users - don't notify for admin joins
          if (presence?.is_admin) {
            console.log('[AdminPresence] Skipping admin join:', key);
            return;
          }
          
          console.log('[AdminPresence] Customer joined:', key, newPresences);
          // Only trigger callback after initial sync (to avoid sounds on page load)
          if (initialSyncDoneRef.current && joinCallbackRef.current) {
            const userId = presence?.user_id || key;
            joinCallbackRef.current(userId);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (key !== 'admin_listener') {
          console.log('[AdminPresence] User left:', key, leftPresences);
        }
      })
      .subscribe(async (status) => {
        console.log('[AdminPresence] Subscription status:', status);
        setPresenceStatus(status as PresenceStatus);
        
        if (status === 'SUBSCRIBED') {
          // Admin must also track to participate in presence channel
          const trackResult = await channel.track({
            is_admin: true,
            online_at: new Date().toISOString(),
          });
          console.log('[AdminPresence] Admin tracked:', trackResult);
        }
      });

    return () => {
      console.log('[AdminPresence] Cleaning up admin presence channel');
      supabase.removeChannel(channel);
      channelRef.current = null;
      initialSyncDoneRef.current = false;
    };
  }, []);

  return { onlineCount, onlineUsers, onUserJoin, presenceStatus, lastSyncAt };
};
