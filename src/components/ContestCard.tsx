import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Heart, Trophy, Sparkles } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import './ContestCard.css';

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
        group
        contest-card-glow
        relative overflow-hidden
        rounded-[20px]
        border-[3px] border-[hsl(40_75%_55%)]
        transition-all duration-500 ease-out
        hover:scale-[1.02]
        hover:shadow-2xl hover:shadow-amber-500/20
        ${className}
      `}
      style={{
        animation: 'fade-in 0.5s ease-out forwards'
      }}
    >
      {/* Premium border gradient overlay */}
      <div className="absolute inset-0 rounded-[17px] bg-gradient-to-br from-amber-400/20 via-transparent to-purple-500/20 pointer-events-none z-[5]" />

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 -skew-x-12 group-hover:animate-[shimmer_2s_ease-in-out_infinite] z-[25] pointer-events-none" />

      {/* Sparkle decorations on hover */}
      <div className="absolute top-3 right-14 z-[30] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <Sparkles className="w-4 h-4 text-amber-400/70 animate-pulse" />
      </div>
      <div className="absolute bottom-14 left-3 z-[30] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-150">
        <Sparkles className="w-3 h-3 text-amber-300/60 animate-pulse" />
      </div>

      {/* Layer 1: Full-bleed background image */}
      <div className="absolute inset-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={contest.title}
            className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-black/80 via-black/60 to-amber-900/30 flex items-center justify-center">
            <Trophy className="w-16 h-16 text-amber-400/30 drop-shadow-[0_0_20px_rgba(251,191,36,0.3)]" />
          </div>
        )}
      </div>
      
      {/* Layer 2: Premium gradient overlay for text readability */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.75) 100%)'
        }}
      />

      {/* Gold accent glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-amber-500/15 via-transparent to-transparent pointer-events-none z-[5]" />
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col h-48 p-4">
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {/* Favorite button - premium glass style */}
          {user && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="
                p-2 rounded-full 
                bg-black/40
                backdrop-blur-md
                border border-amber-400/20
                transition-all duration-300
                hover:bg-black/60
                hover:border-amber-400/40
                hover:shadow-lg hover:shadow-amber-500/20
                group/fav
              "
              aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
            >
              <Heart
                className={`w-5 h-5 transition-all duration-300 ${
                  fromPage === 'favorites' || isFavorite
                    ? 'fill-red-500 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                    : 'text-white/70 group-hover/fav:text-amber-300'
                }`}
              />
            </button>
          ) : (
            <div />
          )}
          
          {/* Status badge - premium glass style */}
          {contest.status !== 'active' && (
            <Badge 
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium backdrop-blur-md border shadow-lg
                ${contest.status === 'closed' 
                  ? 'bg-black/50 text-white/90 border-white/20' 
                  : 'bg-black/50 text-amber-200 border-amber-400/30'
                }
              `}
            >
              {contest.status === 'closed' ? 'Hra ukončena' : 'Připravuje se'}
            </Badge>
          )}
        </div>
        
        {/* Bottom content - premium typography */}
        <div className="mt-auto space-y-3">
          {/* Title with gold gradient */}
          <h3 className="font-bold text-xl bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text text-transparent drop-shadow-lg line-clamp-2">
            {contest.title}
          </h3>
          
          {/* CTA for logged-in users - premium gold buttons */}
          {user && (
            <div className="flex items-stretch gap-2">
              {/* Primary gold CTA */}
              <button
                className="
                  flex-1 flex items-center justify-center gap-2
                  h-11 px-5
                  whitespace-nowrap
                  bg-gradient-to-r from-amber-600/40 via-amber-500/50 to-amber-600/40
                  backdrop-blur-md
                  text-amber-100 font-semibold text-sm
                  rounded-full
                  border-2 border-amber-400/60
                  shadow-lg shadow-amber-500/20
                  hover:from-amber-500/50 hover:via-amber-400/60 hover:to-amber-500/50
                  hover:border-amber-300/80
                  hover:text-white
                  hover:shadow-xl hover:shadow-amber-500/30
                  active:scale-[0.98]
                  transition-all duration-300
                  disabled:opacity-40 disabled:cursor-not-allowed
                  group/btn
                "
                onClick={handlePlayClick}
                disabled={contest.status !== 'active' || isProcessing}
              >
                <Trophy className="w-4 h-4 text-amber-300 group-hover/btn:text-amber-200 transition-colors" />
                {getPlayButtonText()}
              </button>
              {/* Detail button - premium glass */}
              <button
                className="
                  h-11 px-4
                  bg-black/40
                  backdrop-blur-md
                  text-white/80 font-medium text-sm
                  rounded-full
                  border border-white/20
                  hover:bg-black/60
                  hover:text-white
                  hover:border-amber-400/30
                  active:scale-[0.98]
                  transition-all duration-300
                "
                onClick={handleDetailClick}
              >
                Detail
              </button>
            </div>
          )}
          
          {/* Login prompt for non-logged-in users - premium glass */}
          {!user && (
            <button
              className="
                w-full py-3 px-5
                bg-black/40
                backdrop-blur-md
                text-white/80 font-medium text-sm
                rounded-full
                border border-amber-400/30
                hover:bg-black/60
                hover:text-amber-100
                hover:border-amber-400/50
                active:scale-[0.98]
                transition-all duration-300
              "
              onClick={handleLoginClick}
            >
              Přihlásit se
            </button>
          )}
        </div>
      </div>

      {/* Floating particles effect on hover */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-[5]">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-amber-400/50 rounded-full"
            style={{
              left: `${15 + i * 25}%`,
              bottom: '30%',
              animation: `float ${3 + i * 0.4}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`
            }}
          />
        ))}
      </div>
    </div>
  );
};
