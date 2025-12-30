import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ADMIN_SOUND_STORAGE_KEY = 'admin_sound_notifications_enabled';

// Sound URLs
const SOUNDS = {
  newUser: '/sounds/admin-new-user.mp3',
  newUserFallback: '/sounds/notification.mp3',
  topup: '/sounds/admin-topup.mp3',
  topupFallback: '/sounds/notification.mp3',
  gamePlay: '/sounds/admin-game-played.mp3',
  gamePlayFallback: '/sounds/notification.mp3',
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
  
  // Count-based deduplication: track last known count when sound was played by realtime
  const lastSoundCountsRef = useRef<{ tickets: number; payments: number; profiles: number }>({
    tickets: -1,
    payments: -1,
    profiles: -1,
  });

  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({
    newUser: null,
    topup: null,
    gamePlay: null,
  });

  // Stable ref for soundEnabled - prevents re-subscribe on toggle
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // STEP 2: Simplified connection indicator
  // Set to true once subscriptions are created, do not track runtime status changes
  // This isolates sound issues from connection detection complexity

  // Initialize audio elements
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // New user sound with fallback
    const newUserAudio = new Audio(SOUNDS.newUser);
    newUserAudio.volume = 0.6;
    newUserAudio.onerror = () => {
      console.warn('[Admin Realtime] Custom new user sound not found, using fallback');
      newUserAudio.src = SOUNDS.newUserFallback;
    };
    audioRefs.current.newUser = newUserAudio;
    
    // Topup sound with fallback
    const topupAudio = new Audio(SOUNDS.topup);
    topupAudio.volume = 0.5;
    topupAudio.onerror = () => {
      console.warn('[Admin Realtime] Custom topup sound not found, using fallback');
      topupAudio.src = SOUNDS.topupFallback;
    };
    audioRefs.current.topup = topupAudio;
    
    // Game play sound with fallback
    const gamePlayAudio = new Audio(SOUNDS.gamePlay);
    gamePlayAudio.volume = 0.4;
    gamePlayAudio.playbackRate = 1.3;
    gamePlayAudio.onerror = () => {
      console.warn('[Admin Realtime] Custom game play sound not found, using fallback');
      gamePlayAudio.src = SOUNDS.gamePlayFallback;
    };
    audioRefs.current.gamePlay = gamePlayAudio;

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

  // playSound is now stable - uses ref instead of state dependency
  const playSound = useCallback((type: 'newUser' | 'topup' | 'gamePlay', source: 'realtime' | 'polling', details?: string) => {
    const eventType = type === 'newUser' ? 'profile' : type === 'topup' ? 'payment' : 'ticket';
    
    addEvent({ type: eventType, timestamp: new Date(), source, details });

    // Check ref for current mute state - no dependency on soundEnabled state
    if (!soundEnabledRef.current) {
      console.log(`[Admin Sound] Muted - skipping ${type} sound`);
      return;
    }
    
    const audio = audioRefs.current[type];
    if (audio) {
      console.log(`[Admin Sound] Playing ${type} (${source})`);
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('[Admin Realtime] Sound play failed:', err);
      });
    }
  }, [addEvent]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem(ADMIN_SOUND_STORAGE_KEY, String(newValue));
      } catch (e) {
        console.error('Error saving admin sound setting:', e);
      }
      
      // When turning OFF: immediately stop all playing audio
      if (!newValue) {
        Object.values(audioRefs.current).forEach(audio => {
          if (audio) {
            audio.pause();
            audio.currentTime = 0;
          }
        });
        console.log('[Admin Sound] All sounds stopped (muted)');
      }
      
      return newValue;
    });
  }, []);

  // Sync audio.muted with soundEnabled as additional safeguard
  useEffect(() => {
    Object.values(audioRefs.current).forEach(audio => {
      if (audio) {
        audio.muted = !soundEnabled;
      }
    });
  }, [soundEnabled]);

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
          // Update count-based deduplication to prevent polling replay
          if (lastCountsRef.current) {
            lastCountsRef.current.profiles += 1;
            lastSoundCountsRef.current.profiles = lastCountsRef.current.profiles;
          }
          playSound('newUser', 'realtime', `user_id: ${(payload.new as any)?.id}`);
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] profiles channel:', status);
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        }
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
            // Update count-based deduplication to prevent polling replay
            if (lastCountsRef.current) {
              lastCountsRef.current.payments += 1;
              lastSoundCountsRef.current.payments = lastCountsRef.current.payments;
            }
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
          // Update count-based deduplication to prevent polling replay
          if (lastCountsRef.current) {
            lastCountsRef.current.tickets += 1;
            lastSoundCountsRef.current.tickets = lastCountsRef.current.tickets;
          }
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
            // Skip if realtime already played this sound
            if (lastSoundCountsRef.current.tickets >= currentCounts.tickets) {
              console.log(`[Admin Polling] 🎮 Skipping gamePlay sound (already played by realtime)`);
            } else {
              const diff = currentCounts.tickets - prev.tickets;
              console.log(`[Admin Polling] 🎮 ${diff} new ticket(s) detected`);
              lastSoundCountsRef.current.tickets = currentCounts.tickets;
              playSound('gamePlay', 'polling', `+${diff} tiketů`);
            }
          }
          
          if (currentCounts.payments > prev.payments) {
            // Skip if realtime already played this sound
            if (lastSoundCountsRef.current.payments >= currentCounts.payments) {
              console.log(`[Admin Polling] 💰 Skipping topup sound (already played by realtime)`);
            } else {
              const diff = currentCounts.payments - prev.payments;
              console.log(`[Admin Polling] 💰 ${diff} new payment(s) detected`);
              lastSoundCountsRef.current.payments = currentCounts.payments;
              playSound('topup', 'polling', `+${diff} plateb`);
            }
          }
          
          if (currentCounts.profiles > prev.profiles) {
            // Skip if realtime already played this sound
            if (lastSoundCountsRef.current.profiles >= currentCounts.profiles) {
              console.log(`[Admin Polling] 🆕 Skipping newUser sound (already played by realtime)`);
            } else {
              const diff = currentCounts.profiles - prev.profiles;
              console.log(`[Admin Polling] 🆕 ${diff} new profile(s) detected`);
              lastSoundCountsRef.current.profiles = currentCounts.profiles;
              playSound('newUser', 'polling', `+${diff} uživatelů`);
            }
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
