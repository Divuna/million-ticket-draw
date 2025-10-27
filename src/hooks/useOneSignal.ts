import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

const ONESIGNAL_APP_ID = '357be038-dbaf-4551-9a16-96d9897197a3';
const SOFINITY_SYNC_URL = 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/sofinity-player-sync';
const MAX_RETRIES = 3;
const SESSION_KEY = 'onesignal_synced_players';

let isOneSignalInitialized = false;

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

// Helper: Sync player ID to Sofinity with retry logic
const syncPlayerToSofinity = async (
  email: string,
  playerId: string,
  retryCount = 0
): Promise<boolean> => {
  try {
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
      return syncPlayerToSofinity(email, playerId, retryCount + 1);
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
    if (!user || isOneSignalInitialized) return;

    // Initialize OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      if (isOneSignalInitialized) return;
      
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
        });
        
        isOneSignalInitialized = true;
        console.log('✅ OneSignal initialized');

        // Request permission
        await OneSignal.Slidedown.promptPush({
          force: true,
          slidedownPromptOptions: {
            actionMessage: "Povolit oznámení",
            acceptButton: "Povolit",
            cancelButton: "Později"
          }
        });

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          const playerId = event.current.id;
          if (playerId && user.email && !wasPlayerSynced(playerId)) {
            console.log('✅ Player ID registered:', playerId);
            await syncPlayerToSofinity(user.email, playerId);
          }
        });

        // Page focus re-sync handler with debounce
        const handleFocus = async () => {
          if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
          
          focusDebounceRef.current = setTimeout(async () => {
            const playerId = await OneSignal.User.PushSubscription.id;
            if (playerId && user.email && !wasPlayerSynced(playerId)) {
              console.log('🔄 Re-syncing player ID on focus:', playerId);
              await syncPlayerToSofinity(user.email, playerId);
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
        console.error('OneSignal initialization error:', error);
      }
    });
  }, [user]);
};
