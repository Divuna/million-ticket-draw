// src/hooks/useOneSignal.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ONESIGNAL_APP_ID = "357be038-dbaf-4551-9a16-96d9897197a3";

/**
 * Saves the OneSignal player ID to the user_devices table.
 * Requires an active authenticated session.
 */
async function savePlayerIdToDb(playerId: string) {
  const trimmed = typeof playerId === "string" ? playerId.trim() : "";
  if (!trimmed) return;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.user?.id) {
    console.error("[useOneSignal] Cannot save user_devices — not authenticated:", sessionError?.message ?? "no session");
    return;
  }

  const { error } = await supabase.from("user_devices").upsert(
    {
      user_id: session.user.id,
      player_id: trimmed,
      device_type: "web",
    },
    { onConflict: "user_id,player_id" },
  );

  if (error) {
    console.error("[useOneSignal] user_devices upsert failed:", error.message);
    return;
  }

  console.log("[useOneSignal] Stored in DB (user_devices):", { user_id: session.user.id, player_id: trimmed });
}

/**
 * Hook that lazily connects to OneSignal when a user is logged in.
 *
 * IMPORTANT: This hook no longer auto-requests notification permission or
 * clears browser state on mount. Those actions are intentionally deferred
 * to explicit user interaction (e.g. via OneSignalDebug panel or a
 * "Enable notifications" button).
 *
 * What this hook DOES on mount (for logged-in users):
 *  1. Pushes a deferred callback onto window.OneSignalDeferred
 *  2. Reads the existing PushSubscription id (if already granted)
 *  3. Saves it to user_devices
 *  4. Listens for future subscription changes
 */
export function useOneSignal() {
  const { user } = useAuth();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");

  const initDoneRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Re-init when user changes
    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id;
      initDoneRef.current = false;
    }

    if (initDoneRef.current) return;
    initDoneRef.current = true;

    let cancelled = false;

    (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
    (window as any).OneSignalDeferred.push(async function (OneSignal: any) {
      if (cancelled) return;

      try {
        // Only init SDK if not already initialised for this appId.
        const alreadyInitedAppId = (window as any).__ONESIGNAL_LAST_INIT_APP_ID__ as string | null;
        if (!((window as any).__ONESIGNAL_INITED__ && alreadyInitedAppId === ONESIGNAL_APP_ID)) {
          try {
            await OneSignal.init({
              appId: ONESIGNAL_APP_ID,
              allowLocalhostAsSecureOrigin: true,
              serviceWorkerPath: "/OneSignalSDKWorker.js",
              // Do NOT auto-prompt — let user trigger permission explicitly.
              autoResubscribe: false,
            });
          } catch (e: any) {
            // Tolerate "already initialised" errors gracefully.
            const msg = String(e?.message || e).toLowerCase();
            if (!msg.includes("already") && !msg.includes("initialized")) {
              throw e;
            }
          }
          (window as any).__ONESIGNAL_INITED__ = true;
          (window as any).__ONESIGNAL_LAST_INIT_APP_ID__ = ONESIGNAL_APP_ID;
        }

        setIsInitialized(true);

        // Detect current permission state without requesting it.
        try {
          const perm = OneSignal.Notifications?.permission;
          if (perm === true || perm === "granted") {
            setPermissionState("granted");
          } else if (perm === false || perm === "denied") {
            setPermissionState("denied");
          } else {
            setPermissionState("default");
          }
        } catch {
          setPermissionState("unknown");
        }

        // Read existing player id (if permission was already granted before).
        const readPlayerId = async () => {
          let pid: string | null = null;
          if (typeof OneSignal.getUserId === "function") {
            pid = await OneSignal.getUserId();
          }
          if (!pid) {
            pid = OneSignal.User?.PushSubscription?.id ?? null;
          }
          if (typeof pid === "string" && pid) {
            if (!cancelled) setPlayerId(pid);
            await savePlayerIdToDb(pid);
            return pid;
          }
          return null;
        };

        // Attempt to read player id now (may already exist).
        await readPlayerId();

        // Also try after a short delay — id can appear asynchronously.
        setTimeout(async () => {
          if (cancelled) return;
          await readPlayerId();
        }, 2000);

        // Listen for future subscription changes.
        OneSignal.User?.PushSubscription?.addEventListener?.("change", async (event: any) => {
          const nextPid = event?.current?.id;
          if (typeof nextPid === "string" && nextPid && !cancelled) {
            setPlayerId(nextPid);
            await savePlayerIdToDb(nextPid);
          }
        });

        if (typeof OneSignal.on === "function") {
          OneSignal.on("subscriptionChange", async (isSubscribed: boolean) => {
            if (isSubscribed && !cancelled) {
              await readPlayerId();
            }
          });
        }
      } catch (e) {
        console.error("[useOneSignal] OneSignal init flow failed:", e);
        setPermissionState("unknown");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /**
   * Call this from a UI button to explicitly request notification permission.
   * Returns the permission result.
   */
  const requestPermission = useCallback(async (): Promise<string | null> => {
    const OS = (window as any).OneSignal;
    if (!OS?.Notifications?.requestPermission) {
      console.warn("[useOneSignal] OneSignal not initialised yet");
      return null;
    }
    const permission = await OS.Notifications.requestPermission();
    if (permission === "granted") {
      setPermissionState("granted");
      await OS?.User?.PushSubscription?.optIn?.();
      // Read and save player id after permission grant
      let pid = OS.User?.PushSubscription?.id ?? null;
      if (!pid && typeof OS.getUserId === "function") {
        pid = await OS.getUserId();
      }
      if (typeof pid === "string" && pid) {
        setPlayerId(pid);
        await savePlayerIdToDb(pid);
      }
    } else if (permission === "denied") {
      setPermissionState("denied");
    } else {
      setPermissionState("default");
    }
    return permission;
  }, []);

  return { playerId, isInitialized, permissionState, requestPermission };
}

/**
 * Clears all OneSignal browser state (service workers, caches, storage).
 * Intended to be called ONLY from a debug/reset UI, NOT on every mount.
 */
export async function clearOneSignalBrowserState() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => /onesignal|OneSignalSDK/i.test(r.active?.scriptURL || ""))
          .map((r) => r.unregister()),
      );
    }
  } catch {}

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.toLowerCase().includes("onesignal") || k.toLowerCase().includes("os_"))
        .map((k) => caches.delete(k)),
    );
  } catch {}

  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.toLowerCase().includes("onesignal") || k.toLowerCase().startsWith("os_")) {
        localStorage.removeItem(k);
      }
    });
    Object.keys(sessionStorage).forEach((k) => {
      if (k.toLowerCase().includes("onesignal") || k.toLowerCase().startsWith("os_")) {
        sessionStorage.removeItem(k);
      }
    });
    indexedDB?.deleteDatabase("OneSignalSDKStore");
    indexedDB?.deleteDatabase("OneSignalIndexedDB");
  } catch {}
}

declare global {
  interface Window {
    OneSignal: any;
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
  }
}
