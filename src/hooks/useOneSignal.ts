import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
    OneSignalInitialized?: boolean;
  }
}

export const useOneSignal = (userId?: string) => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const requestPermission = async () => {
    if (!window.OneSignal) {
      console.error('❌ OneSignal není dostupné');
      return false;
    }
    
    try {
      await window.OneSignal.User.PushSubscription.optIn();
      console.log('✅ Uživatel povolil notifikace');
      return true;
    } catch (error) {
      console.error('❌ Chyba při žádosti o povolení:', error);
      return false;
    }
  };

  useEffect(() => {
    const initializeOneSignal = async () => {
      console.log('🔄 Inicializace OneSignal...');
      
      // 1. Fetch App ID from Supabase settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'onesignal_app_id')
        .single();

      if (settingsError || !settingsData?.value) {
        console.error('❌ Nelze načíst OneSignal App ID z nastavení:', settingsError);
        return;
      }

      const appId = settingsData.value;
      console.log('✅ OneSignal App ID načten:', appId);

      // 2. Wait for OneSignal SDK to load
      let attempts = 0;
      while (!window.OneSignalDeferred && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 300));
        attempts++;
      }

      if (!window.OneSignalDeferred) {
        console.error('❌ OneSignal SDK nedostupné po 20 pokusech');
        return;
      }

      // 3. Initialize OneSignal with dynamic App ID
      window.OneSignalDeferred.push(async function (OneSignal: any) {
        // Prevent duplicate initialization
        if (window.OneSignalInitialized) {
          console.log('⚠️ OneSignal již inicializován, přeskakuji...');
          return;
        }
        window.OneSignalInitialized = true;

        try {
          await OneSignal.init({
            appId: appId,
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

          console.log('✅ OneSignal SDK úspěšně inicializován');
          setIsInitialized(true);

          // 4. Request push permission and get player_id
          if (userId) {
            try {
              await OneSignal.User.PushSubscription.optIn();
              console.log('✅ Push notifikace povoleny');
            } catch (error) {
              console.log('ℹ️ Uživatel odmítl notifikace nebo již byly povoleny');
            }

            // Get player ID
            const currentPlayerId = OneSignal.User.PushSubscription.id;
            
            if (currentPlayerId) {
              console.log('✅ Player ID získán:', currentPlayerId);
              setPlayerId(currentPlayerId);

              // 5. Save player_id to user_devices
              const { error } = await supabase
                .from('user_devices')
                .upsert({
                  user_id: userId,
                  player_id: currentPlayerId,
                  device_type: 'web',
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'user_id,player_id'
                });

              if (error) {
                console.error('❌ Chyba při ukládání player_id:', error);
              } else {
                console.log('✅ Player ID uložen do Supabase');
              }

              // Set external user ID
              await OneSignal.login(userId);
              console.log('✅ External User ID nastaven');
            }

            // Listen for subscription changes
            OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
              if (event.current.id) {
                console.log('🔔 Změna subscription, nový player ID:', event.current.id);
                setPlayerId(event.current.id);
                
                const { error } = await supabase
                  .from('user_devices')
                  .upsert({
                    user_id: userId,
                    player_id: event.current.id,
                    device_type: 'web',
                    updated_at: new Date().toISOString()
                  }, {
                    onConflict: 'user_id,player_id'
                  });

                if (error) {
                  console.error('❌ Chyba při aktualizaci player_id:', error);
                } else {
                  console.log('✅ Player ID aktualizován v Supabase');
                }
              }
            });
          }
        } catch (error) {
          console.error('💥 Chyba při inicializaci OneSignal:', error);
        }
      });
    };

    initializeOneSignal();
  }, [userId]);

  return { playerId, isInitialized, requestPermission };
};
