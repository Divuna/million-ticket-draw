import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ADMIN_SOUND_STORAGE_KEY = 'admin_sound_notifications_enabled';

// Sound URLs
const SOUNDS = {
  newUser: '/sounds/notification.mp3',
  topup: '/sounds/win-celebration.mp3',
  gamePlay: '/sounds/notification.mp3',
};

export interface RealtimeEvent {
  type: 'ticket' | 'payment' | 'profile';
  timestamp: Date;
  source: 'realtime' | 'polling';
  details?: string;
}

export const useAdminRealtimeNotifications = (isAdmin: boolean) => {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(ADMIN_SOUND_STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [lastEvents, setLastEvents] = useState<RealtimeEvent[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<Date | null>(null);

  // Track last known counts for polling fallback
  const lastCountsRef = useRef<{ tickets: number; payments: number; profiles: number } | null>(null);

  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({
    newUser: null,
    topup: null,
    gamePlay: null,
  });

  // Initialize audio elements
  useEffect(() => {
    if (typeof window === 'undefined') return;

    audioRefs.current.newUser = new Audio(SOUNDS.newUser);
    audioRefs.current.newUser.volume = 0.6;
    
    audioRefs.current.topup = new Audio(SOUNDS.topup);
    audioRefs.current.topup.volume = 0.5;
    
    audioRefs.current.gamePlay = new Audio(SOUNDS.gamePlay);
    audioRefs.current.gamePlay.volume = 0.4;
    audioRefs.current.gamePlay.playbackRate = 1.3;

    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.pause();
          audio.src = '';
        }
      });
    };
  }, []);

  const addEvent = useCallback((event: RealtimeEvent) => {
    setLastEvents(prev => [event, ...prev].slice(0, 10));
    if (event.source === 'realtime') {
      setLastRealtimeEvent(new Date());
    }
  }, []);

  const playSound = useCallback((type: 'newUser' | 'topup' | 'gamePlay', source: 'realtime' | 'polling', details?: string) => {
    const eventType = type === 'newUser' ? 'profile' : type === 'topup' ? 'payment' : 'ticket';
    addEvent({ type: eventType, timestamp: new Date(), source, details });

    if (!soundEnabled) return;
    
    const audio = audioRefs.current[type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('[Admin Realtime] Sound play failed:', err);
      });
    }
  }, [soundEnabled, addEvent]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem(ADMIN_SOUND_STORAGE_KEY, String(newValue));
      } catch (e) {
        console.error('Error saving admin sound setting:', e);
      }
      return newValue;
    });
  }, []);

  // Realtime subscriptions
  useEffect(() => {
    if (!isAdmin) {
      console.log('[Admin Realtime] Not admin, skipping subscriptions');
      return;
    }

    console.log('[Admin Realtime] Setting up realtime subscriptions...');

    const profilesChannel = supabase
      .channel('admin-new-users', {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          console.log('[Admin Realtime] 🆕 Profile INSERT:', payload);
          playSound('newUser', 'realtime', `user_id: ${(payload.new as any)?.id}`);
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] profiles channel:', status);
        if (status === 'SUBSCRIBED') setRealtimeConnected(true);
      });

    const paymentsChannel = supabase
      .channel('admin-payments', {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payments' },
        (payload) => {
          console.log('[Admin Realtime] 💰 Payment INSERT:', payload);
          if (payload.new && (payload.new as any).status === 'completed') {
            playSound('topup', 'realtime', `amount: ${(payload.new as any)?.amount}`);
          }
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] payments channel:', status);
      });

    const ticketsChannel = supabase
      .channel('admin-game-played', {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          console.log('[Admin Realtime] 🎮 Ticket INSERT:', payload);
          playSound('gamePlay', 'realtime', `ticket #${(payload.new as any)?.number}`);
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] tickets channel:', status);
      });

    return () => {
      console.log('[Admin Realtime] Cleaning up subscriptions...');
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(ticketsChannel);
      setRealtimeConnected(false);
    };
  }, [isAdmin, playSound]);

  // Polling fallback - checks every 4 seconds
  useEffect(() => {
    if (!isAdmin) return;

    const pollForChanges = async () => {
      try {
        const [ticketsRes, paymentsRes, profilesRes] = await Promise.all([
          supabase.from('tickets').select('id', { count: 'exact', head: true }),
          supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
        ]);

        const currentCounts = {
          tickets: ticketsRes.count || 0,
          payments: paymentsRes.count || 0,
          profiles: profilesRes.count || 0,
        };

        if (lastCountsRef.current) {
          const prev = lastCountsRef.current;
          
          if (currentCounts.tickets > prev.tickets) {
            const diff = currentCounts.tickets - prev.tickets;
            console.log(`[Admin Polling] 🎮 ${diff} new ticket(s) detected`);
            playSound('gamePlay', 'polling', `+${diff} tiketů`);
          }
          
          if (currentCounts.payments > prev.payments) {
            const diff = currentCounts.payments - prev.payments;
            console.log(`[Admin Polling] 💰 ${diff} new payment(s) detected`);
            playSound('topup', 'polling', `+${diff} plateb`);
          }
          
          if (currentCounts.profiles > prev.profiles) {
            const diff = currentCounts.profiles - prev.profiles;
            console.log(`[Admin Polling] 🆕 ${diff} new profile(s) detected`);
            playSound('newUser', 'polling', `+${diff} uživatelů`);
          }
        }

        lastCountsRef.current = currentCounts;
      } catch (err) {
        console.error('[Admin Polling] Error:', err);
      }
    };

    // Initial count fetch
    pollForChanges();

    const interval = setInterval(pollForChanges, 4000);

    return () => clearInterval(interval);
  }, [isAdmin, playSound]);

  return {
    soundEnabled,
    toggleSound,
    lastEvents,
    realtimeConnected,
    lastRealtimeEvent,
  };
};
