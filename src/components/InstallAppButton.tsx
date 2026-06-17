import React, { useState } from "react";
import { Apple, Chrome, Download, Plus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";

const platformBadgeBase =
  "inline-flex h-9 items-center gap-2 rounded-full border px-2.5 pr-3 text-left transition-colors";

export const InstallAppButton: React.FC = () => {
  const { canInstall, isInstalled, isIOS, install } = usePwaInstallPrompt();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleClick = async () => {
    if (isIOS) {
      setInstructionsOpen(true);
      return;
    }

    setInstalling(true);

    try {
      await install();
    } catch (error) {
      console.error("PWA install prompt failed:", error);
    } finally {
      setInstalling(false);
    }
  };

  const platforms = [
    { key: "ios", label: "iPhone", Icon: Apple },
    { key: "android", label: "Android", Icon: Chrome },
  ] as const;

  const currentPlatformKey = isIOS ? "ios" : "android";

  const renderPlatformBadge = (
    platform: (typeof platforms)[number],
    options: { active: boolean; clickable: boolean }
  ) => {
    const { Icon } = platform;
    const badgeClass = options.active
      ? `${platformBadgeBase} group border-neon-gold/50 bg-neon-gold/15 shadow-[inset_0_1px_10px_rgba(255,181,71,0.08)] hover:border-neon-gold/75 hover:bg-neon-gold/25 disabled:cursor-wait disabled:opacity-70`
      : `${platformBadgeBase} cursor-default border-border/45 bg-white/[0.03] opacity-75`;

    const content = (
      <>
        <span
          className={
            options.active
              ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neon-gold text-[hsl(220_50%_5%)]"
              : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neon-gold/25 text-neon-gold/70"
          }
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-[10px] font-medium text-muted-foreground">
            {options.active ? "Instalovat" : "Dostupné"}
          </span>
          <span className="text-xs font-bold text-foreground">{platform.label}</span>
        </span>
        {options.active && (
          <Download className="h-3.5 w-3.5 shrink-0 text-neon-gold/80 transition-colors group-hover:text-neon-gold" />
        )}
      </>
    );

    if (options.clickable && options.active) {
      return (
        <button
          key={platform.key}
          type="button"
          onClick={handleClick}
          disabled={installing}
          className={badgeClass}
          aria-label={`Stáhnout aplikaci pro ${platform.label}`}
        >
          {content}
        </button>
      );
    }

    return (
      <span
        key={platform.key}
        className={badgeClass}
        aria-disabled="true"
        title={options.clickable ? "Dostupné na jiné platformě" : undefined}
      >
        {content}
      </span>
    );
  };

  if (isInstalled) {
    return (
      <div className="pt-1">
        <p className="mb-2 text-xs text-muted-foreground">Dostupné pro iPhone a Android</p>
        <div className="flex flex-wrap items-center gap-2">
          {platforms.map((platform) =>
            renderPlatformBadge(platform, { active: false, clickable: false })
          )}
        </div>
      </div>
    );
  }

  if (!canInstall) return null;

  return (
    <>
      <div className="pt-1">
        <p className="mb-1 text-xs font-semibold text-heading-gold">Stáhnout aplikaci</p>
        <p className="mb-2 text-xs text-muted-foreground">Dostupné pro iPhone a Android</p>
        <div className="flex flex-wrap items-center gap-2">
          {platforms.map((platform) =>
            renderPlatformBadge(platform, {
              active: platform.key === currentPlatformKey,
              clickable: true,
            })
          )}
        </div>
      </div>

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="max-w-sm rounded-2xl border-[rgba(255,138,0,0.3)] bg-[hsl(220_45%_6%)] text-foreground shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <DialogHeader className="space-y-2 pr-6">
            <DialogTitle className="text-heading-gold flex items-center gap-2">
              <Download className="w-5 h-5 text-[#FF8A00]" />
              Nainstalovat aplikaci
            </DialogTitle>
            <DialogDescription>
              Přidejte si OneMil na plochu telefonu.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 rounded-lg border border-[rgba(255,138,0,0.18)] bg-black/20 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF8A00] text-xs font-bold text-black">
                1
              </span>
              <span>Otevři OneMil v Safari.</span>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-[rgba(255,138,0,0.18)] bg-black/20 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF8A00] text-xs font-bold text-black">
                2
              </span>
              <span className="flex items-center gap-2">
                Klepni na Sdílet.
                <Share2 className="h-4 w-4 text-[#FFB547]" />
              </span>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-[rgba(255,138,0,0.18)] bg-black/20 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF8A00] text-xs font-bold text-black">
                3
              </span>
              <span className="flex items-center gap-2">
                Zvol „Přidat na plochu“.
                <Plus className="h-4 w-4 text-[#FFB547]" />
              </span>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-[rgba(255,138,0,0.18)] bg-black/20 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF8A00] text-xs font-bold text-black">
                4
              </span>
              <span>Potvrď „Přidat“.</span>
            </div>
          </div>

          <p className="rounded-lg border border-[rgba(255,181,71,0.2)] bg-[rgba(255,138,0,0.08)] p-3 text-xs leading-relaxed text-muted-foreground">
            Na iPhonu instalaci potvrzuješ ručně přes Safari.
          </p>

          <Button
            type="button"
            variant="premium"
            className="w-full"
            onClick={() => setInstructionsOpen(false)}
          >
            Rozumím
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
