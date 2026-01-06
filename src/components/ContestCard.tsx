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
        bg-[rgba(12,15,22,0.45)]
        backdrop-blur-[14px]
        border border-[hsl(45_80%_55%/0.4)]
        shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.06),0_8px_24px_-4px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(0,0,0,0.3)]
        transition-all duration-300 ease-out
        hover:border-[hsl(45_80%_55%/0.55)]
        hover:shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.08),0_12px_32px_-4px_rgba(0,0,0,0.5),0_0_16px_hsl(45_80%_55%/0.08)]
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
          <div className="w-full h-full bg-[hsl(220_30%_8%)] flex items-center justify-center">
            <Trophy className="w-16 h-16 text-[hsl(45_80%_55%/0.15)]" />
          </div>
        )}
      </div>
      
      {/* Layer 2: Cinematic gradient mask (separate overlay) */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0.70) 100%)'
        }}
      />
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col h-full min-h-[280px] p-5">
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {/* Favorite button - glass pill style */}
          {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="
                p-2.5 rounded-full 
                bg-[rgba(0,0,0,0.35)] 
                backdrop-blur-[10px] 
                border border-[hsl(0_0%_100%/0.12)]
                shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.05)]
                hover:border-[hsl(0_0%_100%/0.2)] 
                transition-all duration-200
              "
              aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  fromPage === 'favorites' || isFavorite
                    ? 'fill-[hsl(0_85%_60%)] text-[hsl(0_85%_60%)]'
                    : 'text-[hsl(0_0%_100%/0.6)]'
                }`}
              />
            </button>
          ) : (
            <div />
          )}
          
          {/* Status badge - glass pill style */}
          <Badge 
            className={`
              px-3.5 py-1.5 rounded-full text-xs font-medium 
              backdrop-blur-[10px] 
              shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.05)]
              ${contest.status === 'closed' 
                ? 'bg-[rgba(0,0,0,0.35)] text-[hsl(0_0%_100%/0.8)] border border-[hsl(0_50%_50%/0.3)]' 
                : 'bg-[rgba(0,0,0,0.35)] text-[hsl(45_80%_70%)] border border-[hsl(45_80%_55%/0.35)]'
              }
            `}
          >
            {contest.status === 'closed' ? 'Hra ukončena' : contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
          </Badge>
        </div>
        
        {/* Bottom content with frosted glass panel */}
        <div className="mt-auto">
          {/* Frosted glass content strip */}
          <div className="
            relative rounded-2xl p-4 -mx-1
            bg-[rgba(12,15,22,0.35)]
            backdrop-blur-[10px]
            border border-[hsl(0_0%_100%/0.06)]
            shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.04)]
          ">
            {/* Title and prize */}
            <div className="space-y-1 mb-4">
              <h3 className="font-semibold text-lg text-white/95 line-clamp-2 drop-shadow-sm">
                {contest.title}
              </h3>
              <p className="text-sm text-[hsl(45_40%_75%)] line-clamp-1">
                {contest.main_prize}
              </p>
            </div>
            
            {/* CTA for logged-in non-admin users */}
            {user && !isAdmin && (
              <div className="flex gap-2.5">
                {/* Gold outlined glass pill CTA */}
                <button
                  className="
                    flex-1 flex items-center justify-center gap-2
                    py-3 px-5
                    bg-[rgba(0,0,0,0.35)]
                    backdrop-blur-[10px]
                    text-[hsl(45_80%_65%)] font-medium text-sm
                    rounded-full
                    border border-[hsl(45_80%_55%/0.6)]
                    shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.05)]
                    hover:border-[hsl(45_80%_55%/0.75)]
                    hover:shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.05),0_0_12px_hsl(45_80%_55%/0.12)]
                    hover:text-[hsl(45_80%_75%)]
                    active:scale-[0.98]
                    transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                  onClick={handlePlayClick}
                  disabled={contest.status !== 'active' || isProcessing}
                >
                  🏆 {getPlayButtonText()}
                </button>
                {/* Detail button - glass pill */}
                <button
                  className="
                    py-3 px-5
                    bg-[rgba(0,0,0,0.35)]
                    backdrop-blur-[10px]
                    text-[hsl(0_0%_100%/0.7)] font-medium text-sm
                    rounded-full
                    border border-[hsl(0_0%_100%/0.12)]
                    shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.05)]
                    hover:border-[hsl(0_0%_100%/0.22)]
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
                  w-full py-3 px-5
                  bg-[rgba(0,0,0,0.35)]
                  backdrop-blur-[10px]
                  text-[hsl(0_0%_100%/0.7)] font-medium text-sm
                  rounded-full
                  border border-[hsl(0_0%_100%/0.12)]
                  shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.05)]
                  hover:border-[hsl(0_0%_100%/0.22)]
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
              <div className="
                text-xs text-[hsl(0_0%_100%/0.5)] text-center py-2.5 
                bg-[rgba(0,0,0,0.25)] backdrop-blur-[8px] 
                rounded-full border border-[hsl(0_0%_100%/0.08)]
              ">
                Admin zobrazení - pouze pro čtení
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
