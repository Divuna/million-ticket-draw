import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Heart, Trophy } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Contest {
  id: string;
  title: string;
  main_prize: string;
  main_image: string | null;
  banner_image?: string | null;
  main_prize_secondary_image?: string | null;
  status: string;
  ticket_price: number;
}

interface ContestCardProps {
  contest: Contest;
  user: User | null;
  isAdmin: boolean;
  processingContestId?: string | null;
  favorites?: Set<string> | null;
  onToggleFavorite?: (contestId: string, e: React.MouseEvent) => void;
  onRemoveFavorite?: (contestId: string, e: React.MouseEvent) => void;
  onPlay: (contestId: string) => void;
  fromPage: 'homepage' | 'games' | 'favorites';
  className?: string;
}

export const ContestCard: React.FC<ContestCardProps> = ({
  contest,
  user,
  isAdmin,
  processingContestId,
  favorites,
  onToggleFavorite,
  onRemoveFavorite,
  onPlay,
  fromPage,
  className = '',
}) => {
  const navigate = useNavigate();

  const isFavorite = favorites?.has(contest.id) ?? false;
  const isProcessing = processingContestId === contest.id;

  const getPlayButtonText = () => {
    if (isProcessing) return 'Zpracování...';
    if (contest.status === 'pending') return 'Připravuje se...';
    if (contest.status === 'closed') return 'Ukončena';
    return `Uplatnit ${contest.ticket_price} MioCoinů`;
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlay(contest.id);
  };

  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/contest/${contest.id}`, { state: { from: fromPage } });
  };

  const handleLoginClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/login');
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    if (fromPage === 'favorites' && onRemoveFavorite) {
      onRemoveFavorite(contest.id, e);
    } else if (onToggleFavorite) {
      onToggleFavorite(contest.id, e);
    }
  };

  // Determine the best image source with priority
  const getBestImageUrl = (): string | null => {
    if (contest.banner_image?.startsWith('http')) {
      return contest.banner_image;
    }
    if (contest.main_prize_secondary_image?.startsWith('http')) {
      return contest.main_prize_secondary_image;
    }
    if (contest.main_image) {
      return contest.main_image.startsWith('http')
        ? contest.main_image
        : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`;
    }
    return null;
  };

  const imageUrl = getBestImageUrl();

  return (
    <div 
      className={`
        relative overflow-hidden
        rounded-[24px]
        border border-[hsl(40_70%_50%/0.25)]
        shadow-[0_0_30px_4px_hsl(40_75%_50%/0.12),0_12px_40px_-8px_rgba(0,0,0,0.5),0_4px_16px_-2px_rgba(0,0,0,0.3)]
        transition-all duration-300 ease-out
        hover:shadow-[0_0_40px_6px_hsl(40_75%_50%/0.18),0_16px_48px_-8px_rgba(0,0,0,0.55),0_6px_20px_-2px_rgba(0,0,0,0.35)]
        ${className}
      `}
    >
      {/* Layer 1: Full-bleed background image */}
      <div className="absolute inset-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={contest.title}
            className="w-full h-full object-cover object-center"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full bg-[hsl(220_25%_10%)] flex items-center justify-center">
            <Trophy className="w-16 h-16 text-[hsl(45_80%_55%/0.2)]" />
          </div>
        )}
      </div>
      
      {/* Layer 2: Soft bottom gradient (30-35%) for text readability */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent 65%, rgba(0,0,0,0.35) 85%, rgba(0,0,0,0.7) 100%)'
        }}
      />
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col h-full min-h-[280px] p-5">
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {/* Favorite button - simple outline style */}
          {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="
                p-2.5 rounded-full 
                bg-[rgba(0,0,0,0.3)]
                backdrop-blur-md
                shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]
                transition-all duration-200
                hover:bg-[rgba(0,0,0,0.45)]
              "
              aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
            >
              <Heart
                className={`w-5 h-5 transition-colors ${
                  fromPage === 'favorites' || isFavorite
                    ? 'fill-[hsl(0_85%_60%)] text-[hsl(0_85%_60%)]'
                    : 'text-white/70'
                }`}
              />
            </button>
          ) : (
            <div />
          )}
          
          {/* Status badge - simple dark pill */}
          <Badge 
            className={`
              px-4 py-1.5 rounded-full text-sm font-medium
              backdrop-blur-md
              shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]
              ${contest.status === 'closed' 
                ? 'bg-[rgba(50,50,55,0.75)] text-white/85' 
                : 'bg-[rgba(35,40,50,0.8)] text-white/95'
              }
            `}
          >
            {contest.status === 'closed' ? 'Hra ukončena' : contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
          </Badge>
        </div>
        
        {/* Bottom content - text directly on gradient */}
        <div className="mt-auto space-y-3">
          {/* Title and prize */}
          <div className="space-y-0.5">
            <h3 className="font-bold text-xl text-white drop-shadow-md line-clamp-2">
              {contest.title}
            </h3>
            <p className="text-sm text-white/80 drop-shadow-sm line-clamp-1">
              {contest.main_prize}
            </p>
          </div>
          
          {/* CTA for logged-in non-admin users */}
          {user && !isAdmin && (
            <div className="flex gap-2">
              {/* Gold outlined pill CTA */}
              <button
                className="
                  flex-1 flex items-center justify-center gap-2
                  py-3.5 px-5
                  bg-[rgba(0,0,0,0.35)]
                  backdrop-blur-md
                  text-[hsl(45_80%_58%)] font-semibold text-sm
                  rounded-full
                  border border-[hsl(40_70%_50%/0.5)]
                  shadow-[inset_0_1px_3px_rgba(0,0,0,0.25),0_0_12px_hsl(40_70%_50%/0.08)]
                  hover:bg-[rgba(0,0,0,0.45)]
                  hover:shadow-[inset_0_1px_3px_rgba(0,0,0,0.25),0_0_16px_hsl(40_70%_50%/0.15)]
                  hover:text-[hsl(45_85%_62%)]
                  active:scale-[0.98]
                  transition-all duration-200
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
                onClick={handlePlayClick}
                disabled={contest.status !== 'active' || isProcessing}
              >
                🏆 {getPlayButtonText()}
              </button>
              {/* Detail button */}
              <button
                className="
                  py-3.5 px-5
                  bg-[rgba(0,0,0,0.35)]
                  backdrop-blur-md
                  text-white/85 font-medium text-sm
                  rounded-full
                  border border-white/15
                  shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]
                  hover:bg-[rgba(0,0,0,0.45)]
                  hover:text-white
                  active:scale-[0.98]
                  transition-all duration-200
                "
                onClick={handleDetailClick}
              >
                Detail
              </button>
            </div>
          )}
          
          {/* Login prompt for non-logged-in users */}
          {!user && (
            <button
              className="
                w-full py-3.5 px-5
                bg-[rgba(0,0,0,0.35)]
                backdrop-blur-md
                text-white/85 font-medium text-sm
                rounded-full
                border border-white/15
                shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]
                hover:bg-[rgba(0,0,0,0.45)]
                hover:text-white
                active:scale-[0.98]
                transition-all duration-200
              "
              onClick={handleLoginClick}
            >
              Přihlásit se
            </button>
          )}
          
          {/* Read-only message for admin users */}
          {user && isAdmin && (
            <div className="text-xs text-white/60 text-center py-3 bg-[rgba(0,0,0,0.35)] backdrop-blur-md rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]">
              Admin zobrazení - pouze pro čtení
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
