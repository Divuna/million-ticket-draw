import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface BonusPrize {
  id: string;
  description: string | null;
  detailed_description?: string | null;
  image_url?: string | null;
}

interface BonusPrizeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize: BonusPrize | null;
  backgroundImageUrl?: string | null;
}

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
      <DialogContent 
        className="sm:max-w-lg max-h-[85vh] overflow-y-auto"
        style={{
          backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay for readability if background is present */}
        {backgroundImageUrl && (
          <div className="absolute inset-0 bg-background/80 pointer-events-none" />
        )}
        <DialogHeader className="relative z-10">
          <DialogTitle className="text-xl font-bold text-yellow-400">
            {prize?.description || 'Bonusová výhra'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 relative z-10">
          {/* Prize image */}
          {prize?.image_url && (
            <div className="w-full rounded-xl overflow-hidden bg-black/20">
              <img
                src={prize.image_url}
                alt={prize.description || 'Bonusová výhra'}
                className="w-full h-auto object-contain max-h-[300px]"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          )}

          {/* Detailed description — prefer detailed_description, fall back to description */}
          {(prize?.detailed_description || prize?.description) ? (
            <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {prize.detailed_description || prize.description}
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic">
              Podrobný popis není k dispozici.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2 relative z-10">
          <Button onClick={onClose} variant="outline" className="rounded-full">
            Zavřít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
