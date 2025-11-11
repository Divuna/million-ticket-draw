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
    const initializeOneSignal = async () => {
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

        const appId = settingsData.value;

        // Check if OneSignal is already initialized
        if (window.OneSignal && !isInitialized) {
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

          setIsInitialized(true);
          console.log('✅ OneSignal inicializován');

          // Request permission on load
          await window.OneSignal.User.PushSubscription.optIn();

          // Get player ID
          const currentPlayerId = await window.OneSignal.User.PushSubscription.id;
          setPlayerId(currentPlayerId);

          // Save to database if user is logged in
          if (userId && currentPlayerId) {
            await supabase.from('user_devices').upsert({
              user_id: userId,
              player_id: currentPlayerId,
              device_type: 'web',
              last_active: new Date().toISOString()
            });
            console.log('✅ Player ID uloženo do databáze');
          }

          // Listen for subscription changes
          window.OneSignal.User.PushSubscription.addEventListener('change', async (subscription: any) => {
            const newPlayerId = subscription.current.id;
            setPlayerId(newPlayerId);

            if (userId && newPlayerId) {
              await supabase.from('user_devices').upsert({
                user_id: userId,
                player_id: newPlayerId,
                device_type: 'web',
                last_active: new Date().toISOString()
              });
            }
          });
        }
      } catch (error) {
        console.error('❌ Chyba při inicializaci OneSignal:', error);
      }
    };

    if (!isInitialized) {
      initializeOneSignal();
    }
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
