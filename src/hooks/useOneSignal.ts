import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

// ✅ Globální ochrana proti vícenásobné inicializaci
let oneSignalInitialized = false;

export function useOneSignal(userId?: string) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // 💾 Uložení nebo aktualizace zařízení v tabulce user_devices
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
        await supabase.from("user_devices").update({ updated_at: new Date().toISOString() }).eq("id", existing.id);
        console.log("🔁 Aktualizováno updated_at pro zařízení:", playerId);
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

  // 🧩 Hlavní efekt inicializace OneSignal
  useEffect(() => {
    let isSubscribed = true;

    const initializeOneSignal = async () => {
      try {
        console.log("🔧 Spuštěna funkce useOneSignal()");
        console.log("👤 userId:", userId || "nepřihlášen");
        console.log("🔔 Permission:", typeof Notification !== "undefined" ? Notification.permission : "unknown");

        // ✅ Načtení OneSignal App ID ze Supabase
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

        // 🧩 Počkej, dokud se nenačte SDK
        console.log("⏳ Čekám na načtení OneSignal SDK...");
        await new Promise<void>((resolve, reject) => {
          const maxWait = 10000;
          const checkInterval = 200;
          let waited = 0;

          const interval = setInterval(() => {
            if (typeof window !== "undefined" && window.OneSignal) {
              clearInterval(interval);
              console.log("✅ OneSignal SDK načteno");
              resolve();
            } else if (waited >= maxWait) {
              clearInterval(interval);
              console.error("❌ OneSignal SDK se nenačetlo do 10 sekund");
              reject(new Error("SDK initialization timeout"));
            }
            waited += checkInterval;
          }, checkInterval);
        });

        // ✅ Inicializace OneSignal jen jednou
        if (!oneSignalInitialized) {
          await window.OneSignal.init({
            appId,
            promptOptions: {
              slidedown: {
                enabled: true,
                autoPrompt: true,
                actionMessage: "Chcete dostávat upozornění o nových soutěžích, výhrách a bonusech?",
                acceptButtonText: "Ano, povolit",
                cancelButtonText: "Ne, děkuji",
              },
            },
          });
          oneSignalInitialized = true;
        } else {
          console.log("ℹ️ OneSignal již inicializován");
        }

        // 🧩 Počkej na načtení User API
        console.log("⏳ Čekám na inicializaci OneSignal User API...");
        await new Promise<void>((resolve, reject) => {
          const maxWait = 8000;
          const checkInterval = 200;
          let waited = 0;

          const interval = setInterval(() => {
            if (window.OneSignal && window.OneSignal.User && window.OneSignal.User.PushSubscription) {
              clearInterval(interval);
              console.log("✅ OneSignal User API připraveno");
              resolve();
            } else if (waited >= maxWait) {
              clearInterval(interval);
              console.error("❌ OneSignal User API se nenačetlo do 8 sekund");
              reject(new Error("User API not ready"));
            }
            waited += checkInterval;
          }, checkInterval);
        });

        setIsInitialized(true);
        console.log("✅ OneSignal inicializován a připraven");

        // 🔔 Zkontroluj oprávnění
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
          console.log("⏳ Čekám na vytvoření Player ID...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          currentPlayerId = window.OneSignal.User.PushSubscription.id;
        }

        if (currentPlayerId) {
          console.log("📱 Player ID získáno:", currentPlayerId);
          setPlayerId(currentPlayerId);
          if (userId) await saveDevice(userId, currentPlayerId);
        } else {
          console.warn("⚠️ Player ID stále není dostupné po inicializaci");
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
        toast({
          title: "❌ Chyba při inicializaci OneSignal",
          description: error instanceof Error ? error.message : "Neznámá chyba při načítání OneSignal SDK",
          variant: "destructive",
          duration: 4000,
        });
      }
    };

    initializeOneSignal();

    return () => {
      isSubscribed = false;
    };
  }, [userId]);

  return { playerId, isInitialized };
}
