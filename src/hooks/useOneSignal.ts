// ✅ useOneSignal.ts – Finální verze pro OneMil + Sofinity sync
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOneSignal() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");

  // Načtení userId a emailu ze Supabase auth
  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return { userId: null, email: null };

    return {
      userId: data.user.id,
      email: data.user.email ?? null,
    };
  };

  // Sync player_id → Sofinity
  const syncPlayerToSofinity = async (
    userId: string,
    email: string | null,
    playerId: string,
    deviceType: "mobile" | "desktop",
  ) => {
    try {
      await fetch("https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/sync-player-to-sofinity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          email,
          onesignal_player_id: playerId,
          device_type: deviceType,
          source_system: "onemil",
        }),
      });

      console.log("✅ [SYNC] Player ID odeslán do Sofinity:", {
        userId,
        email,
        playerId,
        deviceType,
      });
    } catch (err) {
      console.error("❌ [SYNC] Nepovedlo se odeslat player_id do Sofinity:", err);
    }
  };

  useEffect(() => {
    let active = true;

    const initOneSignal = async () => {
      try {
        // Load user data
        const { userId, email } = await loadUser();
        if (!userId) {
          console.warn("⚠️ [ONESIGNAL] Žádný userId – uživatel není přihlášen");
          return;
        }

        // @ts-ignore
        const OneSignal = window.OneSignal;
        if (!OneSignal) {
          console.error("❌ OneSignal SDK není načten");
          return;
        }

        console.log("🚀 Inicializace OneSignal…", { userId });

        OneSignal.init({
          appId: "l4nzh7w4ne4o5zpfvp2i7tpeh", // TVŮJ OneMil APP ID
          safari_web_id: "",
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },
        });

        OneSignal.Notifications.requestPermission().then((perm: string) => {
          setPermissionState(perm as any);
          console.log("🔐 Permission:", perm);
        });

        // Listener na změnu stavu subscription (získání player_id)
        OneSignal.User.PushSubscription.addEventListener("change", async () => {
          console.log("🔄 OneSignal PushSubscription CHANGE event");

          const newPlayerId = OneSignal.User.PushSubscription.id ?? OneSignal.User.pushSubscription.id;

          if (!newPlayerId) {
            console.log("⚠️ Player ID zatím není dostupný");
            return;
          }

          console.log("🎯 OneSignal player ID:", newPlayerId);
          setPlayerId(newPlayerId);

          // Určení typu zařízení
          const isMobile = window.innerWidth < 768;
          const deviceType = isMobile ? "mobile" : "desktop";

          // SYNC → Sofinity
          await syncPlayerToSofinity(userId, email, newPlayerId, deviceType);
        });

        setIsInitialized(true);
        console.log("✅ OneSignal inicializován");
      } catch (err) {
        console.error("❌ Chyba při inicializaci OneSignal:", err);
      }
    };

    initOneSignal();

    return () => {
      active = false;
    };
  }, []);

  return { playerId, isInitialized, permissionState };
}
