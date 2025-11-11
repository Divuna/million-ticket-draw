import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

// 🧩 Ochrana proti dvojité inicializaci
let oneSignalInitialized = false;

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

    const initOneSignal = async () => {
      try {
        console.log("🚀 useOneSignal spuštěn");
        console.log("👤 userId:", userId || "nepřihlášen");

        // ⏳ Počkej na načtení SDK
        await new Promise<void>((resolve, reject) => {
          const start = Date.now();
          const timer = setInterval(() => {
            if (window.OneSignal && window.OneSignal.User) {
              clearInterval(timer);
              resolve();
            }
            if (Date.now() - start > 10000) {
              clearInterval(timer);
              reject("❌ OneSignal SDK se nenačetlo do 10 s");
            }
          }, 200);
        });

        console.log("✅ OneSignal SDK načteno");

        // 🔑 Načti App ID ze Supabase
        const { data, error } = await supabase.from("settings").select("value").eq("key", "onesignal_app_id").single();
        if (error || !data?.value) throw new Error("App ID nenalezeno");

        const appId = data.value;
        console.log("🔑 OneSignal App ID:", appId);

        // ✅ Inicializace jen jednou
        if (!oneSignalInitialized) {
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
        } else {
          console.log("ℹ️ OneSignal už byl inicializován");
        }

        // 🧩 Počkej na OneSignal User API
        await new Promise<void>((resolve, reject) => {
          const start = Date.now();
          const timer = setInterval(() => {
            if (window.OneSignal?.User?.PushSubscription && window.OneSignal.User.PushSubscription.id !== undefined) {
              clearInterval(timer);
              resolve();
            }
            if (Date.now() - start > 8000) {
              clearInterval(timer);
              reject("❌ OneSignal User API se nenačetlo do 8 s");
            }
          }, 200);
        });

        setIsInitialized(true);
        console.log("✅ OneSignal User API připraveno");

        // 🔔 Požádej o oprávnění, pokud je „default“
        if (Notification.permission === "default") {
          console.log("❓ Žádám uživatele o povolení notifikací…");
          await window.OneSignal.User.PushSubscription.optIn();
        } else if (Notification.permission === "denied") {
          console.warn("⚠️ Oprávnění odepřeno – nelze registrovat player ID");
          toast({
            title: "⚠️ Oprávnění odmítnuto",
            description: "Povolte notifikace v nastavení prohlížeče.",
            variant: "destructive",
            duration: 4000,
          });
          return;
        }

        // 📱 Získej Player ID (s retry)
        let pid = window.OneSignal.User.PushSubscription.id;
        if (!pid) {
          console.log("⏳ Čekám na Player ID…");
          await new Promise((r) => setTimeout(r, 1000));
          pid = window.OneSignal.User.PushSubscription.id;
        }

        if (pid) {
          console.log("📱 Player ID získáno:", pid);
          setPlayerId(pid);
          if (userId) await saveDevice(userId, pid);
        } else {
          console.warn("⚠️ Player ID není dostupné ani po čekání");
          toast({
            title: "⚠️ Player ID není dostupné",
            description: "Zkuste znovu po povolení notifikací.",
            variant: "destructive",
          });
        }

        // 🌀 Sleduj změny subscription
        window.OneSignal.User.PushSubscription.addEventListener("change", async (sub: any) => {
          if (!active) return;
          const newId = sub?.current?.id;
          console.log("🔄 Subscription změna →", newId);
          if (newId && userId) {
            await saveDevice(userId, newId);
            setPlayerId(newId);
          }
        });
      } catch (err) {
        console.error("💥 Chyba OneSignal:", err);
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
