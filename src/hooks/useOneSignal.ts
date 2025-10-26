import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const ONESIGNAL_APP_ID = '357be038-dbaf-4551-9a16-96d9897197a3';
let isOneSignalInitialized = false;

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

export const useOneSignal = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || isOneSignalInitialized) return;

    // Initialize OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      if (isOneSignalInitialized) return;
      
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
        });
        
        isOneSignalInitialized = true;
        console.log('✅ OneSignal initialized');

        // Request permission
        await OneSignal.Slidedown.promptPush({
          force: true,
          slidedownPromptOptions: {
            actionMessage: "Povolit oznámení",
            acceptButton: "Povolit",
            cancelButton: "Později"
          }
        });

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          if (event.current.id) {
            console.log('✅ Player ID registered:', event.current.id);
            
            toast({
              title: "Notifikace povoleny",
              description: "Budete dostávat důležitá oznámení."
            });

            // Save player ID to Supabase
            const { error } = await supabase
              .from('users')
              .update({ onesignal_player_id: event.current.id } as any)
              .eq('id', user.id);

            if (error) {
              console.error('Error saving OneSignal player ID:', error);
            }
          }
        });
      } catch (error) {
        console.error('OneSignal initialization error:', error);
      }
    });
  }, [user]);
};
