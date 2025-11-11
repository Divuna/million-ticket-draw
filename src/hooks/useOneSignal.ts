import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const registrationAttempted = useRef(false);

  const requestPermission = async () => {
    if (!window.OneSignal) {
      console.error("❌ OneSignal není dostupné");
      return false;
    }

    try {
      await window.OneSignal.User.PushSubscription.optIn();
      console.log("✅ Uživatel povolil notifikace");
      return true;
    } catch (error) {
      console.error("❌ Chyba při žádosti o povolení:", error);
      return false;
    }
  };

  // INITIALIZATION - Spustí se pouze jednou
  useEffect(() => {
    const initializeOneSignal = async () => {
      if (registrationAttempted.current) {
        console.log("⏭️ OneSignal již inicializován, přeskakuji...");
        return;
      }

      console.log("🔄 Inicializace OneSignal...");

      // 1. Fetch App ID from Supabase settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "onesignal_app_id")
        .single();

      if (settingsError || !settingsData?.value) {
        console.error("❌ Nelze načíst OneSignal App ID z nastavení:", settingsError);
        return;
      }

      const appId = settingsData.value;
      console.log("✅ OneSignal App ID načten:", appId);

      // 2. Wait for OneSignal SDK to load
      let attempts = 0;
      while (!window.OneSignalDeferred && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        attempts++;
      }

      if (!window.OneSignalDeferred) {
        console.error("❌ OneSignal SDK nedostupné po 20 pokusech");
        return;
      }

      // 3. Initialize OneSignal with dynamic App ID
      window.OneSignalDeferred.push(async function (OneSignal: any) {
        // Prevent duplicate initialization
        if (window.OneSignalInitialized) {
          console.log("⚠️ OneSignal již inicializován, přeskakuji...");
          return;
        }
        window.OneSignalInitialized = true;
        registrationAttempted.current = true;

        try {
          await OneSignal.init({
            appId: appId,
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            allowLocalhostAsSecureOrigin: true,
            notifyButton: {
              enable: false,
            },
          });

          console.log("✅ OneSignal SDK úspěšně inicializován");
          setIsInitialized(true);

          // Listen for subscription changes
          OneSignal.User.PushSubscription.addEventListener("change", async (event: any) => {
            if (event.current.id) {
              console.log("🔔 Změna subscription, nový player ID:", event.current.id);
              setPlayerId(event.current.id);
            }
          });
        } catch (error) {
          console.error("💥 Chyba při inicializaci OneSignal:", error);
          registrationAttempted.current = false;
        }
      });
    };

    initializeOneSignal();
  }, []);

  // USER REGISTRATION - Spustí se když se změní userId
  useEffect(() => {
    if (!userId || !isInitialized) {
      console.log("⏸️ Čekám na userId nebo inicializaci OneSignal...");
      return;
    }

    const registerUser = async () => {
      console.log("👤 Registruji uživatele:", userId);

      try {
        // Počkej na OneSignal
        if (!window.OneSignal) {
          console.error("❌ OneSignal není dostupné");
          return;
        }

        // Pokus o opt-in (zobrazí nativní prohlížečový prompt)
        try {
          await window.OneSignal.User.PushSubscription.optIn();
          console.log("✅ Push notifikace povoleny");
        } catch (error) {
          console.log("ℹ️ Uživatel odmítl notifikace nebo již byly povoleny");
        }

        // Počkej chvíli na vygenerování player_id
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Get player ID
        const currentPlayerId = window.OneSignal.User.PushSubscription.id;

        if (currentPlayerId) {
          console.log("✅ Player ID získán:", currentPlayerId);
          setPlayerId(currentPlayerId);

          // Save player_id to user_devices
          const { error } = await supabase.from("user_devices").upsert(
            {
              user_id: userId,
              player_id: currentPlayerId,
              device_type: "web",
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id,player_id",
            },
          );

          if (error) {
            console.error("❌ Chyba při ukládání player_id:", error);
          } else {
            console.log("✅ Player ID uložen do Supabase");
          }

          // Set external user ID
          await window.OneSignal.login(userId);
          console.log("✅ External User ID nastaven");
        } else {
          console.warn("⚠️ Player ID zatím není dostupný");
        }
      } catch (error) {
        console.error("💥 Chyba při registraci uživatele:", error);
      }
    };

    registerUser();
  }, [userId, isInitialized]);

  return { playerId, isInitialized, requestPermission };
};
