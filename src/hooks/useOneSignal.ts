// ✅ useOneSignal.ts – finální verze pro OneMil
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOneSignal(userId?: string) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");

  // 🧩 Načti userId, pokud nebyl předán
  const loadUserId = async () => {
    if (!userId) {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          console.log("👤 Automaticky nalezený userId:", data.user.id);
          userId = data.user.id;
        }
      } catch (err) {
        console.warn("⚠️ Nepodařilo se načíst userId:", err);
      }
    }
  };

  // 💾 Ulož Player ID do Supabase
  const savePlayerId = async (pid: string) => {
    try {
      await loadUserId();
      if (!userId || !pid) return;
      const { error } = await supabase.from("user_devices").upsert(
        {
          user_id: userId,
          player_id: pid,
          device_type: "web",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "player_id" },
      );
      if (error) console.error("❌ Chyba při ukládání Player ID:", error);
      else console.log("✅ Player ID uložen do Supabase:", pid);
    } catch (err) {
      console.error("❌ savePlayerId selhal:", err);
    }
  };

  useEffect(() => {
    let active = true;

    const initOneSignal = async () => {
      try {
        if (!window.OneSignal) {
          console.warn("⚠️ OneSignal SDK není dostupné.");
          return;
        }

        // 🚫 Nepoužíváme žádný init – SDK se načítá z HTML
        console.log("⚙️ OneSignal SDK načteno z HTML – přeskočuji init()");

        await loadUserId();
        setIsInitialized(true);

        // 🔎 Získej oprávnění
        const perm = await window.OneSignal.Notifications.permission;
        setPermissionState(perm);
        console.log("🔎 Permission:", perm);

        // 📲 Získej subscription a Player ID
        const pushSub = window.OneSignal.User.PushSubscription;
        const pid = pushSub?.id;
        const optedIn = pushSub?.optedIn ?? false;
        console.log("🔄 PushSubscription:", { pid, optedIn });

        if (pid) {
          setPlayerId(pid);
          await savePlayerId(pid);
        }

        // 🧠 Pokud není optedIn a permission povolené → optIn
        if (!optedIn && perm !== "denied") {
          console.log("📲 Volám optIn()");
          await pushSub.optIn();
          await new Promise((r) => setTimeout(r, 1000));
          const newPerm = await window.OneSignal.Notifications.permission;
          setPermissionState(newPerm);
        }

        // 🎧 Listener změny subscription
        pushSub.addEventListener("change", async (sub: any) => {
          if (!active) return;
          const newId = sub?.current?.id;
          if (newId) {
            setPlayerId(newId);
            await savePlayerId(newId);
          }
          const newPerm = await window.OneSignal.Notifications.permission;
          setPermissionState(newPerm);
        });
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
