import { OneMilTrophyIcon } from '@/components/icons/OneMilIcons';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { cs } from 'date-fns/locale';
import miocoinImage from '@/assets/miocoin.png';

interface WinnerCardProps {
  userName: string;
  userNickname: string | null;
  prizeName: string;
  contestTitle: string;
  createdAt: string;
  type: string;
  prizeImageUrl?: string | null;
  cardStyleImageUrl?: string | null;
  userAvatarUrl?: string | null;
  ticketNumber?: number | null;
  variant?: 'dark' | 'champagne';
  /** Kompaktní varianta pro Homepage — nižší karta, menší obrázek, avatar a texty. */
  compact?: boolean;
}

export const WinnerCard = ({
  userName,
  userNickname,
  prizeName,
  contestTitle,
  createdAt,
  prizeImageUrl,
  cardStyleImageUrl,
  userAvatarUrl,
  ticketNumber,
  variant = 'dark',
  compact = false,
}: WinnerCardProps) => {
  const isChampagne = variant === 'champagne';
  const displayName = userNickname || userName;
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const timeAgo = formatDistanceToNow(new Date(createdAt), {
    addSuffix: true,
    locale: cs,
  });

  return (
    <Card
      className="rounded-xl overflow-hidden hover:-translate-y-0.5 hover:scale-[1.01] transition-all duration-300 cursor-pointer relative"
      style={{
        background: isChampagne
          ? 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,249,239,0.94) 100%)'
          : 'hsl(220 45% 6%)',
        border: isChampagne ? '1px solid rgba(190,132,58,0.18)' : '1px solid rgba(255,138,0,0.22)',
        boxShadow: isChampagne
          ? '0 12px 30px rgba(120,73,24,0.10), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 2px 12px hsl(222 50% 3% / 0.6), inset 0 1px 0 rgba(255,181,71,0.06)',
      }}
    >
      {/* Very subtle star background — reduced to not compete with text */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(1.5px 1.5px at 10% 20%, rgba(255,181,71,0.12) 50%, transparent 100%),
            radial-gradient(1px 1px at 30% 50%, rgba(255,138,0,0.10) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 55% 15%, rgba(255,181,71,0.14) 50%, transparent 100%),
            radial-gradient(1px 1px at 75% 60%, rgba(255,138,0,0.10) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 88% 30%, rgba(255,181,71,0.12) 50%, transparent 100%),
            radial-gradient(1px 1px at 20% 80%, rgba(255,138,0,0.09) 50%, transparent 100%),
            radial-gradient(1px 1px at 65% 85%, rgba(255,181,71,0.11) 50%, transparent 100%)
          `
        }} />
      </div>

      {/* Placement banner background overlay — reduced opacity */}
      {cardStyleImageUrl && (
        <>
          <div
            className="absolute inset-0 pointer-events-none z-[1]"
            style={{
              backgroundImage: `url(${cardStyleImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: isChampagne ? 0.18 : 0.42,
            }}
          />
          {/* Dark gradient: kill left brown block, keep right decoration visible */}
          <div
            className="absolute inset-0 pointer-events-none z-[1]"
            style={{
              background: [
                'linear-gradient(to right,',
                isChampagne ? '  rgba(255,248,236,0.92) 0px,' : '  rgba(10,11,15,0.78) 0px,',
                isChampagne
                  ? `  rgba(255,248,236,0.88) ${compact ? 60 : 88}px,`
                  : `  rgba(10,11,15,0.78) ${compact ? 60 : 88}px,`,
                isChampagne
                  ? `  rgba(255,248,236,0.66) ${compact ? 92 : 130}px,`
                  : `  rgba(10,11,15,0.42) ${compact ? 92 : 130}px,`,
                isChampagne ? '  rgba(255,248,236,0.34) 55%,' : '  rgba(10,11,15,0.20) 55%,',
                isChampagne ? '  rgba(255,248,236,0.20) 100%' : '  rgba(10,11,15,0.14) 100%',
                ')',
              ].join(' '),
            }}
          />
        </>
      )}

      <div className={`flex relative z-[2] ${compact ? 'h-[72px]' : 'h-[112px]'}`}>
        {/* Prize image — left strip */}
        <div
          className={`${compact ? 'w-[60px]' : 'w-[88px]'} flex-shrink-0 flex items-center justify-center overflow-hidden`}
          style={{
            background: isChampagne ? 'rgba(255,244,226,0.85)' : 'rgba(255,138,0,0.06)',
            borderRight: isChampagne ? '1px solid rgba(190,132,58,0.16)' : '1px solid rgba(255,138,0,0.12)',
          }}
        >
          {prizeImageUrl ? (
            <img src={prizeImageUrl} alt={prizeName} className={`w-full h-full object-contain ${compact ? 'p-1' : 'p-1.5'}`} />
          ) : (
            <img src={miocoinImage} alt="MioCoin" className={`${compact ? 'w-8 h-8' : 'w-12 h-12'} object-contain animate-coin-pulse`} />
          )}
        </div>

        {/* Right: info */}
        <CardContent className={`flex-1 overflow-hidden ${compact ? 'px-2.5 py-1.5' : 'px-4 py-3'}`}>
          <div className={`flex items-center h-full ${compact ? 'gap-2' : 'gap-3'}`}>
            {/* Avatar */}
            <Avatar className={`flex-shrink-0 ${compact ? 'w-7 h-7' : 'w-10 h-10'}`} style={{ border: isChampagne ? '1.5px solid rgba(190,132,58,0.28)' : '1.5px solid rgba(255,138,0,0.3)' }}>
              {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={displayName} />}
              <AvatarFallback
                className="text-xs font-bold"
                style={{ background: isChampagne ? 'rgba(255,138,0,0.12)' : 'rgba(255,138,0,0.15)', color: isChampagne ? '#C66A00' : '#FFB547' }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Text block */}
            <div className={`flex-1 min-w-0 flex flex-col justify-center ${compact ? 'gap-0' : 'gap-1'}`}>
              {/* Prize — prominent orange/gold */}
              <div className="flex items-center gap-1.5 min-w-0">
                <OneMilTrophyIcon size={compact ? 12 : 14} className={`flex-shrink-0 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} color="#FF8A00" />
                <span
                  className={`font-bold tracking-wide truncate ${compact ? 'text-xs' : 'text-sm'}`}
                  style={{
                    fontFamily: "'Poppins', system-ui, sans-serif",
                    background: 'linear-gradient(90deg, #FFB547 0%, #FF8A00 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {prizeName}
                </span>
              </div>

              {/* Winner name */}
              <span className={`font-semibold truncate ${compact ? 'text-xs' : 'text-sm'}`} style={{ color: isChampagne ? '#1f2937' : '#E7EBF0' }}>
                {displayName}
              </span>

              {/* Contest + ticket + time row */}
              <div className="flex items-center gap-2 min-w-0">
                <span className={`truncate flex-1 ${compact ? 'text-[10px]' : 'text-xs'}`} style={{ color: isChampagne ? '#64748b' : '#8E98A6' }}>
                  {contestTitle}
                  {ticketNumber != null && (
                    <span className="ml-1.5" style={{ color: isChampagne ? '#8b5e2d' : '#BFC6CF' }}>· #{ticketNumber.toLocaleString('cs-CZ')}</span>
                  )}
                </span>
                <span className={`whitespace-nowrap flex-shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`} style={{ color: isChampagne ? '#8b5e2d' : '#8E98A6' }}>
                  {timeAgo}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
};
