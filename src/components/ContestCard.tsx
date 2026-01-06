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
        rounded-[28px]
        bg-[hsl(220_30%_8%/0.6)]
        backdrop-blur-xl
        border border-[hsl(45_80%_55%/0.2)]
        shadow-[0_8px_32px_hsl(220_50%_3%/0.4),0_0_0_1px_hsl(45_80%_55%/0.08),inset_0_1px_0_hsl(0_0%_100%/0.05)]
        transition-all duration-300 ease-out
        hover:border-[hsl(45_80%_55%/0.35)]
        hover:shadow-[0_12px_40px_hsl(220_50%_3%/0.5),0_0_24px_hsl(45_80%_55%/0.12),inset_0_1px_0_hsl(0_0%_100%/0.08)]
        hover:scale-[1.02]
        ${className}
      `}
    >
      {/* Full-bleed background image */}
      <div className="absolute inset-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={contest.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[hsl(220_30%_12%)] to-[hsl(220_30%_6%)] flex items-center justify-center">
            <Trophy className="w-16 h-16 text-[hsl(45_80%_55%/0.3)]" />
          </div>
        )}
      </div>
      
      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220_30%_4%)] via-[hsl(220_30%_6%/0.7)] to-[hsl(220_30%_8%/0.3)]" />
      
      {/* Subtle inner glow at top */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[hsl(0_0%_100%/0.03)] to-transparent pointer-events-none" />
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col h-full min-h-[280px] p-5">
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {/* Favorite button */}
          {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="p-2.5 rounded-full bg-[hsl(220_30%_10%/0.7)] backdrop-blur-md border border-[hsl(0_0%_100%/0.1)] hover:bg-[hsl(220_30%_15%/0.8)] hover:border-[hsl(0_0%_100%/0.2)] transition-all duration-200 shadow-[0_4px_12px_hsl(220_50%_3%/0.3)]"
              aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
            >
              <Heart
                className={`w-5 h-5 transition-colors ${
                  fromPage === 'favorites' || isFavorite
                    ? 'fill-[hsl(0_85%_60%)] text-[hsl(0_85%_60%)]'
                    : 'text-[hsl(0_0%_100%/0.6)]'
                }`}
              />
            </button>
          ) : (
            <div />
          )}
          
          {/* Status badge */}
          <Badge 
            className={`
              px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border shadow-[0_4px_12px_hsl(220_50%_3%/0.3)]
              ${contest.status === 'closed' 
                ? 'bg-[hsl(0_60%_50%/0.8)] text-white border-[hsl(0_60%_50%/0.3)]' 
                : 'bg-[hsl(45_80%_55%/0.15)] text-[hsl(45_90%_65%)] border-[hsl(45_80%_55%/0.3)]'
              }
            `}
          >
            {contest.status === 'closed' ? 'Hra ukončena' : contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
          </Badge>
        </div>
        
        {/* Bottom content */}
        <div className="mt-auto space-y-4">
          {/* Title and prize */}
          <div className="space-y-1.5">
            <h3 className="font-bold text-xl text-white line-clamp-2 drop-shadow-[0_2px_4px_hsl(220_50%_3%/0.5)]">
              {contest.title}
            </h3>
            <p className="text-sm text-[hsl(45_40%_75%)] line-clamp-1 drop-shadow-[0_1px_2px_hsl(220_50%_3%/0.5)]">
              {contest.main_prize}
            </p>
          </div>
          
          {/* CTA buttons for logged-in non-admin users */}
          {user && !isAdmin && (
            <div className="flex gap-3">
              <button
                className="
                  flex-1 flex items-center justify-center gap-2
                  py-3 px-5
                  bg-gradient-to-r from-[hsl(45_80%_45%)] to-[hsl(40_85%_50%)]
                  text-[hsl(220_30%_8%)] font-bold text-sm
                  rounded-full
                  shadow-[0_4px_16px_hsl(45_80%_50%/0.35),0_0_0_1px_hsl(45_80%_55%/0.2)]
                  hover:shadow-[0_6px_24px_hsl(45_80%_50%/0.5),0_0_0_1px_hsl(45_80%_55%/0.4)]
                  hover:brightness-110
                  active:scale-[0.98]
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100
                "
                onClick={handlePlayClick}
                disabled={contest.status !== 'active' || isProcessing}
              >
                <Trophy className="w-4 h-4" />
                {getPlayButtonText()}
              </button>
              <button
                className="
                  py-3 px-5
                  bg-[hsl(220_30%_12%/0.8)]
                  backdrop-blur-md
                  text-[hsl(0_0%_100%/0.8)] font-medium text-sm
                  rounded-full
                  border border-[hsl(0_0%_100%/0.12)]
                  shadow-[0_4px_12px_hsl(220_50%_3%/0.3)]
                  hover:bg-[hsl(220_30%_18%/0.9)]
                  hover:text-white
                  hover:border-[hsl(0_0%_100%/0.2)]
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
                w-full py-3 px-5
                bg-[hsl(220_30%_12%/0.8)]
                backdrop-blur-md
                text-[hsl(0_0%_100%/0.8)] font-medium text-sm
                rounded-full
                border border-[hsl(0_0%_100%/0.12)]
                shadow-[0_4px_12px_hsl(220_50%_3%/0.3)]
                hover:bg-[hsl(220_30%_18%/0.9)]
                hover:text-white
                hover:border-[hsl(0_0%_100%/0.2)]
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
            <div className="text-xs text-[hsl(0_0%_100%/0.5)] text-center py-2 backdrop-blur-md bg-[hsl(220_30%_10%/0.5)] rounded-full border border-[hsl(0_0%_100%/0.08)]">
              Admin zobrazení - pouze pro čtení
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
