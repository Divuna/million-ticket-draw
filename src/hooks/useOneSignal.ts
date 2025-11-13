// src/hooks/useOneSignal.ts
import { useState, useEffect } from "react";

export function useOneSignal() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");

  useEffect(() => {
    let mounted = true;

    const mapPermission = (p: any): "granted" | "denied" | "default" | "unknown" => {
      if (typeof p === "string") {
        if (p === "granted") return "granted";
        if (p === "denied") return "denied";
        return "default";
      }
      if (typeof p === "boolean") {
        return p ? "granted" : "default";
      }
      return "unknown";
    };

    const waitForSDK = setInterval(async () => {
      const OS = (window as any).OneSignal;
      if (!OS) return;

      clearInterval(waitForSDK);
      if (!mounted) return;

      console.log("[useOneSignal] OneSignal SDK detected");

      // Stav guardu
      const guardState = (window as any).__oneSignalInitState;
      console.log("[useOneSignal] Guard state:", guardState);

      // Označíme inicializaci jako OK (SDK ready)
      setIsInitialized(true);

      // Permission
      try {
        const p =
          (await OS.Notifications?.permission) ??
          (typeof Notification !== "undefined" ? Notification.permission : undefined);
        setPermissionState(mapPermission(p));
      } catch {
        const fallback = typeof Notification !== "undefined" ? Notification.permission : "unknown";
        setPermissionState(mapPermission(fallback));
      }

      // Player ID
      try {
        const currentPlayerId = await OS?.User?.PushSubscription?.id;
        if (currentPlayerId) {
          setPlayerId(currentPlayerId);
          console.log("[useOneSignal] Player ID:", currentPlayerId);
        }
      } catch (e) {
        console.warn("[useOneSignal] Player ID unavailable:", e);
      }

      // Listener
      OS?.User?.PushSubscription?.addEventListener("change", async (event: any) => {
        if (!mounted) return;

        if (event?.current?.id) {
          console.log("[useOneSignal] Player ID updated:", event.current.id);
          setPlayerId(event.current.id);
        }

        try {
          const p2 = await OS.Notifications?.permission;
          setPermissionState(mapPermission(p2));
        } catch {}
      });
    }, 120);

    return () => {
      mounted = false;
      clearInterval(waitForSDK);
    };
  }, []);

  return {
    playerId,
    isInitialized,
    permissionState,
  };
}

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
