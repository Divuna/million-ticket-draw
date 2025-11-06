import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const MAX_RETRIES = 3; // First attempt + 2 retries = 3 total attempts
const SESSION_KEY = 'onesignal_synced_players';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
    OneSignalInitialized?: boolean;
    OneSignalInitializing?: boolean;
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

// Helper: Save player ID to user_devices table
const savePlayerIdToDatabase = async (userId: string, playerId: string): Promise<boolean> => {
  try {
    console.log('💾 [savePlayerIdToDatabase] Ukládám player ID do databáze...', { userId, playerId });
    
    const { error } = await supabase
      .from('user_devices')
      .upsert({ 
        user_id: userId, 
        player_id: playerId, 
        device_type: 'web',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,player_id'
      });

    if (error) {
      console.error('❌ Chyba při ukládání player ID do databáze:', error);
      return false;
    }

    console.log('✅ Player ID úspěšně uložen do databáze');
    return true;
  } catch (error) {
    console.error('❌ Výjimka při ukládání player ID:', error);
    return false;
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

    // First, save player ID to database
    const dbSaved = await savePlayerIdToDatabase(userId, playerId);
    if (!dbSaved) {
      throw new Error('Failed to save player ID to database');
    }

    console.log('🚀 [syncPlayerToSofinity] Calling sofinity-player-sync edge function...');
    
    // Call edge function - it will extract user_id and email from JWT
    // and handle both Supabase update AND Sofinity forwarding
    const { data, error: functionError } = await supabase.functions.invoke('sofinity-player-sync', {
      body: {
        email: emailOrIdentifier,
        user_id: userId,
        player_id: playerId,
        device_type: 'web'
      }
    });

    console.log('✅ [syncPlayerToSofinity] Edge function call completed');
    console.log('📡 [syncPlayerToSofinity] Odpověď z edge funkce:', { 
      success: !functionError,
      data,
      error: functionError,
      dataDetails: data ? JSON.stringify(data) : 'null'
    });

    if (!functionError && data?.success) {
      console.log('✅ Player ID úspěšně synchronizován do OneMil i Sofinity');
      markPlayerSynced(playerId);
      toast({ title: 'Zařízení úspěšně zaregistrováno pro notifikace.' });
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
      toast({ title: 'Nelze aktivovat push' });
      return false;
    }
  }
};

export const useOneSignal = () => {
  const { user } = useAuth();
  const focusDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [appId, setAppId] = useState<string | null>(null);

  // Fetch OneSignal App ID from settings
  useEffect(() => {
    const fetchAppId = async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'onesignal_app_id')
        .single();
      
      if (error) {
        console.error('❌ Chyba při načítání OneSignal App ID:', error);
        return;
      }
      
      if (data?.value) {
        setAppId(data.value);
        console.log('✅ OneSignal App ID načteno ze settings');
      }
    };
    
    fetchAppId();
  }, []);

  useEffect(() => {
    if (!appId) {
      console.log('⚠️ OneSignal App ID ještě není k dispozici');
      return;
    }
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
      isOneSignalInitialized: window.OneSignalInitialized,
      isOneSignalInitializing: window.OneSignalInitializing
    });

    if (window.OneSignalInitialized || window.OneSignalInitializing) {
      console.log('⚠️ [useOneSignal] OneSignal already initialized/initializing, skipping');
      return;
    }

    window.OneSignalInitializing = true;
    console.log('🔄 Spouštění inicializace OneSignal...');

    // Initialize OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      // Double-check to prevent duplicate initialization
      if (window.OneSignalInitialized) {
        console.log('⚠️ OneSignal již byl inicializován, přeskakuji duplicitní inicializaci');
        return;
      }
      
      try {
        await OneSignal.init({
          appId: appId,
          allowLocalhostAsSecureOrigin: true,
          notifyButton: {
            enable: true,
          },
          slidedown: {
            prompts: [
              {
                type: 'push',
                autoPrompt: true,
                text: {
                  actionMessage: 'Chceš dostávat upozornění o soutěžích a výhrách?',
                  acceptButton: 'Ano',
                  cancelButton: 'Ne'
                }
              }
            ]
          }
        });
        
        window.OneSignalInitialized = true;
        window.OneSignalInitializing = false;
        console.log('✅ OneSignal SDK úspěšně inicializován se slidedown konfigurací');

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
        window.OneSignalInitializing = false;
      }
    });
  }, [user, appId]);
};
