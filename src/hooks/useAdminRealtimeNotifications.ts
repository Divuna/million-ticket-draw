import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ADMIN_SOUND_STORAGE_KEY = 'admin_sound_notifications_enabled';

// Sound URLs - using existing notification.mp3 with different playback approaches
// For distinct sounds, add more files to public/sounds/ and update these paths
const SOUNDS = {
  newUser: '/sounds/notification.mp3',
  topup: '/sounds/win-celebration.mp3',
  gamePlay: '/sounds/notification.mp3',
};

export const useAdminRealtimeNotifications = (isAdmin: boolean) => {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(ADMIN_SOUND_STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

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
    audioRefs.current.gamePlay.playbackRate = 1.3; // Slightly faster for game events

    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.pause();
          audio.src = '';
        }
      });
    };
  }, []);

  const playSound = useCallback((type: 'newUser' | 'topup' | 'gamePlay') => {
    if (!soundEnabled) return;
    
    const audio = audioRefs.current[type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('Admin notification sound failed:', err);
      });
    }
  }, [soundEnabled]);

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

  // Realtime subscriptions - configured to receive events from all users/devices
  useEffect(() => {
    if (!isAdmin) {
      console.log('[Admin Realtime] Not admin, skipping subscriptions');
      return;
    }

    console.log('[Admin Realtime] Setting up realtime subscriptions for admin notifications...');

    // New user registration - listen to profiles INSERT
    const profilesChannel = supabase
      .channel('admin-new-users', {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          console.log('[Admin Realtime] 🆕 New user registered:', {
            timestamp: new Date().toISOString(),
            payload,
          });
          playSound('newUser');
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] profiles channel status:', status);
      });

    // MioCoin top-up - listen to payments INSERT
    const paymentsChannel = supabase
      .channel('admin-payments', {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payments',
        },
        (payload) => {
          console.log('[Admin Realtime] 💰 New payment received:', {
            timestamp: new Date().toISOString(),
            status: (payload.new as any)?.status,
            payload,
          });
          // Only play for completed payments (top-ups)
          if (payload.new && (payload.new as any).status === 'completed') {
            playSound('topup');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] payments channel status:', status);
      });

    // Game played / MioCoin spent - listen to tickets INSERT
    const ticketsChannel = supabase
      .channel('admin-game-played', {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          console.log('[Admin Realtime] 🎮 Ticket purchased (game played):', {
            timestamp: new Date().toISOString(),
            ticketNumber: (payload.new as any)?.number,
            contestId: (payload.new as any)?.contest_id,
            userId: (payload.new as any)?.user_id,
            payload,
          });
          playSound('gamePlay');
        }
      )
      .subscribe((status) => {
        console.log('[Admin Realtime] tickets channel status:', status);
      });

    return () => {
      console.log('[Admin Realtime] Cleaning up realtime subscriptions...');
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(ticketsChannel);
    };
  }, [isAdmin, playSound]);

  return {
    soundEnabled,
    toggleSound,
  };
};
