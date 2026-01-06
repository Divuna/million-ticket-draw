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
        rounded-[32px]
        bg-[hsl(225_20%_8%)]
        shadow-[0_0_60px_-8px_hsl(40_85%_50%/0.4),0_0_100px_-12px_hsl(40_80%_45%/0.25),0_25px_50px_-12px_rgba(0,0,0,0.6)]
        transition-all duration-500 ease-out
        hover:shadow-[0_0_80px_-4px_hsl(40_85%_55%/0.5),0_0_120px_-8px_hsl(40_80%_50%/0.3),0_30px_60px_-15px_rgba(0,0,0,0.7)]
        ${className}
      `}
    >
      {/* Layer 1: Full-bleed background image */}
      <div className="absolute inset-0 rounded-[32px] overflow-hidden">
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
          <div className="w-full h-full bg-[hsl(225_20%_8%)] flex items-center justify-center">
            <Trophy className="w-16 h-16 text-[hsl(45_70%_50%/0.15)]" />
          </div>
        )}
      </div>
      
      {/* Layer 2: Cinematic gradient overlay */}
      <div 
        className="absolute inset-0 pointer-events-none rounded-[32px]"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.75) 100%)'
        }}
      />
      
      {/* Content container - single continuous surface */}
      <div className="relative z-10 flex flex-col h-full min-h-[300px] p-5">
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {/* Favorite button - embedded pill */}
          {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="
                p-2.5 rounded-full 
                bg-[hsl(225_15%_12%/0.6)]
                backdrop-blur-md
                transition-all duration-300
                hover:bg-[hsl(225_15%_15%/0.8)]
              "
              aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
            >
              <Heart
                className={`w-5 h-5 transition-all duration-300 ${
                  fromPage === 'favorites' || isFavorite
                    ? 'fill-[hsl(0_75%_55%)] text-[hsl(0_75%_55%)]'
                    : 'text-white/60'
                }`}
              />
            </button>
          ) : (
            <div />
          )}
          
          {/* Status badge - embedded dark pill */}
          <Badge 
            className={`
              px-4 py-1.5 rounded-full text-[13px] font-medium tracking-wide
              bg-[hsl(225_15%_12%/0.7)] backdrop-blur-md
              border-0
              ${contest.status === 'closed' 
                ? 'text-white/60' 
                : 'text-white/90'
              }
            `}
          >
            {contest.status === 'closed' ? 'Hra ukončena' : contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
          </Badge>
        </div>
        
        {/* Bottom content - minimal Apple typography */}
        <div className="mt-auto space-y-4">
          {/* Title and prize - clean, minimal */}
          <div className="space-y-1">
            <h3 className="font-semibold text-[22px] text-white tracking-tight leading-tight line-clamp-2">
              {contest.title}
            </h3>
            <p className="text-[15px] text-white/65 font-normal line-clamp-1">
              {contest.main_prize}
            </p>
          </div>
          
          {/* CTA for logged-in non-admin users - embedded into card surface */}
          {user && !isAdmin && (
            <div className="flex gap-2.5">
              {/* Primary CTA - embedded gold accent */}
              <button
                className="
                  flex-1 flex items-center justify-center gap-2
                  py-3.5 px-6
                  bg-[hsl(40_75%_50%/0.12)]
                  backdrop-blur-md
                  text-[hsl(40_80%_60%)] font-medium text-[15px] tracking-wide
                  rounded-full
                  transition-all duration-300
                  hover:bg-[hsl(40_75%_50%/0.2)]
                  hover:text-[hsl(40_85%_65%)]
                  active:scale-[0.98]
                  disabled:opacity-35 disabled:cursor-not-allowed
                "
                onClick={handlePlayClick}
                disabled={contest.status !== 'active' || isProcessing}
              >
                🏆 {getPlayButtonText()}
              </button>
              {/* Secondary CTA - subtle embedded */}
              <button
                className="
                  py-3.5 px-5
                  bg-[hsl(225_15%_20%/0.4)]
                  backdrop-blur-md
                  text-white/70 font-medium text-[15px]
                  rounded-full
                  transition-all duration-300
                  hover:bg-[hsl(225_15%_25%/0.5)]
                  hover:text-white/90
                  active:scale-[0.98]
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
                w-full py-3.5 px-6
                bg-[hsl(225_15%_20%/0.4)]
                backdrop-blur-md
                text-white/70 font-medium text-[15px]
                rounded-full
                transition-all duration-300
                hover:bg-[hsl(225_15%_25%/0.5)]
                hover:text-white/90
                active:scale-[0.98]
              "
              onClick={handleLoginClick}
            >
              Přihlásit se
            </button>
          )}
          
          {/* Read-only message for admin users */}
          {user && isAdmin && (
            <div className="text-[13px] text-white/50 text-center py-3 bg-[hsl(225_15%_15%/0.5)] backdrop-blur-md rounded-full">
              Admin zobrazení - pouze pro čtení
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
