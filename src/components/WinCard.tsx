import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Trophy, Gift, CheckCircle, Clock, Package } from 'lucide-react';
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

interface WinCardProps {
  win: Win;
  onClick: () => void;
  className?: string;
}

export const WinCard: React.FC<WinCardProps> = ({ win, onClick, className = '' }) => {
  const getStatusBadge = () => {
    // Unified status colors matching AdminWinners
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

  const getTypeIcon = () => {
    return win.type === 'main' 
      ? <Trophy className="h-5 w-5 text-yellow-400" />
      : <Gift className="h-5 w-5 text-purple-400" />;
  };

  const getTypeLabel = () => {
    return win.type === 'main' ? 'Hlavní výhra' : 'Bonusová výhra';
  };

  const getImageUrl = (): string | null => {
    if (win.type === 'main') {
      return win.contest?.main_prize_secondary_image || win.contest?.main_image || null;
    }
    return getStorageUrl(win.bonus_prize?.image_url) || MIOCOIN_IMAGE_URL;
  };

  const imageUrl = getImageUrl();

  return (
    <div 
      className={`contest-card rounded-2xl overflow-hidden relative cursor-pointer ${className}`}
      onClick={onClick}
    >
      {/* Full-width image matching ContestCard h-64 */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={win.contest?.title || 'Výhra'}
          className="w-full h-64 object-cover"
          loading="lazy"
          onError={(e) => {
            if (win.type === 'bonus' && e.currentTarget.src !== MIOCOIN_IMAGE_URL) {
              e.currentTarget.src = MIOCOIN_IMAGE_URL;
            } else {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }
          }}
        />
      ) : (
        <div className="w-full h-64 bg-muted/40 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            {win.type === 'main' ? (
              <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-500/50" />
            ) : (
              <Gift className="w-12 h-12 mx-auto mb-2 text-purple-500/50" />
            )}
          </div>
        </div>
      )}

      {/* Bottom dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

      {/* Status badge - top right */}
      <div className="absolute top-3 right-3">
        {getStatusBadge()}
      </div>

      {/* Type badge - top left */}
      <div className="absolute top-3 left-3">
        <Badge className="bg-background/80 text-foreground border-0 backdrop-blur-sm">
          {getTypeIcon()}
          <span className="ml-1">{getTypeLabel()}</span>
        </Badge>
      </div>

      {/* Overlay content - bottom */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
        <h3 className="font-bold text-lg text-white line-clamp-2 mb-1">
          {win.contest?.title || 'Soutěž'}
        </h3>
        <p className="text-sm text-white/80 line-clamp-1">
          {win.type === 'main' ? win.contest?.main_prize : (win.notes || win.bonus_prize?.title || 'Bonusová cena')}
        </p>
        <p className="text-xs text-white/60">
          Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}
        </p>
      </div>
    </div>
  );
};
