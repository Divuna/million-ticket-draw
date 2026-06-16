import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

const getStandaloneMode = () => {
  if (!isBrowser) return false;

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

const getIsIOS = () => {
  if (!isBrowser) return false;

  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;

  return /iPad|iPhone|iPod/.test(userAgent) || isIPadOS;
};

export const usePwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;

    const updateInstallState = () => {
      setIsInstalled(getStandaloneMode());
      setIsIOS(getIsIOS());
    };

    updateInstallState();

    const displayModeQuery = window.matchMedia?.("(display-mode: standalone)");
    displayModeQuery?.addEventListener?.("change", updateInstallState);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      if (getStandaloneMode()) {
        setDeferredPrompt(null);
        setIsInstalled(true);
        return;
      }

      setDismissed(false);
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setDismissed(true);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      displayModeQuery?.removeEventListener?.("change", updateInstallState);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt || isInstalled) return null;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      setDeferredPrompt(null);

      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      } else {
        setDismissed(true);
      }

      return choice;
    } catch (error) {
      setDeferredPrompt(null);
      setDismissed(true);
      throw error;
    }
  }, [deferredPrompt, isInstalled]);

  const canInstall = !isInstalled && !dismissed && (Boolean(deferredPrompt) || isIOS);

  return {
    canInstall,
    isInstalled,
    isIOS,
    install,
    dismiss,
  };
};
