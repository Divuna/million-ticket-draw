import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Trophy, Gift, CheckCircle, Clock, Package, Sparkles } from 'lucide-react';
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
  isHighlighted?: boolean;
}

export const WinCard: React.FC<WinCardProps> = ({ win, onClick, className = '', isHighlighted = false }) => {
  const getStatusBadge = () => {
    // Unified status colors with premium gold accents
    if (win.delivered || win.status === 'vyplaceno') {
      return (
        <Badge className="bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-emerald-300 border border-emerald-400/40 backdrop-blur-sm shadow-lg shadow-emerald-500/20">
          <CheckCircle className="w-3 h-3 mr-1" /> {win.status === 'vyplaceno' ? 'Vyplaceno' : 'Doručeno'}
        </Badge>
      );
    }
    switch (win.status) {
      case 'čeká na potvrzení':
        return (
          <Badge className="bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-amber-300 border border-amber-400/40 backdrop-blur-sm shadow-lg shadow-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení
          </Badge>
        );
      case 'připraveno k odeslání':
        return (
          <Badge className="bg-gradient-to-r from-blue-500/30 to-cyan-500/30 text-blue-300 border border-blue-400/40 backdrop-blur-sm shadow-lg shadow-blue-500/20">
            <Package className="w-3 h-3 mr-1" /> Připraveno k odeslání
          </Badge>
        );
      case 'odesláno':
        return (
          <Badge className="bg-gradient-to-r from-purple-500/30 to-violet-500/30 text-purple-300 border border-purple-400/40 backdrop-blur-sm shadow-lg shadow-purple-500/20">
            <Package className="w-3 h-3 mr-1" /> Odesláno
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-amber-300 border border-amber-400/40 backdrop-blur-sm shadow-lg shadow-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení
          </Badge>
        );
    }
  };

  const getTypeIcon = () => {
    return win.type === 'main' 
      ? <Trophy className="h-5 w-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
      : <Gift className="h-5 w-5 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]" />;
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
      className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 
        ${isHighlighted ? 'ring-2 ring-amber-400/60 animate-pulse shadow-lg shadow-amber-500/30' : ''} 
        ${className}
        hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20`}
      onClick={onClick}
      style={{
        animation: 'fade-in 0.5s ease-out forwards'
      }}
    >
      {/* Premium border gradient */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400/30 via-transparent to-purple-500/30 p-[1px] z-10 pointer-events-none">
        <div className="w-full h-full rounded-2xl bg-black/80" />
      </div>

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 -skew-x-12 group-hover:animate-[shimmer_2s_ease-in-out_infinite] z-20 pointer-events-none" />

      {/* Sparkle decorations */}
      <div className="absolute top-4 left-4 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <Sparkles className="w-4 h-4 text-amber-400/60 animate-pulse" />
      </div>
      <div className="absolute bottom-20 right-4 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
        <Sparkles className="w-3 h-3 text-purple-400/60 animate-pulse" />
      </div>

      {/* Full-width image */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={win.contest?.title || 'Výhra'}
          className="w-full h-64 object-cover transition-transform duration-700 group-hover:scale-110"
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
        <div className="w-full h-64 bg-gradient-to-br from-black/60 via-black/40 to-amber-900/20 flex items-center justify-center">
          <div className="text-center">
            {win.type === 'main' ? (
              <Trophy className="w-12 h-12 mx-auto mb-2 text-amber-400/50 drop-shadow-[0_0_15px_rgba(251,191,36,0.4)]" />
            ) : (
              <Gift className="w-12 h-12 mx-auto mb-2 text-purple-400/50 drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
            )}
          </div>
        </div>
      )}

      {/* Premium dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />
      
      {/* Gold accent glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Status badge - top right with premium styling */}
      <div className="absolute top-3 right-3 z-30">
        {getStatusBadge()}
      </div>

      {/* Type badge - top left with premium styling */}
      <div className="absolute top-3 left-3 z-30">
        <Badge className="bg-black/60 backdrop-blur-md text-white border border-amber-400/30 shadow-lg">
          {getTypeIcon()}
          <span className="ml-1.5 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent font-medium">
            {getTypeLabel()}
          </span>
        </Badge>
      </div>

      {/* Overlay content - bottom with premium typography */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2 z-20">
        <h3 className="font-bold text-lg bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text text-transparent line-clamp-2 mb-1 drop-shadow-lg">
          {win.contest?.title || 'Soutěž'}
        </h3>
        <p className="text-sm text-amber-100/90 line-clamp-1 drop-shadow-md">
          {win.type === 'main' ? win.contest?.main_prize : (win.notes || win.bonus_prize?.title || 'Bonusová cena')}
        </p>
        <p className="text-xs text-white/60 font-medium">
          Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}
        </p>
      </div>

      {/* Floating particles effect on hover */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-amber-400/40 rounded-full"
            style={{
              left: `${20 + i * 30}%`,
              bottom: '20%',
              animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`
            }}
          />
        ))}
      </div>
    </div>
  );
};
