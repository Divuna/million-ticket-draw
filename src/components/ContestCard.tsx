import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { Badge } from '@/components/ui/badge';
import { Heart, Trophy } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
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
  fast_game?: boolean;
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
  ticketsSold?: number;
  ticketsTotal?: number;
  /** Games page: show only total count line, no sold/progress */
  showTotalOnly?: boolean;
  /** When set (e.g. on Games / Favorites), gates purchase CTA vs top-up using this balance */
  walletBalance?: number;
  /** Visual size variant – controls card height and typography scale */
  size?: 'featured' | 'normal' | 'compact';
  /** Total MioCoins invested into this contest (tickets_sold × ticket_price) */
  totalInvestedCoins?: number;
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
  ticketsSold,
  ticketsTotal,
  showTotalOnly = false,
  walletBalance,
  size = 'normal',
  totalInvestedCoins,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isFavorite = favorites?.has(contest.id) ?? false;
  const isProcessing = processingContestId === contest.id;

  const hasWalletHint = typeof walletBalance === 'number';
  const insufficientFunds =
    Boolean(user) &&
    contest.status === 'active' &&
    hasWalletHint &&
    walletBalance < contest.ticket_price;
  const shortageCoins = insufficientFunds
    ? Math.max(0, Math.ceil(contest.ticket_price - walletBalance))
    : 0;

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
    navigate(buildLoginRedirectUrl(location.pathname + location.search));
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    if (fromPage === 'favorites' && onRemoveFavorite) {
      onRemoveFavorite(contest.id, e);
    } else if (onToggleFavorite) {
      onToggleFavorite(contest.id, e);
    }
  };

  const resolveStorageUrl = (fileName: string, bucket: string): string => {
    if (fileName.startsWith('http')) return fileName;
    return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
  };

  const getBestImageUrl = (): string | null => {
    if (contest.banner_image) {
      return resolveStorageUrl(contest.banner_image, 'contest-banners');
    }
    if (contest.main_prize_secondary_image) {
      return resolveStorageUrl(contest.main_prize_secondary_image, 'contest-images');
    }
    if (contest.main_image) {
      return resolveStorageUrl(contest.main_image, 'contest-images');
    }
    return null;
  };

  const imageUrl = getBestImageUrl();

  const hasTotal = typeof ticketsTotal === 'number' && Number.isFinite(ticketsTotal);
  const showTotalOnlyLine = Boolean(showTotalOnly && hasTotal);
  const showProgress = !showTotalOnly && hasTotal;
  const soldForBar = showProgress ? (ticketsSold ?? 0) : 0;

  // Height based on size variant — when featured/compact, parent controls height via h-full
  const contentHeight =
    size === 'featured' ? 'h-full' :
    size === 'compact'  ? 'h-full' :
    'h-48';

  const titleSize =
    size === 'featured' ? 'text-2xl md:text-3xl' :
    size === 'compact'  ? 'text-sm'              :
    'text-xl';

  return (
    <div
      className={`
        contest-card-glow
        relative overflow-hidden
        rounded-[20px]
        border-[3px] border-[hsl(40_75%_55%)]
        transition-all duration-300 ease-out
        hover:scale-[1.02]
        ${size !== 'normal' ? 'h-full' : ''}
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

      {/* Layer 2: Gradient for text readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            size === 'featured'
              ? 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.82) 100%)'
              : 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.25) 65%, rgba(0,0,0,0.65) 100%)',
        }}
      />

      {/* Content container */}
      <div className={`relative z-10 flex flex-col ${contentHeight} p-4`}>
        {/* Top row: Favorite + Status */}
        <div className="flex items-start justify-between mb-auto">
          {user && (onToggleFavorite || onRemoveFavorite) ? (
            <button
              onClick={handleFavoriteClick}
              className="
                p-2 rounded-full
                bg-[rgba(0,0,0,0.25)]
                backdrop-blur-sm
                transition-all duration-200
                hover:bg-[rgba(0,0,0,0.4)]
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

          <div className="flex gap-1.5">
            {contest.fast_game && (
              <Badge className="bg-amber-500/80 text-white text-[10px] px-2 py-0.5">Fast game</Badge>
            )}
            {contest.status !== 'active' && (
              <Badge
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium
                  ${contest.status === 'closed'
                    ? 'bg-[rgba(60,60,60,0.85)] text-white/90'
                    : 'bg-[rgba(40,45,55,0.9)] text-white'}
                `}
              >
                {contest.status === 'closed' ? 'Hra ukončena' : 'Připravuje se'}
              </Badge>
            )}
          </div>
        </div>

        {/* Bottom content */}
        <div className="mt-auto space-y-2">
          {/* Featured: prize label above title */}
          {size === 'featured' && contest.main_prize && (
            <p className="text-[11px] uppercase tracking-[0.15em] text-[hsl(45_85%_65%)] font-semibold drop-shadow-md">
              {contest.main_prize}
            </p>
          )}

          <h3 className={`font-bold ${titleSize} text-white drop-shadow-md line-clamp-2`}>
            {contest.title}
          </h3>

          {/* Total invested – shown on featured and normal sizes */}
          {size !== 'compact' && typeof totalInvestedCoins === 'number' && totalInvestedCoins > 0 && (
            <p className="text-[10px] text-[hsl(45_75%_65%)] drop-shadow-md leading-tight">
              {totalInvestedCoins.toLocaleString('cs-CZ')} MioCoinů vloženo
            </p>
          )}

          {showTotalOnlyLine && (
            <p className="text-[10px] md:text-xs text-white/90 drop-shadow-md leading-tight">
              Celkem {ticketsTotal.toLocaleString('cs-CZ')} ticketů
            </p>
          )}
          {showProgress && (
            <div className="space-y-0.5">
              <p className="text-[10px] md:text-xs text-white/90 drop-shadow-md leading-tight">
                {soldForBar.toLocaleString('cs-CZ')} / {ticketsTotal.toLocaleString('cs-CZ')} ticketů
              </p>
              <div className="w-full h-1 rounded-full overflow-hidden bg-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#f6e27a] to-[#d4a017] transition-all duration-300"
                  style={{
                    width: `${ticketsTotal > 0 ? Math.min(100, (soldForBar / ticketsTotal) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* CTA for logged-in users */}
          {user && (
            <div className="flex flex-col gap-1.5">
              {insufficientFunds && (
                <p className="text-[11px] md:text-xs text-amber-300/95 drop-shadow-md leading-tight px-0.5">
                  Chybí ti {shortageCoins.toLocaleString('cs-CZ')} MioCoinů
                </p>
              )}
              <div className="flex items-stretch gap-2">
                <button
                  className="
                    flex-1 flex items-center justify-center gap-2
                    h-11 px-5
                    whitespace-nowrap
                    bg-[rgba(0,0,0,0.4)]
                    backdrop-blur-sm
                    text-[hsl(45_85%_55%)] font-semibold text-sm
                    rounded-full
                    border-2 border-[hsl(40_75%_50%)]
                    hover:bg-[rgba(0,0,0,0.5)]
                    hover:text-[hsl(45_90%_60%)]
                    active:scale-[0.98]
                    transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                  onClick={(e) => {
                    e.stopPropagation();
                    if (insufficientFunds) {
                      navigate('/profile', {
                        state: { paymentReturnTo: `${location.pathname}${location.search}` },
                      });
                      return;
                    }
                    handlePlayClick(e);
                  }}
                  disabled={contest.status !== 'active' || (!insufficientFunds && isProcessing)}
                >
                  {insufficientFunds ? <>Dobít MioCoiny</> : <>🏆 {getPlayButtonText()}</>}
                </button>
                <button
                  className="
                    h-11 px-4
                    bg-[rgba(0,0,0,0.4)]
                    backdrop-blur-sm
                    text-white/80 font-medium text-sm
                    rounded-full
                    border border-white/20
                    hover:bg-[rgba(0,0,0,0.5)]
                    hover:text-white
                    active:scale-[0.98]
                    transition-all duration-200
                  "
                  onClick={handleDetailClick}
                >
                  Detail
                </button>
              </div>
            </div>
          )}

          {/* Login prompt for non-logged-in users */}
          {!user && (
            <button
              className="
                w-full py-3 px-5
                bg-[rgba(0,0,0,0.4)]
                backdrop-blur-sm
                text-white/80 font-medium text-sm
                rounded-full
                border border-white/20
                hover:bg-[rgba(0,0,0,0.5)]
                hover:text-white
                active:scale-[0.98]
                transition-all duration-200
              "
              onClick={handleLoginClick}
            >
              Přihlásit se
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
