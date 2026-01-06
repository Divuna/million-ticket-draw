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
    // Outer wrapper for ambient glow
    <div className={`relative ${className}`}>
      {/* Ambient gold glow - diffused, not a sharp border */}
      <div 
        className="absolute -inset-[3px] rounded-[27px] pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, hsl(40 80% 50% / 0.35) 0%, hsl(40 75% 45% / 0.15) 50%, hsl(40 80% 50% / 0.25) 100%)',
          filter: 'blur(14px)',
        }}
      />
      
      {/* Main card body - single glass capsule */}
      <div 
        className="
          relative overflow-hidden
          rounded-[24px]
          bg-[rgba(8,10,16,0.6)]
          backdrop-blur-sm
          shadow-[0_20px_60px_-15px_rgba(0,0,0,0.55),0_8px_25px_-5px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.08)]
          transition-all duration-300 ease-out
          hover:shadow-[0_24px_70px_-12px_rgba(0,0,0,0.6),0_10px_30px_-5px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.1)]
        "
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
            <div className="w-full h-full bg-[hsl(220_20%_8%)] flex items-center justify-center">
              <Trophy className="w-16 h-16 text-[hsl(45_80%_55%/0.15)]" />
            </div>
          )}
        </div>
        
        {/* Layer 2: Cinematic gradient - smooth fade into shadow */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(180deg,
              transparent 0%,
              transparent 15%,
              rgba(0,0,0,0.05) 30%,
              rgba(0,0,0,0.2) 50%,
              rgba(0,0,0,0.45) 70%,
              rgba(0,0,0,0.75) 100%
            )`
          }}
        />
        
        {/* Content container */}
        <div className="relative z-10 flex flex-col h-full min-h-[280px] p-4">
          {/* Top row: Favorite + Status */}
          <div className="flex items-start justify-between mb-auto">
            {/* Favorite button - glass material, embossed into surface */}
            {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) ? (
              <button
                onClick={handleFavoriteClick}
                className="
                  p-2 rounded-full 
                  bg-[rgba(255,255,255,0.06)]
                  backdrop-blur-md
                  border border-[rgba(255,255,255,0.08)]
                  shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]
                  transition-all duration-200
                  hover:bg-[rgba(255,255,255,0.1)]
                "
                aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
              >
                <Heart
                  className={`w-5 h-5 transition-colors ${
                    fromPage === 'favorites' || isFavorite
                      ? 'fill-[hsl(0_75%_55%)] text-[hsl(0_75%_55%)]'
                      : 'text-white/60'
                  }`}
                />
              </button>
            ) : (
              <div />
            )}
            
            {/* Status badge - glass material, part of the surface */}
            <Badge 
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium
                bg-[rgba(0,0,0,0.4)]
                backdrop-blur-md
                border border-[rgba(255,255,255,0.08)]
                shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
                ${contest.status === 'closed' 
                  ? 'text-white/70' 
                  : 'text-white/90'
                }
              `}
            >
              {contest.status === 'closed' ? 'Hra ukončena' : contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
            </Badge>
          </div>
          
          {/* Bottom content */}
          <div className="mt-auto space-y-3">
            {/* Title and prize */}
            <div className="space-y-0.5">
              <h3 className="font-bold text-xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] line-clamp-2">
                {contest.title}
              </h3>
              <p className="text-sm text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] line-clamp-1">
                {contest.main_prize}
              </p>
            </div>
            
            {/* CTA for logged-in non-admin users */}
            {user && !isAdmin && (
              <div className="flex gap-2">
                {/* Primary CTA - embossed glass pill, same material as card */}
                <button
                  className="
                    flex-1 flex items-center justify-center gap-2
                    py-3 px-5
                    bg-[rgba(255,255,255,0.06)]
                    backdrop-blur-md
                    text-[hsl(45_70%_58%)] font-semibold text-sm
                    rounded-full
                    border border-[rgba(255,255,255,0.1)]
                    shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]
                    hover:bg-[rgba(255,255,255,0.1)]
                    hover:text-[hsl(45_75%_65%)]
                    active:scale-[0.98]
                    transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                  onClick={handlePlayClick}
                  disabled={contest.status !== 'active' || isProcessing}
                >
                  🏆 {getPlayButtonText()}
                </button>
                {/* Detail button - same glass material */}
                <button
                  className="
                    py-3 px-5
                    bg-[rgba(255,255,255,0.05)]
                    backdrop-blur-md
                    text-white/70 font-medium text-sm
                    rounded-full
                    border border-[rgba(255,255,255,0.08)]
                    shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
                    hover:bg-[rgba(255,255,255,0.08)]
                    hover:text-white/90
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
                  bg-[rgba(255,255,255,0.05)]
                  backdrop-blur-md
                  text-white/70 font-medium text-sm
                  rounded-full
                  border border-[rgba(255,255,255,0.08)]
                  shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
                  hover:bg-[rgba(255,255,255,0.08)]
                  hover:text-white/90
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
                text-xs text-white/50 text-center py-2.5 
                bg-[rgba(255,255,255,0.04)] 
                backdrop-blur-md
                rounded-full
                border border-[rgba(255,255,255,0.06)]
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
