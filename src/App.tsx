import { useEffect } from "react";
import OneSignal from "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const useOneSignal = () => {
  useEffect(() => {
    const init = async () => {
      try {
        console.log("🟡 Inicializace OneSignal SDK...");
        await OneSignal.init({
          appId: "5e5539e1-fc71-4c4d-9fef-414293d83dbb",
          allowLocalhostAsSecureOrigin: true,
        });

        await OneSignal.Notifications.requestPermission();
        const playerId = OneSignal?.User?.PushSubscription?.id;
        console.log("✅ OneSignal player ID:", playerId);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && playerId) {
          const { error } = await supabase
            .from("profiles")
            .update({ onesignal_player_id: playerId })
            .eq("email", user.email);

          if (error) {
            console.error("❌ Chyba při ukládání player ID:", error);
          } else {
            console.log("✅ Player ID uložen do Supabase.");
          }
        } else {
          console.warn("⚠️ Uživatel není přihlášen nebo player_id chybí.");
        }
      } catch (e) {
        console.error("❌ Chyba inicializace OneSignal:", e);
      }
    };

    init();
  }, []);
};
