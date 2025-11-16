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
      if (typeof p === "boolean") return p ? "granted" : "default";
      return "unknown";
    };

    const waitForSDK = setInterval(async () => {
      const OS = (window as any).OneSignal;

      // SDK stále není načtené → čekáme dál
      if (!OS || !OS.User || !OS.User.PushSubscription) return;

      clearInterval(waitForSDK);
      if (!mounted) return;

      console.log("[useOneSignal] OneSignal SDK detected");

      const guardState = (window as any).__oneSignalInitState;
      console.log("[useOneSignal] Guard state:", guardState);

      setIsInitialized(true);

      // -------------------------
      // PERMISSION
      // -------------------------
      try {
        const p =
          (await OS.Notifications?.permission) ??
          (typeof Notification !== "undefined" ? Notification.permission : undefined);
        setPermissionState(mapPermission(p));
      } catch {
        const fallback = typeof Notification !== "undefined" ? Notification.permission : "unknown";
        setPermissionState(mapPermission(fallback));
      }

      // -------------------------
      // PLAYER ID
      // -------------------------
      try {
        const currentPlayerId = await OS?.User?.PushSubscription?.id;
        if (currentPlayerId) {
          setPlayerId(currentPlayerId);
          console.log("[useOneSignal] Player ID:", currentPlayerId);
        }
      } catch (e) {
        console.warn("[useOneSignal] Player ID unavailable:", e);
      }

      // -------------------------
      // LISTENER — plně safe
      // -------------------------
      if (OS?.User?.PushSubscription?.addEventListener) {
        OS.User.PushSubscription.addEventListener("change", async (event: any) => {
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
      } else {
        console.warn("[useOneSignal] addEventListener not available yet");
      }
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
