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

  return (
    <div className={`rounded-xl overflow-hidden relative bg-[hsl(220_45%_6%)] border border-amber-300/20 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-all duration-200 hover:border-amber-300/40 hover:shadow-[0_8px_24px_hsl(222_50%_3%/0.6)] ${className}`}>
      {/* Full-width banner image - Priority: banner_image > main_prize_secondary_image > main_image */}
      {(() => {
        // Determine the best image source with priority
        const getBestImageUrl = (): string | null => {
          // Priority 1: AI-generated banner_image (if starts with http)
          if (contest.banner_image?.startsWith('http')) {
            return contest.banner_image;
          }
          // Priority 2: AI-generated main_prize_secondary_image (if starts with http)
          if (contest.main_prize_secondary_image?.startsWith('http')) {
            return contest.main_prize_secondary_image;
          }
          // Priority 3: Original main_image (only if no AI images exist)
          if (contest.main_image) {
            return contest.main_image.startsWith('http')
              ? contest.main_image
              : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`;
          }
          return null;
        };

        const imageUrl = getBestImageUrl();

        return imageUrl ? (
          <img
            src={imageUrl}
            alt={contest.title}
            className="w-full h-56 object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-56 bg-muted/20 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
              <span className="text-sm">Bez obrázku</span>
            </div>
          </div>
        );
      })()}
      
      {/* Bottom dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220_45%_6%)]/95 via-[hsl(220_45%_6%)]/60 to-transparent pointer-events-none" />
      
      {/* Status badge */}
      <div className="absolute top-3 right-3">
        {contest.status === 'closed' ? (
          <Badge className="bg-destructive/90 text-destructive-foreground border-0 shadow-md">
            Hra ukončena
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-primary/90 text-primary-foreground border-0 shadow-md">
            {contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
          </Badge>
        )}
      </div>
      
      {/* Favorite button */}
      {user && !isAdmin && (onToggleFavorite || onRemoveFavorite) && (
        <button
          onClick={handleFavoriteClick}
          className="absolute top-3 left-3 z-10 p-2 rounded-full bg-[hsl(220_45%_6%)]/80 hover:bg-[hsl(220_45%_6%)] border border-border/30 transition-all duration-200"
          aria-label={fromPage === 'favorites' ? 'Remove from favorites' : 'Toggle favorite'}
        >
          <Heart
            className={`w-5 h-5 ${
              fromPage === 'favorites' || isFavorite
                ? 'fill-destructive text-destructive'
                : 'text-muted-foreground'
            }`}
          />
        </button>
      )}
      
      {/* Overlay content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-2">
        <h3 className="font-bold text-lg text-foreground line-clamp-2">
          {contest.title}
        </h3>
        <p className="text-sm text-text-silver line-clamp-1">
          {contest.main_prize}
        </p>
        
        {/* Show interactive buttons only for logged-in non-admin users */}
        {user && !isAdmin && (
          <div className="flex gap-2 mt-2">
            <button
              className="flex-1 py-2.5 px-4 bg-primary text-primary-foreground font-bold rounded-lg shadow-[0_0_12px_hsl(var(--primary)/0.35)] hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none text-sm"
              onClick={handlePlayClick}
              disabled={contest.status !== 'active' || isProcessing}
            >
              {getPlayButtonText()}
            </button>
            <button
              className="py-2.5 px-4 bg-muted/30 text-muted-foreground font-medium rounded-lg hover:bg-muted/50 hover:text-foreground border border-border/30 transition-all duration-200 text-sm"
              onClick={handleDetailClick}
            >
              Detail
            </button>
          </div>
        )}
        
        {/* Show login prompt for non-logged-in users */}
        {!user && (
          <button
            className="w-full py-2.5 px-4 mt-2 bg-muted/30 text-muted-foreground font-medium rounded-lg hover:bg-muted/50 hover:text-foreground border border-border/30 transition-all duration-200 text-sm"
            onClick={handleLoginClick}
          >
            Přihlásit se
          </button>
        )}
        
        {/* Show read-only message for admin users */}
        {user && isAdmin && (
          <div className="text-xs text-muted-foreground text-center mt-2 py-2">
            Admin zobrazení - pouze pro čtení
          </div>
        )}
      </div>
    </div>
  );
};
