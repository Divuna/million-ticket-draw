import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignal?: any;
  }
}

export const useOneSignal = (userId?: string) => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const waitForOneSignal = async () => {
      // Počkej na OneSignal (už je inicializované v index.html)
      let attempts = 0;
      while (!window.OneSignal && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 300));
        attempts++;
      }

      if (!window.OneSignal) {
        console.error('❌ OneSignal SDK nedostupné');
        return;
      }

      const OneSignal = window.OneSignal;
      console.log('✅ OneSignal připojeno');
      setIsInitialized(true);

      // Získej player ID
      const currentPlayerId = OneSignal.User.PushSubscription.id;
      
      if (currentPlayerId) {
        console.log('✅ Player ID:', currentPlayerId);
        setPlayerId(currentPlayerId);

        // Ulož do Supabase
        await supabase
          .from('users')
          .update({ onesignal_player_id: currentPlayerId })
          .eq('id', userId);

        // Nastav external user ID
        await OneSignal.login(userId);
        console.log('✅ User ID nastaven');
      }

      // Listener pro změny
      OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
        if (event.current.id) {
          setPlayerId(event.current.id);
          await supabase
            .from('users')
            .update({ onesignal_player_id: event.current.id })
            .eq('id', userId);
        }
      });
    };

    waitForOneSignal();
  }, [userId]);

  return { playerId, isInitialized };
};
