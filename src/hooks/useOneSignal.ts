import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

// 🧩 Ochrana proti dvojité inicializaci
let oneSignalInitialized = false;
let deniedToastShown = false;

export function useOneSignal(userId?: string) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // 💾 Ulož nebo aktualizuj zařízení v user_devices
  const saveDevice = async (userId: string, playerId: string) => {
    try {
      const { data: existing, error } = await supabase
        .from("user_devices")
        .select("id")
        .eq("user_id", userId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) console.error("❌ SELECT user_devices:", error);

      if (existing?.id) {
        await supabase.from("user_devices").update({ updated_at: new Date().toISOString() }).eq("id", existing.id);
        console.log("🔁 Aktualizováno:", playerId);
      } else {
        await supabase.from("user_devices").insert({
          user_id: userId,
          player_id: playerId,
          created_at: new Date().toISOString(),
        });
        console.log("✅ Nové zařízení:", playerId);
      }
    } catch (e) {
      console.error("💥 Chyba při ukládání zařízení:", e);
    }
  };

  useEffect(() => {
    let active = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const waitForOneSignal = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (window.OneSignal && window.OneSignal.User) {
            clearInterval(timer);
            console.log("✅ OneSignal SDK načteno");
            resolve();
          }
          if (Date.now() - start > 5000) {
            clearInterval(timer);
            reject(new Error("OneSignal SDK se nenačetlo do 5 s"));
          }
        }, 100);
      });
    };

    const waitForUserAPI = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (window.OneSignal?.User?.PushSubscription) {
            clearInterval(timer);
            console.log("✅ OneSignal User API připraveno");
            resolve();
          }
          if (Date.now() - start > 5000) {
            clearInterval(timer);
            reject(new Error("OneSignal User API se nenačetlo do 5 s"));
          }
        }, 100);
      });
    };

    const fetchAndStorePlayerId = async (): Promise<string | null> => {
      let attempts = 0;
      while (attempts < 5) {
        const pid = window.OneSignal?.User?.PushSubscription?.id;
        if (pid) {
          console.log("📱 Player ID získáno:", pid);
          setPlayerId(pid);
          if (userId) {
            await saveDevice(userId, pid);
            console.log("💾 Player ID uloženo do Supabase");
          }
          return pid;
        }
        console.log(`⏳ Čekám na Player ID (pokus ${attempts + 1}/5)...`);
        await new Promise((r) => setTimeout(r, 1000));
        attempts++;
      }
      console.warn("⚠️ Player ID není dostupné ani po 5 pokusech");
      return null;
    };

    const initOneSignal = async () => {
      try {
        console.log("🚀 useOneSignal spuštěn");
        console.log("👤 userId:", userId || "nepřihlášen");

        // ⏳ Počkej na načtení SDK
        await waitForOneSignal();
        console.log("✅ OneSignal SDK načteno");
        
        // 🔍 Diagnostika podpory a stavu inicializace
        const supportsPush = window.OneSignal?.Notifications?.isPushSupported?.() ?? false;
        const alreadyInit = window.OneSignal?.initialized === true;
        console.log("🔎 OneSignal.initialized:", alreadyInit);
        console.log("🔎 Podpora push:", supportsPush);

        // 🔑 Načti App ID ze Supabase (podle domény)
        const isDevelopment = window.location.hostname.includes("lovableproject.com");
        const settingKey = isDevelopment ? "onesignal_app_id_dev" : "onesignal_app_id";
        
        console.log(`🌍 Doména: ${window.location.hostname} → ${isDevelopment ? "DEV" : "PROD"}`);
        console.log(`🔑 Načítám: ${settingKey}`);

        const { data, error } = await supabase.from("settings").select("value").eq("key", settingKey).single();
        if (error || !data?.value) throw new Error(`App ID (${settingKey}) nenalezeno v settings`);

        const appId = data.value;
        console.log("✅ OneSignal App ID:", appId);

        // ✅ Inicializace jen jednou pomocí module-level flagu
        if (!oneSignalInitialized) {
          console.log("🔧 Spouštím OneSignal.init()...");
          try {
            await window.OneSignal.init({
              appId,
              allowLocalhostAsSecureOrigin: true,
              promptOptions: {
                slidedown: {
                  enabled: true,
                  autoPrompt: true,
                  actionMessage: "Chcete dostávat upozornění o nových soutěžích a výhrách?",
                  acceptButtonText: "Ano, chci",
                  cancelButtonText: "Ne, děkuji",
                },
              },
            });
            oneSignalInitialized = true;
            console.log("✅ OneSignal inicializován");
          } catch (err: any) {
            if (err?.message?.includes("already initialized")) {
              console.log("ℹ️ OneSignal už byl inicializován (tolerováno)");
              oneSignalInitialized = true;
            } else {
              throw err; // Re-throw jiné chyby
            }
          }
        } else {
          console.log("ℹ️ OneSignal už byl inicializován (SKIP init)");
        }

        // 🧩 Počkej na OneSignal User API
        await waitForUserAPI();
        setIsInitialized(true);
        console.log("🔎 Notification.permission:", Notification.permission);

        // 🔍 Kontrola opt-in stavu
        const pushSub = window.OneSignal.User.PushSubscription;
        const isOptedIn = pushSub?.optedIn ?? false;
        console.log("🔎 PushSubscription.optedIn:", isOptedIn);

        // 🔔 Pokud není opted in, zavolej optIn()
        if (!isOptedIn && Notification.permission !== "denied") {
          console.log("📲 Volám PushSubscription.optIn()...");
          await pushSub.optIn();
          console.log("✅ optIn() úspěšný");
          
          // Počkej chvíli na propagaci Player ID
          await new Promise(r => setTimeout(r, 1000));
        }

        // 🌀 Nastavit event listener VŽDY (i když je denied)
        pushSub.addEventListener("change", async (sub: any) => {
          if (!active) return;
          const newId = sub?.current?.id;
          const optedIn = sub?.current?.optedIn;
          console.log("🔄 Subscription změna → id:", newId, "optedIn:", optedIn);
          if (newId) {
            setPlayerId(newId);
            if (userId) {
              await saveDevice(userId, newId);
              console.log("💾 Player ID aktualizováno v Supabase");
            }
          }
        });

        // 📱 Získej Player ID
        if (Notification.permission === "denied") {
          console.warn("⚠️ Oprávnění odepřeno – nelze registrovat player ID");
          if (!deniedToastShown) {
            toast({
              title: "⚠️ Oprávnění odmítnuto",
              description: "Povolte notifikace v nastavení prohlížeče.",
              variant: "destructive",
              duration: 4000,
            });
            deniedToastShown = true;
          }
        } else {
          // Získej a ulož Player ID
          const pid = await fetchAndStorePlayerId();
          if (pid) {
            console.log("✅ Player ID úspěšně získáno a uloženo");
          } else {
            console.warn("⚠️ Player ID není k dispozici");
            toast({
              title: "⚠️ Player ID není dostupné",
              description: "Zkuste znovu po povolení notifikací.",
              variant: "destructive",
            });
          }
        }
      } catch (err) {
        console.error("💥 Chyba OneSignal:", err);
        
        // 🔄 Retry logic
        if (retryCount < MAX_RETRIES && active) {
          retryCount++;
          console.log(`🔄 Zkouším znovu (pokus ${retryCount}/${MAX_RETRIES})...`);
          await new Promise((r) => setTimeout(r, 2000));
          if (active) initOneSignal();
          return;
        }

        toast({
          title: "❌ Chyba při inicializaci OneSignal",
          description: String(err),
          variant: "destructive",
          duration: 4000,
        });
      }
    };

    initOneSignal();
    return () => {
      active = false;
    };
  }, [userId]);

  return { playerId, isInitialized };
}
