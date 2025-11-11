import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/components/ui/use-toast";

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
  }
}

// ✅ Zajišťuje, že se OneSignal inicializuje jen jednou
let oneSignalInitialized = false;

export function useOneSignal(userId?: string) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const saveDevice = async (userId: string, playerId: string) => {
    try {
      const { data: existing, error: selectError } = await supabase
        .from("user_devices")
        .select("*")
        .eq("user_id", userId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (selectError) console.error("❌ Chyba při SELECT:", selectError);

      if (existing) {
        await supabase.from("user_devices").update({ last_active: new Date().toISOString() }).eq("id", existing.id);
        console.log("🔁 Aktualizováno last_active pro zařízení:", playerId);
      } else {
        await supabase.from("user_devices").insert({
          user_id: userId,
          player_id: playerId,
          created_at: new Date().toISOString(),
        });
        console.log("✅ Nové zařízení uloženo:", playerId);
      }
    } catch (error) {
      console.error("❌ Chyba při ukládání zařízení:", error);
    }
  };

  // 🧩 Hlavní inicializační efekt
  useEffect(() => {
    let isSubscribed = true;

    const initializeOneSignal = async () => {
      try {
        console.log("🔧 useOneSignal spuštěn");
        console.log("👤 userId:", userId || "nepřihlášen");
        console.log("🔔 Permission:", typeof Notification !== "undefined" ? Notification.permission : "unknown");

        // ✅ Načtení App ID ze Supabase
        const { data: settingsData, error: settingsError } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "onesignal_app_id")
          .single();

        if (settingsError || !settingsData?.value) {
          console.error("❌ Nelze načíst OneSignal App ID z tabulky settings:", settingsError);
          return;
        }

        const appId = settingsData.value;
        console.log("🔑 OneSignal App ID:", appId);

        // 🧩 Nová část – počkej na načtení SDK
        console.log("⏳ Čekám na načtení OneSignal SDK...");
        await new Promise<void>((resolve, reject) => {
          const maxWait = 10000;
          const checkInterval = 200;
          let waited = 0;

          const interval = setInterval(() => {
            if (typeof window !== "undefined" && window.OneSignal && window.OneSignal.User) {
              clearInterval(interval);
              console.log("✅ OneSignal SDK načteno a připraveno");
              resolve();
            } else if (waited >= maxWait) {
              clearInterval(interval);
              console.error("❌ OneSignal SDK se nenačetlo do 10 sekund");
              reject(new Error("SDK initialization timeout"));
            }
            waited += checkInterval;
          }, checkInterval);
        });

        if (oneSignalInitialized) {
          console.log("ℹ️ OneSignal již inicializován, přeskočeno");
        } else {
          await window.OneSignal.init({
            appId,
            safari_web_id: undefined,
          });
          oneSignalInitialized = true;
        }

        setIsInitialized(true);
        console.log("✅ OneSignal inicializován");

        // 🔔 Požádej o oprávnění pokud chybí
        if (Notification.permission === "default") {
          console.log("❓ Žádám o oprávnění...");
          await window.OneSignal.User.PushSubscription.optIn();
        } else if (Notification.permission === "denied") {
          console.warn("⚠️ Oprávnění odepřeno – nelze registrovat player_id");
          toast({
            title: "⚠️ Oprávnění odmítnuto",
            description: "Povolte notifikace v nastavení prohlížeče",
            variant: "destructive",
            duration: 4000,
          });
          return;
        }

        // 📱 Získání Player ID
        let currentPlayerId = window.OneSignal.User.PushSubscription.id;
        if (!currentPlayerId) {
          console.log("⏳ Čekám na vytvoření player_id...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          currentPlayerId = window.OneSignal.User.PushSubscription.id;
        }

        if (currentPlayerId) {
          console.log("📱 Player ID získáno:", currentPlayerId);
          setPlayerId(currentPlayerId);

          if (userId) await saveDevice(userId, currentPlayerId);
        } else {
          console.warn("⚠️ Player ID stále není dostupné");
        }

        // 🌀 Sleduj změny v subscription
        window.OneSignal.User.PushSubscription.addEventListener("change", async (sub: any) => {
          if (!isSubscribed) return;
          const newId = sub?.current?.id;
          console.log("🔄 Změna OneSignal subscription →", newId);

          if (newId && userId) {
            await saveDevice(userId, newId);
            setPlayerId(newId);
          }
        });
      } catch (error) {
        console.error("❌ Chyba při inicializaci OneSignal:", error);
      }
    };

    initializeOneSignal();

    return () => {
      isSubscribed = false;
    };
  }, [userId]);

  return { playerId, isInitialized };
}
