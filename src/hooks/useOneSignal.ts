import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useOneSignal = (userId: string | undefined) => {
  const [playerId, setPlayerId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initOneSignal = async () => {
      if (typeof window === 'undefined' || !window.OneSignal) {
        console.log('OneSignal not available');
        return;
      }

      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'onesignal_app_id')
          .single();

        if (!data?.value) {
          console.warn('OneSignal App ID not found in settings');
          return;
        }

        await window.OneSignal.init({
          appId: data.value,
          allowLocalhostAsSecureOrigin: true,
        });

        setIsInitialized(true);

        // Get player ID
        const id = await window.OneSignal.User.PushSubscription.id;
        if (id) {
          setPlayerId(id);

          // Save to database if user is logged in
          if (userId) {
            const { data: existing } = await supabase
              .from('user_devices')
              .select('id')
              .eq('user_id', userId)
              .eq('player_id', id)
              .maybeSingle();

            if (existing?.id) {
              await supabase
                .from('user_devices')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            } else {
              await supabase
                .from('user_devices')
                .insert({
                  user_id: userId,
                  player_id: id,
                  device_type: 'web',
                });
            }
          }
        }

        // Listen for subscription changes
        window.OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          const newId = event.current.id;
          if (newId) {
            setPlayerId(newId);
            
            if (userId) {
              const { data: existing } = await supabase
                .from('user_devices')
                .select('id')
                .eq('user_id', userId)
                .eq('player_id', newId)
                .maybeSingle();

              if (existing?.id) {
                await supabase
                  .from('user_devices')
                  .update({ updated_at: new Date().toISOString() })
                  .eq('id', existing.id);
              } else {
                await supabase
                  .from('user_devices')
                  .insert({
                    user_id: userId,
                    player_id: newId,
                    device_type: 'web',
                  });
              }
            }
          }
        });
      } catch (error) {
        console.error('OneSignal init error:', error);
      }
    };

    initOneSignal();
  }, [userId]);

  return { playerId, isInitialized };
};
