// src/hooks/useOneSignal.ts nebo tam kde máš hook
import { useState, useEffect } from "react";

export function useOneSignal(): { playerId: string | null; isInitialized: boolean; permissionState: "granted" | "denied" | "default" | "unknown" } {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionState, setPermissionState] = useState<
    "granted" | "denied" | "default" | "unknown"
  >("unknown");

  useEffect(() => {
    let mounted = true;

    const mapPermission = (p: any): "granted" | "denied" | "default" | "unknown" => {
      if (typeof p === "string") {
        if (p === "granted") return "granted";
        if (p === "denied") return "denied";
        return "default"; // prompt / default
      }
      if (typeof p === "boolean") {
        return p ? "granted" : "default";
      }
      return "unknown";
    };

    const initOneSignal = async () => {
      try {
        // Nevoláme OneSignal.init() – čekáme pouze na dostupnost SDK
        const checkReady = setInterval(async () => {
          if (window.OneSignal) {
            clearInterval(checkReady);

            console.log("[useOneSignal] OneSignal SDK detekováno");

            const state = (window as any).__oneSignalInitState;
            if (state) {
              console.log("[useOneSignal] Init stav:", {
                povolen: state.allowed,
                blokován: state.blocked,
                celkem: state.allowed + state.blocked,
              });
            }

            if (!mounted) return;
            setIsInitialized(true);

            // Permission stav
            try {
              const p = await (window as any).OneSignal?.Notifications?.permission;
              const mapped = mapPermission(p ?? (typeof Notification !== "undefined" ? Notification.permission : undefined));
              if (mounted) setPermissionState(mapped);
            } catch {
              const mapped = mapPermission((typeof Notification !== "undefined" ? Notification.permission : undefined) as any);
              if (mounted) setPermissionState(mapped);
            }

            // Získáme player_id pokud existuje
            try {
              const currentPlayerId = await (window as any).OneSignal?.User?.PushSubscription?.id;
              if (currentPlayerId && mounted) {
                setPlayerId(currentPlayerId);
                console.log("[useOneSignal] Player ID:", currentPlayerId);
              }
            } catch (err) {
              console.warn("[useOneSignal] Player ID není dostupný:", err);
            }

            // Posloucháme změny subscription a re-mapujeme permission
            (window as any).OneSignal?.User?.PushSubscription?.addEventListener(
              "change",
              async (event: any) => {
                if (mounted && event?.current?.id) {
                  console.log("[useOneSignal] Player ID změněn:", event.current.id);
                  setPlayerId(event.current.id);
                }
                try {
                  const p2 = await (window as any).OneSignal?.Notifications?.permission;
                  if (mounted) setPermissionState(mapPermission(p2));
                } catch {}
              }
            );
          }
        }, 100);

        // Timeout po 10 sekundách
        setTimeout(() => {
          clearInterval(checkReady);
          if (mounted && !isInitialized) {
            console.error("[useOneSignal] OneSignal SDK se nenačetlo do 10s");
          }
        }, 10000);
      } catch (error) {
        console.error("[useOneSignal] Chyba:", error);
      }
    };

    initOneSignal();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    playerId,
    isInitialized,
    permissionState,
  };
}

// TypeScript definice
declare global {
  interface Window {
    OneSignal: any;
    __oneSignalInitState?: {
      called: boolean;
      blocked: number;
      allowed: number;
    };
    __OneSignalInitOnce?: (config: { appId: string }) => Promise<void>;
  }
}
