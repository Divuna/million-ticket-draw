// ✅ useOneSignal.ts – Lovable auto-init kompatibilní verze (OneMil)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOneSignal() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");

  // Načtení userId a emailu ze Supabase
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

    const attachListeners = async () => {
      // Počkej na načtení window.OneSignal
      await new Promise((resolve) => {
        const check = () => {
          if (window.OneSignal && window.OneSignal.User) resolve(true);
          else setTimeout(check, 200);
        };
        check();
      });

      // Získáme user
      const { userId, email } = await loadUser();
      if (!userId) {
        console.warn("⚠️ [ONESIGNAL] Uživatelský účet nenalezen");
        return;
      }

      const OneSignal: any = window.OneSignal;

      // Permission
      try {
        const perm = await OneSignal.Notifications.permissionState();
        setPermissionState(perm);
        console.log("🔐 OneSignal permission:", perm);
      } catch (e) {
        console.warn("⚠️ Nelze načíst stav oprávnění:", e);
      }

      // Listener na PlayerID změnu
      OneSignal.User.PushSubscription.addEventListener("change", async () => {
        console.log("🔄 OneSignal subscription změna…");

        const newPlayerId = OneSignal.User.PushSubscription.id ?? OneSignal.User.pushSubscription.id;

        if (!newPlayerId) {
          console.log("⚠️ Player ID zatím není dostupný");
          return;
        }

        console.log("🎯 OneSignal player ID:", newPlayerId);
        setPlayerId(newPlayerId);

        // Desktop / Mobile detect
        const isMobile = window.innerWidth < 768;
        const deviceType = isMobile ? "mobile" : "desktop";

        // SYNC → Sofinity
        await syncPlayerToSofinity(userId, email, newPlayerId, deviceType);
      });

      // Pokud už existuje player_id → syncni ho
      const existingId = OneSignal.User.PushSubscription.id ?? OneSignal.User.pushSubscription.id;

      if (existingId) {
        console.log("🎯 OneSignal existing player ID:", existingId);
        setPlayerId(existingId);

        const isMobile = window.innerWidth < 768;
        const deviceType = isMobile ? "mobile" : "desktop";

        await syncPlayerToSofinity(userId, email, existingId, deviceType);
      }
    };

    attachListeners();

    return () => {
      active = false;
    };
  }, []);

  return { playerId, permissionState };
}
