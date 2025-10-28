import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const ONESIGNAL_APP_ID = '357be038-dbaf-4551-9a16-96d9897197a3';
const MAX_RETRIES = 3; // First attempt + 2 retries = 3 total attempts
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
  emailOrIdentifier: string,
  playerId: string,
  retryCount = 0
): Promise<boolean> => {
  try {
    console.log('📡 Zahajuji synchronizaci player ID...', { 
      email: emailOrIdentifier, 
      player_id: playerId, 
      device_type: 'web' 
    });

    // Call edge function - it handles both Supabase update AND Sofinity forwarding
    const { data, error: functionError } = await supabase.functions.invoke('sofinity-player-sync', {
      body: {
        email: emailOrIdentifier,
        player_id: playerId,
        device_type: 'web'
      }
    });

    console.log('📡 Odpověď z edge funkce:', { 
      success: !functionError,
      data,
      error: functionError
    });

    if (!functionError && data?.success) {
      console.log('✅ Player ID úspěšně synchronizován do OneMil i Sofinity');
      markPlayerSynced(playerId);
      toast({ title: '✅ Zařízení zaregistrováno pro notifikace' });
      return true;
    } else {
      throw new Error(`Sync error: ${functionError?.message || data?.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`❌ Synchronizace selhala (pokus ${retryCount + 1}/${MAX_RETRIES}):`, error);
    
    if (retryCount < MAX_RETRIES - 1) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`🔄 Opakování synchronizace za ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return syncPlayerToSofinity(userId, emailOrIdentifier, playerId, retryCount + 1);
    } else {
      console.error('❌ Synchronizace selhala - všechny pokusy vyčerpány');
      toast({ title: '⚠️ Registrace notifikací selhala, zkuste to prosím znovu' });
      return false;
    }
  }
};

export const useOneSignal = () => {
  const { user } = useAuth();
  const focusDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cleanup on logout
    if (!user) {
      console.log('🔄 User logged out - clearing OneSignal sync markers');
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }

    if (isOneSignalInitialized || isOneSignalInitializing) return;

    isOneSignalInitializing = true;
    console.log('🔄 Spouštění inicializace OneSignal...');

    // Initialize OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      // Double-check to prevent duplicate initialization
      if (isOneSignalInitialized) {
        console.log('⚠️ OneSignal již byl inicializován, přeskakuji duplicitní inicializaci');
        return;
      }
      
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
        });
        
        isOneSignalInitialized = true;
        isOneSignalInitializing = false;
        console.log('✅ OneSignal SDK úspěšně inicializován');

        // Request notification permission using new SDK v16 API
        const permission = await OneSignal.Notifications.requestPermission();
        console.log('📬 Stav povolení notifikací:', permission);

        // Helper to get user identifier (email or user.id for anonymous)
        const getUserIdentifier = () => user.email || user.id || 'anonymous';

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          const playerId = event.current.id;
          if (playerId && !wasPlayerSynced(playerId)) {
            console.log('✅ Player ID zaregistrován:', playerId);
            await syncPlayerToSofinity(user.id, getUserIdentifier(), playerId);
          }
        });

        // Check for existing subscription immediately after init
        const currentPlayerId = await OneSignal.User.PushSubscription.id;
        if (currentPlayerId && !wasPlayerSynced(currentPlayerId)) {
          console.log('✅ Nalezen existující Player ID:', currentPlayerId);
          await syncPlayerToSofinity(user.id, getUserIdentifier(), currentPlayerId);
        }

        // Page focus re-sync handler with debounce
        const handleFocus = async () => {
          if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
          
          focusDebounceRef.current = setTimeout(async () => {
            const playerId = await OneSignal.User.PushSubscription.id;
            if (playerId && !wasPlayerSynced(playerId)) {
              console.log('🔄 Opětovná synchronizace player ID při fokusu:', playerId);
              await syncPlayerToSofinity(user.id, getUserIdentifier(), playerId);
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
        console.error('❌ Chyba při inicializaci OneSignal:', error);
        isOneSignalInitializing = false;
      }
    });
  }, [user]);
};
