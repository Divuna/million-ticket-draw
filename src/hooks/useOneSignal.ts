import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Declare OneSignal on window
declare global {
  interface Window {
    OneSignal: any;
  }
}

interface UseOneSignalReturn {
  playerId: string | null;
  isInitialized: boolean;
  requestPermission: () => Promise<void>;
}

export const useOneSignal = (userId?: string): UseOneSignalReturn => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let isSubscribed = true;

    const initializeOneSignal = async () => {
      // Prevent duplicate initialization
      if (isInitialized || !window.OneSignal) {
        console.log('⏸️ OneSignal již inicializován nebo SDK není načteno');
        return;
      }

      try {
        console.log('🔄 Inicializace OneSignal...');

        // Fetch OneSignal App ID from settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'onesignal_app_id')
          .single();

        if (settingsError || !settingsData?.value) {
          console.error('❌ Nelze načíst OneSignal App ID z nastavení:', settingsError);
          return;
        }

        if (!isSubscribed) return;

        const appId = settingsData.value;

        // Initialize OneSignal
        await window.OneSignal.init({
          appId,
          serviceWorkerPath: '/OneSignalSDKWorker.js',
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },
          promptOptions: {
            slidedown: {
              enabled: true,
              actionMessage: "Chcete dostávat oznámení o soutěžích a výhrách?",
              acceptButtonText: "Ano, chci oznámení",
              cancelButtonText: "Ne, děkuji"
            }
          }
        });

        if (!isSubscribed) return;

        setIsInitialized(true);
        console.log('✅ OneSignal úspěšně inicializován');

        // Request permission automatically
        await window.OneSignal.User.PushSubscription.optIn();
        console.log('✅ Oprávnění k notifikacím vyžádáno');

        // Get and save player ID
        const currentPlayerId = await window.OneSignal.User.PushSubscription.id;
        
        if (currentPlayerId && isSubscribed) {
          setPlayerId(currentPlayerId);
          console.log('📱 Player ID:', currentPlayerId);

          // Save to database if user is logged in
          if (userId) {
            const { error: upsertError } = await supabase.from('user_devices').upsert({
              user_id: userId,
              player_id: currentPlayerId,
              device_type: 'web',
              last_active: new Date().toISOString()
            }, {
              onConflict: 'user_id,player_id'
            });

            if (upsertError) {
              console.error('❌ Chyba při ukládání Player ID:', upsertError);
            } else {
              console.log('✅ Player ID úspěšně uloženo do databáze');
            }
          }
        }

        // Listen for subscription changes
        window.OneSignal.User.PushSubscription.addEventListener('change', async (subscription: any) => {
          if (!isSubscribed) return;

          const newPlayerId = subscription.current.id;
          
          if (newPlayerId) {
            setPlayerId(newPlayerId);
            console.log('📱 Player ID změněno:', newPlayerId);

            if (userId) {
              const { error: upsertError } = await supabase.from('user_devices').upsert({
                user_id: userId,
                player_id: newPlayerId,
                device_type: 'web',
                last_active: new Date().toISOString()
              }, {
                onConflict: 'user_id,player_id'
              });

              if (upsertError) {
                console.error('❌ Chyba při aktualizaci Player ID:', upsertError);
              } else {
                console.log('✅ Player ID aktualizováno v databázi');
              }
            }
          }
        });

      } catch (error) {
        console.error('❌ Chyba při inicializaci OneSignal:', error);
      }
    };

    // Wait for OneSignal SDK to load
    const checkAndInit = setInterval(() => {
      if (window.OneSignal && !isInitialized) {
        clearInterval(checkAndInit);
        initializeOneSignal();
      }
    }, 100);

    // Cleanup after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(checkAndInit);
    }, 10000);

    return () => {
      isSubscribed = false;
      clearInterval(checkAndInit);
      clearTimeout(timeout);
    };
  }, [userId, isInitialized]);

  const requestPermission = async () => {
    try {
      if (window.OneSignal) {
        await window.OneSignal.User.PushSubscription.optIn();
        console.log('✅ Oprávnění k notifikacím vyžádáno');
      }
    } catch (error) {
      console.error('❌ Chyba při vyžádání oprávnění:', error);
    }
  };

  return { playerId, isInitialized, requestPermission };
};
