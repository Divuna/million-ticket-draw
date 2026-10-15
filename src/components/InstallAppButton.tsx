import React, { useEffect, useState } from "react";
import { Chrome, Download, Plus, Share2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";

const AppleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const WindowsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M0 3.5L9.5 2v8.5L0 11.5V3.5m10-1.5L24 0v10l-14 1V2m-10 9.5l9.5-.5v8.5L0 20v-8.5m10-.5l14-1v10l-14 1.5v-10.5" />
  </svg>
);

const platformBadgeBase =
  "inline-flex h-9 items-center gap-2 rounded-full border px-2.5 pr-3 text-left transition-colors";

const getIsMobileDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;

  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIPadOS;
};

export const InstallAppButton: React.FC = () => {
  const { canInstall, isInstalled, isIOS, install } = usePwaInstallPrompt();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    setIsMobileDevice(getIsMobileDevice());
  }, []);

  const canShowMobileInstall = !isInstalled && (canInstall || isIOS) && isMobileDevice;
  const isDesktop = !isMobileDevice && !isIOS;
  const canShowDesktopInstall = !isInstalled && canInstall && isDesktop;

  const handleInstall = async () => {
    if (isIOS) {
      setInstructionsOpen(true);
      return;
    }

    if (!canInstall) return;

    setInstalling(true);
    try {
      await install();
    } catch (error) {
      console.error("PWA install prompt failed:", error);
    } finally {
      setInstalling(false);
    }
  };

  const trustBadges = [
    { key: "ios", label: "iPhone", Icon: AppleIcon },
    { key: "android", label: "Android", Icon: Chrome },
    { key: "windows", label: "Windows", Icon: WindowsIcon },
  ] as const;

  return (
    <>
      <div className="pt-1">
        <p className="mb-2 text-xs text-muted-foreground">
          Dostupné pro iPhone, Android a Windows
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {trustBadges.map((platform) => {
            const { Icon } = platform;
            const isWindows = platform.key === "windows";
            const isWindowsActive = isWindows && canShowDesktopInstall;

            if (isWindowsActive) {
              return (
                <button
                  key={platform.key}
                  type="button"
                  onClick={handleInstall}
                  disabled={installing}
                  className={`${platformBadgeBase} border-neon-gold/50 bg-neon-gold/15 shadow-[inset_0_1px_10px_rgba(233,185,73,0.08)] hover:border-neon-gold/75 hover:bg-neon-gold/25 disabled:cursor-wait disabled:opacity-70`}
                  aria-label="Stáhnout do počítače"
                  title={
                    canShowDesktopInstall
                      ? "Nainstalovat do počítače"
                      : "Klikni pro instalaci do počítače"
                  }
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neon-gold text-[hsl(220_50%_5%)]">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-none">
                    <span className="text-[10px] font-medium text-muted-foreground">Stáhnout</span>
                    <span className="text-xs font-bold text-foreground">Windows</span>
                  </span>
                </button>
              );
            }

            return (
              <span
                key={platform.key}
                className={`${platformBadgeBase} cursor-default border-border/45 bg-white/[0.03] opacity-75`}
                aria-disabled="true"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neon-gold/25 text-neon-gold/70">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex min-w-0 flex-col leading-none">
                  <span className="text-[10px] font-medium text-muted-foreground">Dostupné</span>
                  <span className="text-xs font-bold text-foreground">{platform.label}</span>
                </span>
              </span>
            );
          })}
        </div>
        {canShowMobileInstall && (
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-neon-gold/50 bg-neon-gold/15 px-4 shadow-[inset_0_1px_10px_rgba(233,185,73,0.08)] transition-colors hover:border-neon-gold/75 hover:bg-neon-gold/25 disabled:cursor-wait disabled:opacity-70"
            aria-label="Stáhnout aplikaci"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neon-gold text-[hsl(220_50%_5%)]">
              <Download className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold text-foreground">Stáhnout aplikaci</span>
          </button>
        )}
      </div>

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="om-install max-w-sm rounded-[22px] border-0">
          <DialogHeader className="space-y-1.5 pr-6 text-left">
            <DialogTitle className="om-install-title">Přidej si OneMil na plochu</DialogTitle>
            <DialogDescription className="text-[13.5px] text-[#5E5B57]">
              Otevřeš ho jedním klepnutím jako aplikaci.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-2.5 text-sm text-[#17171B]">
            <li className="om-install-step">
              <span className="om-install-num">1</span>
              <span className="flex flex-wrap items-center gap-1.5">
                V Safari klepni dole na <b>Sdílet</b>
                <Share2 className="h-4 w-4 text-[#8A5A10]" aria-hidden="true" />
              </span>
            </li>
            <li className="om-install-step">
              <span className="om-install-num">2</span>
              <span className="flex flex-wrap items-center gap-1.5">
                Sjeď níž a vyber <b>Přidat na plochu</b>
                <Plus className="h-4 w-4 text-[#8A5A10]" aria-hidden="true" />
              </span>
            </li>
            <li className="om-install-step">
              <span className="om-install-num">3</span>
              <span>
                Vpravo nahoře klepni na <b>Přidat</b>
              </span>
            </li>
          </ol>

          <button type="button" className="om-ps-gold" onClick={() => setInstructionsOpen(false)}>
            Rozumím
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
};
