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
    console.log('📡 [syncPlayerToSofinity] Zahajuji synchronizaci player ID...', { 
      userId,
      email: emailOrIdentifier, 
      player_id: playerId, 
      device_type: 'web',
      retryCount
    });

    // Fetch current user to get their email
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData?.user) {
      throw new Error(`Failed to fetch user: ${userError?.message || 'User not found'}`);
    }

    const userEmail = userData.user.email || emailOrIdentifier;
    
    console.log('🚀 [syncPlayerToSofinity] Calling save_player_id RPC...');
    
    // Call RPC to save player ID
    const { data, error: rpcError } = await supabase.rpc('save_player_id', {
      p_user_id: userId,
      p_player_id: playerId,
      p_device_type: 'web',
      p_email: userEmail
    });

    console.log('✅ [syncPlayerToSofinity] RPC call completed');
    console.log('📡 [syncPlayerToSofinity] Odpověď z RPC:', { 
      success: !rpcError,
      data,
      error: rpcError,
      dataDetails: data ? JSON.stringify(data) : 'null'
    });

    if (!rpcError) {
      console.log('✅ Player ID úspěšně synchronizován do OneMil i Sofinity');
      markPlayerSynced(playerId);
      toast({ title: '✅ Zařízení zaregistrováno pro notifikace' });
      return true;
    } else {
      throw new Error(`RPC error: ${rpcError?.message || 'Unknown error'}`);
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
    console.log('🔍 [useOneSignal] Hook triggered, user state:', { 
      hasUser: !!user, 
      userId: user?.id,
      userEmail: user?.email 
    });

    // Cleanup on logout
    if (!user) {
      console.log('🔄 User logged out - clearing OneSignal sync markers');
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }

    console.log('🚀 [useOneSignal] User is logged in, checking initialization state:', {
      isOneSignalInitialized,
      isOneSignalInitializing
    });

    if (isOneSignalInitialized || isOneSignalInitializing) {
      console.log('⚠️ [useOneSignal] OneSignal already initialized/initializing, skipping');
      return;
    }

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
          notifyButton: {
            enable: true,
          },
        });
        
        isOneSignalInitialized = true;
        isOneSignalInitializing = false;
        console.log('✅ OneSignal SDK úspěšně inicializován');

        // Check if notifications are already enabled
        const isPushEnabled = await OneSignal.Notifications.isPushSupported();
        const permission = await OneSignal.Notifications.permission;
        console.log('📬 Stav povolení notifikací:', { isPushEnabled, permission });

        // Show Czech localized slidedown only if notifications not yet enabled
        if (isPushEnabled && permission !== 'granted') {
          console.log('🔔 Zobrazuji českou výzvu k povolení notifikací...');
          await OneSignal.Slidedown.promptPush({
            force: true,
            text: {
              actionMessage: "Chcete dostávat upozornění na nové soutěže, výhry a bonusy?",
              acceptButton: "Povolit",
              cancelButton: "Ne, děkuji"
            }
          });
        } else if (permission === 'granted') {
          console.log('✅ Notifikace již jsou povoleny');
        }

        // Helper to get user identifier (email or user.id for anonymous)
        const getUserIdentifier = () => user.email || user.id || 'anonymous';

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          console.log('🔔 [OneSignal] Subscription change event:', {
            hasPlayerId: !!event.current.id,
            playerId: event.current.id
          });
          const playerId = event.current.id;
          if (playerId && !wasPlayerSynced(playerId)) {
            console.log('✅ Player ID zaregistrován z subscription change:', playerId);
            await syncPlayerToSofinity(user.id, getUserIdentifier(), playerId);
          } else if (playerId) {
            console.log('ℹ️ Player ID již byl synchronizován:', playerId);
          }
        });

        // Check for existing subscription immediately after init
        console.log('🔍 [OneSignal] Checking for existing player ID...');
        const currentPlayerId = await OneSignal.User.PushSubscription.id;
        console.log('🔍 [OneSignal] Existing player ID check result:', { 
          hasPlayerId: !!currentPlayerId,
          playerId: currentPlayerId,
          alreadySynced: currentPlayerId ? wasPlayerSynced(currentPlayerId) : false
        });
        
        if (currentPlayerId && !wasPlayerSynced(currentPlayerId)) {
          console.log('✅ Nalezen existující Player ID, spouštím synchronizaci:', currentPlayerId);
          await syncPlayerToSofinity(user.id, getUserIdentifier(), currentPlayerId);
        } else if (currentPlayerId) {
          console.log('ℹ️ Player ID již byl synchronizován, přeskakuji');
        } else {
          console.log('⚠️ Žádný player ID nenalezen po inicializaci');
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
