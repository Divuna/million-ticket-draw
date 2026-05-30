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
}: WinnerCardProps) => {
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
        background: 'hsl(220 45% 6%)',
        border: '1px solid rgba(255,138,0,0.22)',
        boxShadow: '0 2px 12px hsl(222 50% 3% / 0.6), inset 0 1px 0 rgba(255,181,71,0.06)',
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
              opacity: 0.28,
            }}
          />
          {/* Dark gradient to tame left brown block + right decoration */}
          <div
            className="absolute inset-0 pointer-events-none z-[1]"
            style={{
              background: [
                'linear-gradient(to right,',
                '  rgba(10,11,15,0.72) 0px,',
                '  rgba(10,11,15,0.72) 88px,',
                '  rgba(10,11,15,0.38) 130px,',
                '  rgba(10,11,15,0.22) 55%,',
                '  rgba(10,11,15,0.52) 100%',
                ')',
              ].join(' '),
            }}
          />
        </>
      )}

      <div className="flex relative z-[2] h-[112px]">
        {/* Prize image — left strip */}
        <div
          className="w-[88px] flex-shrink-0 flex items-center justify-center overflow-hidden"
          style={{ background: 'rgba(255,138,0,0.06)', borderRight: '1px solid rgba(255,138,0,0.12)' }}
        >
          {prizeImageUrl ? (
            <img src={prizeImageUrl} alt={prizeName} className="w-full h-full object-contain p-1.5" />
          ) : (
            <img src={miocoinImage} alt="MioCoin" className="w-12 h-12 object-contain animate-coin-pulse" />
          )}
        </div>

        {/* Right: info */}
        <CardContent className="flex-1 px-4 py-3 overflow-hidden">
          <div className="flex gap-3 items-center h-full">
            {/* Avatar */}
            <Avatar className="w-10 h-10 flex-shrink-0" style={{ border: '1.5px solid rgba(255,138,0,0.3)' }}>
              {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={displayName} />}
              <AvatarFallback
                className="text-xs font-bold"
                style={{ background: 'rgba(255,138,0,0.15)', color: '#FFB547' }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Text block */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              {/* Prize — prominent orange/gold */}
              <div className="flex items-center gap-1.5 min-w-0">
                <OneMilTrophyIcon size={14} className="w-3.5 h-3.5 flex-shrink-0" color="#FF8A00" />
                <span
                  className="text-sm font-bold tracking-wide truncate"
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
              <span className="text-sm font-semibold truncate" style={{ color: '#E7EBF0' }}>
                {displayName}
              </span>

              {/* Contest + ticket + time row */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs truncate flex-1" style={{ color: '#8E98A6' }}>
                  {contestTitle}
                  {ticketNumber != null && (
                    <span className="ml-1.5" style={{ color: '#BFC6CF' }}>· #{ticketNumber.toLocaleString('cs-CZ')}</span>
                  )}
                </span>
                <span className="text-xs whitespace-nowrap flex-shrink-0" style={{ color: '#8E98A6' }}>
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
