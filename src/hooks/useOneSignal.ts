import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void>;
    OneSignal?: any;
  }
}

export const useOneSignal = (userId?: string) => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const initOneSignal = async () => {
      try {
        // Počkej na načtení OneSignal SDK
        if (!window.OneSignal) {
          console.log('⏳ Čekám na OneSignal SDK...');
          // Retry každých 500ms, max 10 pokusů
          let attempts = 0;
          const checkInterval = setInterval(() => {
            attempts++;
            if (window.OneSignal) {
              clearInterval(checkInterval);
              initOneSignal();
            } else if (attempts > 10) {
              clearInterval(checkInterval);
              setError('OneSignal SDK se nepodařilo načíst');
              console.error('❌ OneSignal SDK timeout');
            }
          }, 500);
          return;
        }

        const OneSignal = window.OneSignal;

        // Zkontroluj jestli je inicializované
        const isPushSupported = await OneSignal.Notifications.isPushSupported();
        if (!isPushSupported) {
          console.warn('⚠️ Push notifikace nejsou podporované v tomto browseru');
          setError('Push notifikace nejsou podporované');
          return;
        }

        console.log('✅ OneSignal SDK načteno');
        setIsInitialized(true);

        const permission = await OneSignal.Notifications.permissionNative;
        console.log('🔔 Permission status:', permission);

        if (permission === 'default') {
          // Požádej o permission
          console.log('📱 Žádám o permission...');
          const granted = await OneSignal.Notifications.requestPermission();
          console.log('📱 Permission granted:', granted);
        }

        // Získej player ID
        const currentPlayerId = await OneSignal.User.PushSubscription.id;
        if (currentPlayerId) {
          console.log('✅ OneSignal player_id získán:', currentPlayerId);
          setPlayerId(currentPlayerId);

          // Ulož do Supabase
          const { error: updateError } = await supabase
            .from('users')
            .update({ onesignal_player_id: currentPlayerId })
            .eq('id', userId);

          if (updateError) {
            console.error('❌ Chyba při ukládání player_id:', updateError);
            setError(updateError.message);
          } else {
            console.log('✅ Player ID uloženo do Supabase pro user:', userId);
          }

          // Nastav external user ID v OneSignal
          await OneSignal.login(userId);
          console.log('✅ OneSignal external user ID nastaven:', userId);
        } else {
          console.warn('⚠️ Player ID není k dispozici - uživatel možná nepovolil notifikace');
          setError('Player ID není k dispozici');
        }

        // Listener pro změny subscription
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          console.log('🔄 Subscription změna:', event);
          if (event.current.id) {
            setPlayerId(event.current.id);
            await supabase
              .from('users')
              .update({ onesignal_player_id: event.current.id })
              .eq('id', userId);
          }
        });

      } catch (err) {
        console.error('❌ OneSignal init error:', err);
        setError(err instanceof Error ? err.message : 'Neznámá chyba');
      }
    };

    initOneSignal();
  }, [userId]);

  return { playerId, isInitialized, error };
};
