import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface BonusPrizeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize: {
    id: string;
    description: string | null;
    detailed_description?: string | null;
    image_url?: string | null;
  } | null;
}

export const BonusPrizeDetailModal: React.FC<BonusPrizeDetailModalProps> = ({
  isOpen,
  onClose,
  prize,
}) => {
  if (!prize) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-yellow-400">
            {prize.description || 'Bonusová výhra'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Prize image */}
          {prize.image_url && (
            <div className="w-full rounded-xl overflow-hidden bg-black/20">
              <img
                src={prize.image_url}
                alt={prize.description || 'Bonusová výhra'}
                className="w-full h-auto object-contain max-h-[300px]"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          )}

          {/* Detailed description */}
          {prize.detailed_description ? (
            <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {prize.detailed_description}
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic">
              Podrobný popis není k dispozici.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="outline" className="rounded-full">
            Zavřít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
