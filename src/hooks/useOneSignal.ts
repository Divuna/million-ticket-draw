import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Declare OneSignal on window with initialization guards
declare global {
  interface Window {
    OneSignal: any;
    OneSignalDeferred: any[];
    __ONESIGNAL_INIT_DONE?: boolean;
    __ONESIGNAL_INIT_PROMISE?: Promise<void>;
  }
}

interface UseOneSignalReturn {
  playerId: string | null;
  isInitialized: boolean;
  requestPermission: () => Promise<void>;
}

// Robust device save function: SELECT -> UPDATE or INSERT
const saveDevice = async (userId: string, playerId: string): Promise<void> => {
  try {
    console.log('💾 Attempting to save device:', { userId, playerId });

    // 1. Check if record exists
    const { data: existing, error: selectError } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (selectError) {
      console.error('❌ SELECT user_devices error:', selectError);
      return;
    }

    if (existing?.id) {
      // 2. UPDATE updated_at
      const { error: updateError } = await supabase
        .from('user_devices')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (updateError) {
        console.error('❌ UPDATE user_devices error:', updateError);
      } else {
        console.log('✅ user_devices updated_at aktualizováno');
      }
    } else {
      // 3. INSERT new record
      const { error: insertError } = await supabase
        .from('user_devices')
        .insert({
          user_id: userId,
          player_id: playerId,
          device_type: 'web',
        });

      if (insertError) {
        console.error('❌ INSERT user_devices error:', insertError);
      } else {
        console.log('✅ user_devices záznam vytvořen');
      }
    }
  } catch (error) {
    console.error('❌ Chyba při ukládání zařízení:', error);
  }
};

// Ensure OneSignal initializes only once
const ensureOneSignalInit = async (appId: string): Promise<void> => {
  // Already initialized
  if (window.__ONESIGNAL_INIT_DONE) {
    console.log('✅ OneSignal již inicializován');
    return;
  }

  // Initialization in progress - wait for it
  if (window.__ONESIGNAL_INIT_PROMISE) {
    console.log('⏳ Čekám na dokončení OneSignal inicializace...');
    return window.__ONESIGNAL_INIT_PROMISE;
  }

  // Start initialization
  console.log('🚀 Zahajuji OneSignal inicializaci...');
  
  window.__ONESIGNAL_INIT_PROMISE = new Promise<void>((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        console.log('📡 OneSignal SDK načteno, volám init...');
        
        await OneSignal.init({
          appId,
          serviceWorkerPath: '/OneSignalSDKWorker.js',
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },
          promptOptions: {
            slidedown: {
              enabled: true,
              actionMessage: 'Chcete dostávat oznámení o soutěžích a výhrách?',
              acceptButtonText: 'Ano, chci oznámení',
              cancelButtonText: 'Ne, děkuji',
            },
          },
        });

        window.__ONESIGNAL_INIT_DONE = true;
        console.log('✅ OneSignal úspěšně inicializován');
        resolve();
      } catch (error) {
        console.error('❌ Chyba při inicializaci OneSignal:', error);
        reject(error);
      }
    });
  });

  return window.__ONESIGNAL_INIT_PROMISE;
};

export const useOneSignal = (userId?: string): UseOneSignalReturn => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Main initialization effect
  useEffect(() => {
    let isSubscribed = true;

    const initializeOneSignal = async () => {
      try {
        console.log('🔧 useOneSignal effect spuštěn');
        console.log('👤 userId:', userId || 'nepřihlášen');
        console.log('🔔 Notification.permission:', typeof Notification !== 'undefined' ? Notification.permission : 'unknown');

        // Check if OneSignal SDK is available
        if (typeof window === 'undefined' || !window.OneSignalDeferred) {
          console.error('❌ OneSignal SDK není dostupný');
          return;
        }

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
        console.log('🔑 OneSignal App ID:', appId);

        // Ensure initialization
        await ensureOneSignalInit(appId);

        if (!isSubscribed) return;

        setIsInitialized(true);
        console.log('✅ useOneSignal: isInitialized = true');

        // Wait for OneSignal to be fully ready
        await window.OneSignal.User.PushSubscription.optedIn();

        // Get player ID after ensuring subscription is ready
        let currentPlayerId = window.OneSignal.User.PushSubscription.id;
        
        // If player ID is not immediately available, try getting it after a short delay
        if (!currentPlayerId) {
          console.log('⏳ Player ID není okamžitě dostupné, čekám...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          currentPlayerId = window.OneSignal.User.PushSubscription.id;
        }
        
        if (currentPlayerId && isSubscribed) {
          setPlayerId(currentPlayerId);
          console.log('📱 Player ID získáno:', currentPlayerId);

          // Save to database if user is logged in
          if (userId) {
            await saveDevice(userId, currentPlayerId);
          } else {
            console.log('⏭️ Uživatel není přihlášen, přeskakuji uložení do DB');
          }
        } else {
          console.warn('⚠️ Player ID není dostupné. Možné důvody: oprávnění odepřeno nebo SDK není připraveno.');
        }

        // Listen for subscription changes
        window.OneSignal.User.PushSubscription.addEventListener('change', async (subscription: any) => {
          if (!isSubscribed) return;

          const newPlayerId = subscription?.current?.id;
          console.log('🔄 OneSignal subscription změna, nové Player ID:', newPlayerId);
          
          if (newPlayerId) {
            setPlayerId(newPlayerId);

            if (userId) {
              await saveDevice(userId, newPlayerId);
            }
          }
        });

      } catch (error) {
        console.error('❌ Chyba v useOneSignal inicializaci:', error);
        if (error instanceof Error) {
          console.error('❌ Error details:', error.message, error.stack);
        }
      }
    };

    initializeOneSignal();

    return () => {
      isSubscribed = false;
    };
  }, [userId]);

  // Additional effect: Save player ID when user logs in after initialization
  useEffect(() => {
    if (isInitialized && userId && playerId) {
      console.log('🔄 userId změněno po inicializaci, ukládám player ID dodatečně...');
      saveDevice(userId, playerId);
    }
  }, [userId, isInitialized, playerId]);

  const requestPermission = async () => {
    try {
      if (window.OneSignal && isInitialized) {
        console.log('🔔 Manuální požadavek na oprávnění...');
        await window.OneSignal.User.PushSubscription.optIn();
        console.log('✅ Oprávnění k notifikacím vyžádáno');
      } else {
        console.warn('⚠️ OneSignal není inicializován');
      }
    } catch (error) {
      console.error('❌ Chyba při vyžádání oprávnění:', error);
    }
  };

  return { playerId, isInitialized, requestPermission };
};
