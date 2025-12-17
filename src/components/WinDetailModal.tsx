import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, Gift, CheckCircle, Clock, Package, Calendar, X } from 'lucide-react';
import { MIOCOIN_IMAGE_URL } from '@/components/MioCoin';

const SUPABASE_URL = 'https://xkzhjldrojjlrkezorey.supabase.co';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/contest-images/${path}`;
};

interface Win {
  id: string;
  type: string;
  status: string | null;
  delivered: boolean;
  notes: string | null;
  created_at: string;
  contest_id: string;
  prize_id: string | null;
  contest: {
    id: string;
    title: string;
    main_prize: string;
    main_image: string | null;
    main_prize_secondary_image: string | null;
  } | null;
  bonus_prize: {
    id: string;
    title: string | null;
    image_url: string | null;
  } | null;
}

interface WinDetailModalProps {
  win: Win | null;
  open: boolean;
  onClose: () => void;
  onNavigateToContest: (contestId: string) => void;
}

export const WinDetailModal: React.FC<WinDetailModalProps> = ({ win, open, onClose, onNavigateToContest }) => {
  if (!win) return null;

  const getStatusBadge = () => {
    if (win.delivered || win.status === 'vyplaceno') {
      return (
        <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" /> {win.status === 'vyplaceno' ? 'Vyplaceno' : 'Doručeno'}
        </Badge>
      );
    }
    switch (win.status) {
      case 'čeká na potvrzení':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení
          </Badge>
        );
      case 'připraveno k odeslání':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Package className="w-3 h-3 mr-1" /> Připraveno k odeslání
          </Badge>
        );
      case 'odesláno':
        return (
          <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Package className="w-3 h-3 mr-1" /> Odesláno
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení
          </Badge>
        );
    }
  };

  const getImageUrl = (): string | null => {
    if (win.type === 'main') {
      return win.contest?.main_prize_secondary_image || win.contest?.main_image || null;
    }
    return getStorageUrl(win.bonus_prize?.image_url) || MIOCOIN_IMAGE_URL;
  };

  const imageUrl = getImageUrl();
  const prizeName = win.type === 'main' 
    ? win.contest?.main_prize 
    : (win.notes || win.bonus_prize?.title || 'Bonusová cena');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border p-0 overflow-hidden">
        {/* Image Section */}
        {imageUrl && (
          <div className="relative w-full h-64 bg-muted/40">
            <img
              src={imageUrl}
              alt={prizeName || 'Výhra'}
              className="w-full h-full object-cover"
              onError={(e) => {
                if (win.type === 'bonus' && e.currentTarget.src !== MIOCOIN_IMAGE_URL) {
                  e.currentTarget.src = MIOCOIN_IMAGE_URL;
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            
            {/* Type badge overlay */}
            <div className="absolute top-4 left-4">
              <Badge className="bg-background/80 text-foreground border-0 backdrop-blur-sm">
                {win.type === 'main' 
                  ? <><Trophy className="h-4 w-4 text-yellow-400 mr-1" /> Hlavní výhra</>
                  : <><Gift className="h-4 w-4 text-purple-400 mr-1" /> Bonusová výhra</>
                }
              </Badge>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Header */}
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-bold text-foreground">
              {prizeName}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Soutěž: {win.contest?.title || 'Neznámá soutěž'}
            </p>
          </DialogHeader>

          {/* Status & Date */}
          <div className="flex items-center justify-between">
            {getStatusBadge()}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}</span>
            </div>
          </div>

          {/* Notes if any */}
          {win.notes && (
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Poznámka: </span>
                {win.notes}
              </p>
            </div>
          )}

          {/* Status explanation */}
          <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
            <p className="text-sm text-muted-foreground">
              {win.delivered || win.status === 'vyplaceno' ? (
                'Vaše výhra byla úspěšně doručena/vyplacena.'
              ) : win.status === 'odesláno' ? (
                'Vaše výhra byla odeslána a brzy dorazí.'
              ) : win.status === 'připraveno k odeslání' ? (
                'Vaše výhra je připravena k odeslání.'
              ) : (
                'Vaše výhra čeká na zpracování. Brzy vás budeme kontaktovat.'
              )}
            </p>
          </div>

          {/* Action Button */}
          <Button 
            onClick={() => {
              onClose();
              onNavigateToContest(win.contest_id);
            }}
            className="w-full"
            variant="outline"
          >
            Zobrazit soutěž
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
