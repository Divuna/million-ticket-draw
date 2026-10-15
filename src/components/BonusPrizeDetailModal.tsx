import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BonusPrize {
  id: string;
  description: string | null;
  detailed_description?: string | null;
  image_url?: string | null;
  /** Počet kusů této výhry v soutěži (z katalogu soutěže). */
  quantity?: number | null;
}

interface BonusPrizeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize: BonusPrize | null;
  backgroundImageUrl?: string | null;
}

/**
 * Detail bonusové věcné výhry – „vitrína s výhrou“ (deska Dialogy, krok 2).
 * Pozadí nastavené adminem (`backgroundImageUrl`) zůstává jako jemný nádech.
 */
export const BonusPrizeDetailModal: React.FC<BonusPrizeDetailModalProps> = ({
  isOpen,
  onClose,
  prize,
  backgroundImageUrl,
}) => {
  // Always render Dialog to prevent mount/unmount flicker in React StrictMode
  // Control visibility via isOpen prop, render content only when prize exists
  return (
    <Dialog open={isOpen && prize !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="om-bpm sm:max-w-lg max-h-[85vh] overflow-y-auto border-0">
        {backgroundImageUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{ backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}
        <DialogHeader className="relative z-10 space-y-1 text-left">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F2C55C]">Bonusová výhra</span>
          <DialogTitle className="om-bpm-title">{prize?.description || 'Bonusová výhra'}</DialogTitle>
        </DialogHeader>

        <div className="relative z-10 space-y-4 py-2">
          {prize?.image_url && (
            <div className="om-bpm-showcase">
              <span aria-hidden="true" className="om-bpm-spot" />
              <img
                src={prize.image_url}
                alt={prize.description || 'Bonusová výhra'}
                className="relative max-h-[280px] w-full object-contain"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          )}

          {/* Detailed description — prefer detailed_description, fall back to description */}
          {(prize?.detailed_description || prize?.description) ? (
            <div className="whitespace-pre-line text-sm leading-relaxed text-[#C9CDD4]">
              {prize.detailed_description || prize.description}
            </div>
          ) : (
            <p className="text-sm italic text-[#8E8F98]">Podrobný popis není k dispozici.</p>
          )}
        </div>

        <div className="relative z-10 flex items-center justify-between gap-3 pt-2">
          {prize?.quantity && prize.quantity > 1 ? (
            <span className="om-bpm-count">{prize.quantity.toLocaleString('cs-CZ')}× v soutěži</span>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="om-bpm-close">
            Zavřít
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
