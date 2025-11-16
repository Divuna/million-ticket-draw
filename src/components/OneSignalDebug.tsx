// src/components/OneSignalDebug.tsx
import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    OneSignal?: any;
    __oneSignalInitState?: {
      called: boolean;
      blocked: number;
      allowed: number;
    };
  }
}

interface DebugInfo {
  sdkDetected: boolean;
  permission: string;
  playerId: string | null;
  guardState?: {
    called: boolean;
    blocked: number;
    allowed: number;
  };
}

const OneSignalDebug: React.FC = () => {
  const [info, setInfo] = useState<DebugInfo>({
    sdkDetected: false,
    permission: "unknown",
    playerId: null,
    guardState: undefined,
  });

  useEffect(() => {
    let mounted = true;

    const mapPermission = (p: any): string => {
      if (typeof p === "string") return p;
      if (typeof p === "boolean") return p ? "granted" : "default";
      return "unknown";
    };

    const interval = setInterval(async () => {
      const OS = window.OneSignal;

      // SDK ještě není – nic neděláme
      if (!OS) return;

      // máme SDK → můžeme zrušit interval
      clearInterval(interval);
      if (!mounted) return;

      const guardState = window.__oneSignalInitState;

      let permission = "unknown";
      try {
        const p =
          (await OS.Notifications?.permission) ??
          (typeof Notification !== "undefined" ? Notification.permission : undefined);
        permission = mapPermission(p);
      } catch {
        permission = typeof Notification !== "undefined" ? Notification.permission : "unknown";
      }

      let playerId: string | null = null;
      try {
        playerId = (await OS.User?.PushSubscription?.id) ?? null;
      } catch {
        playerId = null;
      }

      setInfo({
        sdkDetected: true,
        permission,
        playerId,
        guardState,
      });

      // ❗ DŮLEŽITÉ: žádné OS.Notifications.on(...) ani jiné .on volání
      // Jen čteme stav a nic neregistrujeme, aby se nerozbíjel NotificationsNamespace.ts
    }, 150);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4 text-sm bg-card border rounded-xl">
      <h1 className="text-xl font-bold mb-2">OneSignal Debug</h1>

      <div className="space-y-1">
        <div>
          <span className="font-semibold">SDK detected:</span> {info.sdkDetected ? "YES" : "NO"}
        </div>
        <div>
          <span className="font-semibold">Permission:</span> {info.permission}
        </div>
        <div>
          <span className="font-semibold">Player ID:</span> {info.playerId ?? "null"}
        </div>
      </div>

      {info.guardState && (
        <div className="mt-3 space-y-1">
          <div className="font-semibold">Guard state:</div>
          <div>called: {String(info.guardState.called)}</div>
          <div>blocked: {info.guardState.blocked}</div>
          <div>allowed: {info.guardState.allowed}</div>
        </div>
      )}

      <p className="mt-4 text-muted-foreground">
        Tato stránka jen čte stav OneSignal SDK. Záměrně nic neregistruje přes <code>.on()</code>, aby se předešlo
        chybám typu
        <code>NotificationsNamespace.ts: Cannot read properties of undefined (reading 'on')</code>.
      </p>
    </div>
  );
};

export default OneSignalDebug;
