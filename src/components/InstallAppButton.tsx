import React, { useState } from "react";
import { Download, Plus, Share2, Smartphone } from "lucide-react";
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

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className="rounded-xl p-4 min-h-[88px] md:min-h-[96px] bg-[hsl(220_45%_6%)] border-2 border-[rgba(255,138,0,0.3)] cursor-pointer hover:border-[rgba(255,138,0,0.5)] transition-all duration-200 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_12px_rgba(255,138,0,0.05)] relative overflow-hidden disabled:opacity-70 disabled:cursor-wait"
        aria-label="Nainstalovat aplikaci"
      >
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[rgba(255,138,0,0.10)] via-transparent to-transparent" />
        <Smartphone className="w-8 h-8 mb-2 relative z-10 text-[#FF8A00]" />
        <div className="text-sm font-semibold text-foreground relative z-10">
          Nainstalovat aplikaci
        </div>
        <div className="text-xs text-muted-foreground leading-snug mt-1 relative z-10">
          Přidejte si OneMil na plochu telefonu.
        </div>
      </button>

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
