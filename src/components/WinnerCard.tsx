import { Trophy, User, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  type,
  prizeImageUrl,
  cardStyleImageUrl,
  userAvatarUrl,
  ticketNumber
}: WinnerCardProps) => {
  const initials = (userNickname || userName)
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const timeAgo = formatDistanceToNow(new Date(createdAt), { 
    addSuffix: true,
    locale: cs 
  });

  return (
    <Card className="rounded-xl overflow-hidden bg-[hsl(220_30%_8%)] border border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer relative h-[120px]">
      {/* Stars/Particles Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Star pattern layer */}
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(1.5px 1.5px at 8% 20%, hsla(45, 80%, 70%, 0.7) 50%, transparent 100%),
            radial-gradient(1px 1px at 20% 45%, hsla(45, 70%, 60%, 0.5) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 35% 15%, hsla(45, 85%, 75%, 0.8) 50%, transparent 100%),
            radial-gradient(1px 1px at 50% 55%, hsla(45, 75%, 65%, 0.4) 50%, transparent 100%),
            radial-gradient(2px 2px at 65% 25%, hsla(45, 90%, 80%, 0.9) 50%, transparent 100%),
            radial-gradient(1px 1px at 80% 60%, hsla(45, 70%, 60%, 0.5) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 92% 35%, hsla(45, 80%, 70%, 0.6) 50%, transparent 100%),
            radial-gradient(1px 1px at 15% 75%, hsla(45, 75%, 65%, 0.4) 50%, transparent 100%),
            radial-gradient(1px 1px at 45% 85%, hsla(45, 70%, 60%, 0.5) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 70% 80%, hsla(45, 85%, 75%, 0.7) 50%, transparent 100%),
            radial-gradient(1px 1px at 88% 90%, hsla(45, 75%, 65%, 0.4) 50%, transparent 100%)
          `
        }} />
        {/* Subtle golden ambient glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.02] via-transparent to-amber-400/[0.02]" />
      </div>
      
      {/* Decorative background layer from placement banner (on top of stars if provided) */}
      {cardStyleImageUrl && (
        <div 
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            backgroundImage: `url(${cardStyleImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      
      <div className="flex relative z-[2] h-full">
        {/* Prize Image Slot - Left Side (fixed width, full height) */}
        <div className="w-[100px] flex-shrink-0 bg-muted/50 flex items-center justify-center overflow-hidden">
          {prizeImageUrl ? (
            <img 
              src={prizeImageUrl} 
              alt={prizeName} 
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <img 
              src={miocoinImage} 
              alt="MioCoin" 
              className="w-14 h-14 object-contain animate-coin-pulse"
            />
          )}
        </div>

        {/* Right Side - Avatar and Info */}
        <CardContent className="flex-1 p-4 overflow-hidden">
          <div className="flex gap-3 items-center h-full">
            {/* Avatar */}
            <Avatar className="w-11 h-11 border-2 border-primary/20 flex-shrink-0">
              {userAvatarUrl && (
                <AvatarImage src={userAvatarUrl} alt={userNickname || userName} />
              )}
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Winner Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              {/* Contest */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Target className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                <span className="text-sm font-medium text-muted-foreground/80 leading-tight truncate">
                  Soutěž: {contestTitle}
                </span>
              </div>
              {/* Prize */}
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-secondary flex-shrink-0" />
                <span className="text-base font-semibold text-secondary tracking-wide leading-tight truncate">
                  Cena: {prizeName}
                </span>
              </div>
              {/* Winning ticket */}
              {ticketNumber != null && (
                <div className="flex items-center gap-2 text-sm text-foreground/90">
                  <span className="text-muted-foreground">Výherní tiket:</span>
                  <span className="font-semibold">#{ticketNumber.toLocaleString('cs-CZ')}</span>
                </div>
              )}
              {/* Winner + time */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <User className="w-4 h-4 text-foreground/80 flex-shrink-0" />
                  <span className="font-bold text-foreground text-sm tracking-tight leading-tight truncate">
                    Výherce: {userNickname || userName}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs font-medium px-2 py-0.5 text-muted-foreground/70 border-muted-foreground/30 whitespace-nowrap flex-shrink-0">
                  {timeAgo}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
};