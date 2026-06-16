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

export const InstallAppButton: React.FC = () => {
  const { canInstall, isInstalled, isIOS, install } = usePwaInstallPrompt();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!canInstall || isInstalled) return null;

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

  const PlatformIcon = isIOS ? Apple : Chrome;
  const platformLabel = isIOS ? "iPhone" : "Android";

  return (
    <>
      <div className="pt-1">
        <p className="mb-2 text-xs font-semibold text-heading-gold">Stáhnout aplikaci</p>
        <button
          type="button"
          onClick={handleClick}
          disabled={installing}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-neon-gold/45 bg-neon-gold/15 px-2.5 pr-3 text-left shadow-[inset_0_1px_10px_rgba(255,181,71,0.08)] transition-colors hover:bg-neon-gold/25 hover:border-neon-gold/70 disabled:cursor-wait disabled:opacity-70"
          aria-label={`Stáhnout aplikaci pro ${platformLabel}`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neon-gold text-[hsl(220_50%_5%)]">
            <PlatformIcon className="h-3.5 w-3.5" />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-[10px] font-medium text-muted-foreground">Instalovat</span>
            <span className="text-xs font-bold text-foreground">{platformLabel}</span>
          </span>
          <Download className="h-3.5 w-3.5 shrink-0 text-neon-gold/80 transition-colors group-hover:text-neon-gold" />
        </button>
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
