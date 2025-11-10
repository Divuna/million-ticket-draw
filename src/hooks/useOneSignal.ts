import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const ONESIGNAL_APP_ID = '5e5539e1-fc71-4c4d-9fef-414293d83dbb';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
    OneSignalInitialized?: boolean;
  }
}

export const useOneSignal = () => {
  const { user } = useAuth();
  const initializedRef = useRef(false);

  useEffect(() => {
    // Spustit pouze pokud je uživatel přihlášen a ještě nebylo inicializováno
    if (!user || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    console.log('🚀 Inicializace OneSignal pro uživatele:', user.email);

    // Inicializace OneSignal SDK
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      if (window.OneSignalInitialized) {
        console.log('⚠️ OneSignal již byl inicializován');
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

        window.OneSignalInitialized = true;
        console.log('✅ OneSignal SDK úspěšně inicializován');

        // Po inicializaci vyžádat oprávnění
        console.log('🔔 Žádám o oprávnění k push notifikacím...');
        
        // Posluchač změn v push subscription
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          const playerId = event.current.id;
          
          if (playerId) {
            console.log('✅ OneSignal Player ID získáno:', playerId);
            
            // Uložit do Supabase users.onesignal_player_id
            try {
              const { error } = await supabase
                .from('users')
                .update({ onesignal_player_id: playerId })
                .eq('id', user.id);

              if (error) {
                console.error('❌ Chyba při ukládání Player ID do Supabase:', error);
              } else {
                console.log('✅ Player ID úspěšně uloženo do Supabase pro uživatele:', user.email);
              }
            } catch (err) {
              console.error('❌ Výjimka při ukládání Player ID:', err);
            }
          }
        });

        // Zkontrolovat existující player ID
        const existingPlayerId = await OneSignal.User.PushSubscription.id;
        if (existingPlayerId) {
          console.log('✅ Nalezeno existující OneSignal Player ID:', existingPlayerId);
          
          try {
            const { error } = await supabase
              .from('users')
              .update({ onesignal_player_id: existingPlayerId })
              .eq('id', user.id);

            if (error) {
              console.error('❌ Chyba při ukládání existujícího Player ID do Supabase:', error);
            } else {
              console.log('✅ Existující Player ID úspěšně uloženo do Supabase pro uživatele:', user.email);
            }
          } catch (err) {
            console.error('❌ Výjimka při ukládání existujícího Player ID:', err);
          }
        }

      } catch (error) {
        console.error('❌ Chyba při inicializaci OneSignal:', error);
      }
    });

    // Reset při odhlášení
    return () => {
      if (!user) {
        initializedRef.current = false;
      }
    };
  }, [user]);
};
