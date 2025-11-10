import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

export const useOneSignal = () => {
  const { user } = useAuth();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    console.log('🚀 Inicializace OneSignal SDK...');

    // Čekání na načtení OneSignal SDK
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        // Posluchač změn v push subscription
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          const playerId = event.current.id;
          
          if (playerId && user) {
            try {
              const { error } = await supabase
                .from('users')
                .update({ onesignal_player_id: playerId })
                .eq('id', user.id);

              if (error) {
                console.error('❌ Chyba při ukládání Player ID do Supabase:', error);
              } else {
                console.log('✅ OneSignal player_id uložen:', playerId);
              }
            } catch (err) {
              console.error('❌ Výjimka při ukládání Player ID:', err);
            }
          } else if (!user) {
            console.log('⚠️ Uživatel není přihlášen nebo player_id chybí');
          }
        });

        // Zkontrolovat existující player ID
        const existingPlayerId = await OneSignal.User.PushSubscription.id;
        if (existingPlayerId && user) {
          try {
            const { error } = await supabase
              .from('users')
              .update({ onesignal_player_id: existingPlayerId })
              .eq('id', user.id);

            if (error) {
              console.error('❌ Chyba při ukládání existujícího Player ID do Supabase:', error);
            } else {
              console.log('✅ OneSignal player_id uložen:', existingPlayerId);
            }
          } catch (err) {
            console.error('❌ Výjimka při ukládání existujícího Player ID:', err);
          }
        } else if (!user) {
          console.log('⚠️ Uživatel není přihlášen nebo player_id chybí');
        }

      } catch (error) {
        console.error('💥 Chyba při inicializaci OneSignal:', error);
      }
    });

    return () => {
      if (!user) {
        initializedRef.current = false;
      }
    };
  }, [user]);
};
