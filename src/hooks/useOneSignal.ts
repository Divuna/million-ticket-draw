import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const ONESIGNAL_APP_ID = '357be038-dbaf-4551-9a16-96d9897197a3';
const SOFINITY_SYNC_URL = 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/sofinity-player-sync';
const MAX_RETRIES = 3;
const SESSION_KEY = 'onesignal_synced_players';

// Global flag to prevent duplicate initialization across all hook instances
let isOneSignalInitialized = false;
let isOneSignalInitializing = false;

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

// Helper: Check if player ID was already synced this session
const wasPlayerSynced = (playerId: string): boolean => {
  const synced = sessionStorage.getItem(SESSION_KEY);
  return synced ? synced.split(',').includes(playerId) : false;
};

// Helper: Mark player ID as synced
const markPlayerSynced = (playerId: string) => {
  const synced = sessionStorage.getItem(SESSION_KEY);
  const ids = synced ? synced.split(',') : [];
  if (!ids.includes(playerId)) {
    ids.push(playerId);
    sessionStorage.setItem(SESSION_KEY, ids.join(','));
  }
};

// Helper: Sync player ID to Sofinity and Supabase with retry logic
const syncPlayerToSofinity = async (
  userId: string,
  email: string,
  playerId: string,
  retryCount = 0
): Promise<boolean> => {
  try {
    // 1. Store in Supabase users table
    const { error: dbError } = await supabase
      .from('users')
      .update({ onesignal_player_id: playerId })
      .eq('id', userId);

    if (dbError) {
      console.error('❌ Failed to store player_id in Supabase:', dbError);
    } else {
      console.log('✅ Player ID stored in Supabase users table:', playerId);
    }

    // 2. Sync to Sofinity endpoint
    const response = await fetch(SOFINITY_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        player_id: playerId,
        device_type: 'web'
      })
    });

    if (response.ok) {
      console.log('✅ Player ID synced to Sofinity:', playerId);
      markPlayerSynced(playerId);
      toast({ title: '✅ Zařízení zaregistrováno pro notifikace' });
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Sofinity sync failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
    
    if (retryCount < MAX_RETRIES - 1) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      return syncPlayerToSofinity(userId, email, playerId, retryCount + 1);
    } else {
      toast({ title: '⚠️ Registrace notifikací selhala, zkuste to prosím znovu' });
      return false;
    }
  }
};

export const useOneSignal = () => {
  const { user } = useAuth();
  const focusDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user || isOneSignalInitialized || isOneSignalInitializing) return;

    isOneSignalInitializing = true;
    console.log('🔄 Starting OneSignal initialization...');

    // Initialize OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      // Double-check to prevent duplicate initialization
      if (isOneSignalInitialized) {
        console.log('⚠️ OneSignal already initialized, skipping duplicate init');
        return;
      }
      
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
        });
        
        isOneSignalInitialized = true;
        isOneSignalInitializing = false;
        console.log('✅ OneSignal SDK initialized successfully');

        // Request notification permission using new SDK v16 API
        const permission = await OneSignal.Notifications.requestPermission();
        console.log('📬 Notification permission status:', permission);

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          const playerId = event.current.id;
          if (playerId && user.email && !wasPlayerSynced(playerId)) {
            console.log('✅ Player ID registered:', playerId);
            await syncPlayerToSofinity(user.id, user.email, playerId);
          }
        });

        // Check for existing subscription immediately after init
        const currentPlayerId = await OneSignal.User.PushSubscription.id;
        if (currentPlayerId && user.email && !wasPlayerSynced(currentPlayerId)) {
          console.log('✅ Found existing Player ID:', currentPlayerId);
          await syncPlayerToSofinity(user.id, user.email, currentPlayerId);
        }

        // Page focus re-sync handler with debounce
        const handleFocus = async () => {
          if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
          
          focusDebounceRef.current = setTimeout(async () => {
            const playerId = await OneSignal.User.PushSubscription.id;
            if (playerId && user.email && !wasPlayerSynced(playerId)) {
              console.log('🔄 Re-syncing player ID on focus:', playerId);
              await syncPlayerToSofinity(user.id, user.email, playerId);
            }
          }, 2000); // 2s debounce
        };

        window.addEventListener('focus', handleFocus);

        // Cleanup
        return () => {
          window.removeEventListener('focus', handleFocus);
          if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
        };
      } catch (error) {
        console.error('❌ OneSignal initialization error:', error);
        isOneSignalInitializing = false;
      }
    });
  }, [user]);
};
