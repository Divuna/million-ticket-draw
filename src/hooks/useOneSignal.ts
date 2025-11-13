// src/hooks/useOneSignal.ts nebo tam kde máš hook
import { useState, useEffect } from "react";

export function useOneSignal() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initOneSignal = async () => {
      try {
        // KRITICKÉ: Nevoláme OneSignal.init() - už bylo zavoláno z Lovable runtime!
        // Místo toho jen čekáme až bude SDK ready

        const checkReady = setInterval(async () => {
          if (window.OneSignal) {
            clearInterval(checkReady);

            console.log("[useOneSignal] OneSignal SDK detekováno");

            // Zkontrolujeme zda už je inicializováno
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

            // Získáme player_id pokud existuje
            try {
              const currentPlayerId = await window.OneSignal.User?.PushSubscription?.id;

              if (currentPlayerId && mounted) {
                setPlayerId(currentPlayerId);
                console.log("[useOneSignal] Player ID:", currentPlayerId);
              }
            } catch (err) {
              console.warn("[useOneSignal] Player ID není dostupný:", err);
            }

            // Posloucháme změny subscription
            window.OneSignal.User?.PushSubscription?.addEventListener("change", (event: any) => {
              if (mounted && event.current?.id) {
                console.log("[useOneSignal] Player ID změněn:", event.current.id);
                setPlayerId(event.current.id);
              }
            });
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
  }
}
