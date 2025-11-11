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
      console.log('🔄 Čekám na OneSignal SDK...');
      
      let attempts = 0;
      while (!window.OneSignal && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 300));
        attempts++;
      }

      if (!window.OneSignal) {
        console.error('❌ OneSignal SDK nedostupné po 20 pokusech');
        return;
      }

      const OneSignal = window.OneSignal;
      console.log('✅ OneSignal připojeno');
      setIsInitialized(true);

      try {
        // Získej player ID
        const currentPlayerId = OneSignal.User.PushSubscription.id;
        
        if (currentPlayerId) {
          console.log('✅ Player ID získán:', currentPlayerId);
          setPlayerId(currentPlayerId);

          // Ulož do user_devices
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

          // Nastav external user ID
          await OneSignal.login(userId);
          console.log('✅ External User ID nastaven');
        } else {
          console.warn('⚠️ Player ID zatím není dostupný');
        }

        // Listener pro změny subscription
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
      } catch (error) {
        console.error('💥 Chyba při inicializaci OneSignal:', error);
      }
    };

    waitForOneSignal();
  }, [userId]);

  return { playerId, isInitialized };
};
