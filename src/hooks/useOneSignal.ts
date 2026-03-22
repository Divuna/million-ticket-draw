// src/hooks/useOneSignal.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOneSignal() {
  const { user } = useAuth();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");

  const initDoneRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const ONESIGNAL_APP_ID = "357be038-dbaf-4551-9a16-96d9897197a3";

  const savePlayerIdToDb = async (playerId: string) => {
    const trimmed = typeof playerId === "string" ? playerId.trim() : "";
    if (!trimmed) return;

    // Fresh session so JWT is attached to the request (RLS: auth.uid() = user_id)
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.user?.id) {
      console.error("[useOneSignal] Cannot save user_devices — not authenticated:", sessionError?.message ?? "no session");
      return;
    }

    console.log("SAVING TO DB:", trimmed);

    const { error } = await supabase.from("user_devices").upsert(
      {
        user_id: session.user.id,
        player_id: trimmed,
        device_type: "web",
      },
      {
        onConflict: "user_id,player_id",
      },
    );

    if (error) {
      console.error("[useOneSignal] user_devices upsert failed:", error.message, error);
      return;
    }

    console.log("[useOneSignal] Stored in DB (user_devices):", { user_id: session.user.id, player_id: trimmed });
  };

  const clearOneSignalBrowserState = async () => {
    try {
      // Unregister OneSignal SWs
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs
            .filter((r) => /onesignal|OneSignalSDK/i.test(r.active?.scriptURL || ""))
            .map((r) => r.unregister())
        );
      }
    } catch {}

    try {
      // Clear OneSignal caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.toLowerCase().includes("onesignal") || k.toLowerCase().includes("os_"))
          .map((k) => caches.delete(k))
      );
    } catch {}

    try {
      // Clear OneSignal localStorage keys
      Object.keys(localStorage).forEach((k) => {
        if (k.toLowerCase().includes("onesignal") || k.toLowerCase().startsWith("os_")) {
          localStorage.removeItem(k);
        }
      });
      // Clear OneSignal sessionStorage keys (if SDK stored any)
      Object.keys(sessionStorage).forEach((k) => {
        if (k.toLowerCase().includes("onesignal") || k.toLowerCase().startsWith("os_")) {
          sessionStorage.removeItem(k);
        }
      });
      indexedDB?.deleteDatabase("OneSignalSDKStore");
      indexedDB?.deleteDatabase("OneSignalIndexedDB");
    } catch {}
  };

  useEffect(() => {
    if (!user?.id) return;

    // Ensure init runs for the current user session
    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id;
      initDoneRef.current = false;
    }

    if (initDoneRef.current) return;
    initDoneRef.current = true;

    let cancelled = false;

    (async () => {
      // Required deferred init flow (no blocking wrapper)
      (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
      (window as any).OneSignalDeferred.push(async function (OneSignal: any) {
        if (cancelled) return;

        try {
          setIsInitialized(true);

          // Clear stale OneSignal state before init to avoid appId mismatch.
          await clearOneSignalBrowserState();

          const appId = ONESIGNAL_APP_ID;
          console.log("ONESIGNAL APP ID USED:", appId);

          // Ensure we only init once per browser/session for this exact app id.
          const alreadyInitedAppId = (window as any).__ONESIGNAL_LAST_INIT_APP_ID__ as string | null;
          if ((window as any).__ONESIGNAL_INITED__ && alreadyInitedAppId === appId) {
            // Skip re-init (still proceed to permission & player id read).
          } else {
            try {
              await OneSignal.init({
                appId: ONESIGNAL_APP_ID,
                // Needed for local dev on http://localhost (treat localhost as a secure origin).
                allowLocalhostAsSecureOrigin: true,
                // Ensure the worker is loaded from the app root (served from /public in Vite).
                serviceWorkerPath: "/OneSignalSDKWorker.js",
              });
            } catch (e: any) {
              const msg = String(e?.message || e);
              // If the browser has stale OneSignal state (wrong previous app), clear and retry once.
              const lower = msg.toLowerCase();
              if (lower.includes("appid") && lower.includes("existing apps")) {
                await clearOneSignalBrowserState();
                await OneSignal.init({
                  appId: ONESIGNAL_APP_ID,
                  allowLocalhostAsSecureOrigin: true,
                  serviceWorkerPath: "/OneSignalSDKWorker.js",
                });
              } else {
                throw e;
              }
            }
            (window as any).__ONESIGNAL_INITED__ = true;
            (window as any).__ONESIGNAL_LAST_INIT_APP_ID__ = appId;
          }

          // Always attempt save once — do not rely only on subscription events (id may appear late)
          setTimeout(async () => {
            if (cancelled) return;
            const playerId = (window as any).OneSignal?.User?.PushSubscription?.id;

            console.log("FORCED PLAYER ID:", playerId);

            if (typeof playerId === "string" && playerId) {
              if (!cancelled) setPlayerId(playerId);
              await savePlayerIdToDb(playerId);
            }
          }, 2000);

          const permission = await OneSignal.Notifications.requestPermission();
          console.log("[useOneSignal] OneSignal permission:", permission);

          const fetchAndSavePlayerId = async () => {
            let pid: string | null = null;
            if (typeof OneSignal.getUserId === "function") {
              pid = await OneSignal.getUserId();
            }
            if (!pid) {
              pid = OneSignal.User?.PushSubscription?.id ?? null;
            }
            if (typeof pid === "string" && pid) {
              console.log("PLAYER ID:", pid);
              if (!cancelled) setPlayerId(pid);
              await savePlayerIdToDb(pid);
              return pid;
            }
            return null;
          };

          if (permission === "granted") {
            let pid = await fetchAndSavePlayerId();
            if (!pid) {
              for (const delayMs of [500, 1500, 3000]) {
                if (cancelled) break;
                await new Promise((r) => setTimeout(r, delayMs));
                pid = await fetchAndSavePlayerId();
                if (pid) break;
              }
            }
            setPermissionState("granted");
          } else if (permission === "denied") {
            setPermissionState("denied");
          } else {
            setPermissionState("default");
          }

          // subscriptionChange: when user subscribes, get player_id and save (if API exists)
          if (typeof OneSignal.on === "function") {
            OneSignal.on("subscriptionChange", async (isSubscribed: boolean) => {
              if (isSubscribed && !cancelled) {
                await fetchAndSavePlayerId();
              }
            });
          }
          // PushSubscription change (v16): when subscription id becomes available
          OneSignal.User?.PushSubscription?.addEventListener?.("change", async (event: any) => {
            const nextPid = event?.current?.id;
            if (typeof nextPid === "string" && nextPid && !cancelled) {
              console.log("PLAYER ID:", nextPid);
              setPlayerId(nextPid);
              await savePlayerIdToDb(nextPid);
            }
          });
        } catch (e) {
          console.error("[useOneSignal] OneSignal init/permission flow failed:", e);
          setPermissionState("unknown");
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { playerId, isInitialized, permissionState };
}

declare global {
  interface Window {
    OneSignal: any;
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
  }
}
