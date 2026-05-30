import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Trophy, Gift, CheckCircle, Clock, Package } from 'lucide-react';
import trophyIcon from '@/assets/icons/icon-trophy-onemil.svg';
import { MIOCOIN_IMAGE_URL } from '@/components/MioCoin';
import { supabaseUrl } from '@/integrations/supabase/client';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${supabaseUrl}/storage/v1/object/public/contest-images/${path}`;
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
  isHighlighted?: boolean;
}

export const WinCard: React.FC<WinCardProps> = ({ win, onClick, className = '', isHighlighted = false }) => {
  const isMainPrize = win.type === 'main';

  const getStatusBadge = () => {
    const baseClasses = "text-xs font-medium";
    
    if (win.delivered || win.status === 'delivered') {
      return (
        <Badge className={`${baseClasses} bg-emerald-500/90 text-white border-0`}>
          <CheckCircle className="w-3 h-3 mr-1" /> Předáno
        </Badge>
      );
    }
    switch (win.status) {
      case 'pending':
        return (
          <Badge className={`${baseClasses} bg-amber-500/90 text-white border-0`}>
            <Clock className="w-3 h-3 mr-1" /> Čeká
          </Badge>
        );
      case 'připraveno k odeslání':
        return (
          <Badge className={`${baseClasses} bg-[rgba(255,138,0,0.9)] text-black border-0`}>
            <Package className="w-3 h-3 mr-1" /> Připraveno k odeslání
          </Badge>
        );
      case 'shipped':
        return (
          <Badge className={`${baseClasses} bg-purple-500/90 text-white border-0`}>
            <Package className="w-3 h-3 mr-1" /> Odesláno
          </Badge>
        );
      default:
        return (
          <Badge className={`${baseClasses} bg-amber-500/90 text-white border-0`}>
            <Clock className="w-3 h-3 mr-1" /> Čeká
          </Badge>
        );
    }
  };

  const getTypeIcon = () => {
    return isMainPrize 
      ? <Trophy className="h-4 w-4 text-amber-500" />
      : <Gift className="h-4 w-4 text-purple-500" />;
  };

  const getTypeLabel = () => {
    return isMainPrize ? 'Hlavní výhra' : 'Bonusová výhra';
  };

  const getImageUrl = (): string | null => {
    if (isMainPrize) {
      return win.contest?.main_prize_secondary_image || win.contest?.main_image || null;
    }
    return getStorageUrl(win.bonus_prize?.image_url) || MIOCOIN_IMAGE_URL;
  };

  const imageUrl = getImageUrl();

  return (
    <div 
      className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 
        bg-card border
        ${isMainPrize 
          ? 'border-amber-400/30 hover:border-amber-400/60 hover:shadow-lg hover:shadow-amber-500/10' 
          : 'border-border/50 hover:border-purple-400/40 hover:shadow-lg hover:shadow-purple-500/5'
        }
        ${isHighlighted ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/20' : ''} 
        ${className}
        hover:scale-[1.01]`}
      onClick={onClick}
      style={{
        animation: 'fade-in 0.4s ease-out forwards'
      }}
    >
      {/* Image section - 70% */}
      <div className="relative h-56 overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={win.contest?.title || 'Výhra'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
          <div className="w-full h-full flex items-center justify-center bg-muted">
            {isMainPrize ? (
              <img src={trophyIcon} alt="" aria-hidden="true" className="w-16 h-16 rounded-2xl opacity-30" />
            ) : (
              <Gift className="w-16 h-16 text-purple-400/30" />
            )}
          </div>
        )}

        {/* Subtle bottom fade for main prizes only */}
        {isMainPrize && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        )}

        {/* Status badge - top right */}
        <div className="absolute top-3 right-3">
          {getStatusBadge()}
        </div>

        {/* Subtle gold glow for main prizes on hover */}
        {isMainPrize && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none
            shadow-[inset_0_0_30px_rgba(251,191,36,0.1)]" />
        )}
      </div>

      {/* Content section - 30% */}
      <div className="p-4 space-y-2">
        {/* Type indicator */}
        <div className="flex items-center gap-1.5">
          {getTypeIcon()}
          <span className={`text-xs font-medium ${isMainPrize ? 'text-amber-600 dark:text-amber-400' : 'text-purple-600 dark:text-purple-400'}`}>
            {getTypeLabel()}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-foreground line-clamp-2 leading-tight">
          {win.contest?.title || 'Soutěž'}
        </h3>

        {/* Prize name */}
        <p className="text-sm text-muted-foreground line-clamp-1">
          {isMainPrize ? win.contest?.main_prize : (win.notes || win.bonus_prize?.title || 'Bonusová cena')}
        </p>

        {/* Date */}
        <p className="text-xs text-muted-foreground/70 pt-1 border-t border-border/50">
          Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}
        </p>
      </div>

      {/* Shimmer effect on hover - border only */}
      <div className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className={`absolute inset-0 rounded-xl ${isMainPrize ? 'shadow-[0_0_1px_1px_rgba(251,191,36,0.15)]' : ''}`} />
      </div>
    </div>
  );
};
