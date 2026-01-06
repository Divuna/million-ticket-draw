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
        bg-[hsl(220_30%_6%/0.75)]
        backdrop-blur-xl
        border border-[hsl(45_80%_55%/0.15)]
        shadow-[0_0_20px_hsl(45_80%_55%/0.06)]
        transition-all duration-300 ease-out
        hover:border-[hsl(45_80%_55%/0.25)]
        hover:shadow-[0_0_28px_hsl(45_80%_55%/0.1)]
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
          <div className="w-full h-full bg-[hsl(220_30%_8%)] flex items-center justify-center">
            <Trophy className="w-16 h-16 text-[hsl(45_80%_55%/0.2)]" />
          </div>
        )}
      </div>
      
      {/* Subtle dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220_30%_4%/0.95)] via-[hsl(220_30%_6%/0.6)] to-transparent" />
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col h-full min-h-[280px] p-5">
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {/* Favorite button */}
          {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="p-2 rounded-full bg-[hsl(220_30%_8%/0.6)] backdrop-blur-md border border-[hsl(0_0%_100%/0.08)] hover:border-[hsl(0_0%_100%/0.15)] transition-all duration-200"
              aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  fromPage === 'favorites' || isFavorite
                    ? 'fill-[hsl(0_85%_60%)] text-[hsl(0_85%_60%)]'
                    : 'text-[hsl(0_0%_100%/0.5)]'
                }`}
              />
            </button>
          ) : (
            <div />
          )}
          
          {/* Status badge */}
          <Badge 
            className={`
              px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md border
              ${contest.status === 'closed' 
                ? 'bg-[hsl(0_40%_40%/0.6)] text-[hsl(0_0%_100%/0.9)] border-[hsl(0_40%_50%/0.2)]' 
                : 'bg-[hsl(45_60%_50%/0.12)] text-[hsl(45_80%_70%)] border-[hsl(45_80%_55%/0.2)]'
              }
            `}
          >
            {contest.status === 'closed' ? 'Hra ukončena' : contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
          </Badge>
        </div>
        
        {/* Bottom content */}
        <div className="mt-auto space-y-4">
          {/* Title and prize */}
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-white line-clamp-2">
              {contest.title}
            </h3>
            <p className="text-sm text-[hsl(45_30%_70%)] line-clamp-1">
              {contest.main_prize}
            </p>
          </div>
          
          {/* CTA for logged-in non-admin users */}
          {user && !isAdmin && (
            <div className="flex gap-2.5">
              {/* Gold outlined glass CTA */}
              <button
                className="
                  flex-1 flex items-center justify-center gap-2
                  py-2.5 px-4
                  bg-[hsl(220_30%_8%/0.5)]
                  backdrop-blur-md
                  text-[hsl(45_80%_65%)] font-medium text-sm
                  rounded-full
                  border border-[hsl(45_80%_55%/0.35)]
                  shadow-[0_0_12px_hsl(45_80%_55%/0.08)]
                  hover:border-[hsl(45_80%_55%/0.5)]
                  hover:shadow-[0_0_18px_hsl(45_80%_55%/0.15)]
                  hover:text-[hsl(45_80%_75%)]
                  active:scale-[0.98]
                  transition-all duration-200
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[hsl(45_80%_55%/0.35)] disabled:hover:shadow-[0_0_12px_hsl(45_80%_55%/0.08)]
                "
                onClick={handlePlayClick}
                disabled={contest.status !== 'active' || isProcessing}
              >
                🏆 {getPlayButtonText()}
              </button>
              <button
                className="
                  py-2.5 px-4
                  bg-[hsl(220_30%_8%/0.5)]
                  backdrop-blur-md
                  text-[hsl(0_0%_100%/0.7)] font-medium text-sm
                  rounded-full
                  border border-[hsl(0_0%_100%/0.1)]
                  hover:border-[hsl(0_0%_100%/0.2)]
                  hover:text-[hsl(0_0%_100%/0.9)]
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
                w-full py-2.5 px-4
                bg-[hsl(220_30%_8%/0.5)]
                backdrop-blur-md
                text-[hsl(0_0%_100%/0.7)] font-medium text-sm
                rounded-full
                border border-[hsl(0_0%_100%/0.1)]
                hover:border-[hsl(0_0%_100%/0.2)]
                hover:text-[hsl(0_0%_100%/0.9)]
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
            <div className="text-xs text-[hsl(0_0%_100%/0.4)] text-center py-2 backdrop-blur-md bg-[hsl(220_30%_8%/0.4)] rounded-full border border-[hsl(0_0%_100%/0.06)]">
              Admin zobrazení - pouze pro čtení
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
