import { Trophy, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
}

export const WinnerCard = ({ 
  userName, 
  userNickname, 
  prizeName, 
  contestTitle, 
  createdAt,
  type,
  prizeImageUrl,
  cardStyleImageUrl
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
    <Card className="rounded-xl overflow-hidden bg-card/60 border border-border/50 hover:bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer relative h-[120px]">
      {/* Decorative background layer from placement banner */}
      {cardStyleImageUrl && (
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${cardStyleImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      
      <div className="flex relative z-10 h-full">
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
        <CardContent className="flex-1 p-3 overflow-hidden">
          <div className="flex gap-2 items-center h-full">
            {/* Avatar */}
            <Avatar className="w-10 h-10 border-2 border-primary/20 flex-shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Winner Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              {/* Primary: Winner name */}
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-foreground/70 flex-shrink-0" />
                <span className="font-semibold text-foreground text-sm leading-tight truncate">
                  {userNickname || userName}
                </span>
              </div>
              
              {/* Secondary: Prize name */}
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3 h-3 text-primary/80 flex-shrink-0" />
                <span className="text-xs font-medium text-primary/90 leading-tight truncate">
                  {prizeName}
                </span>
              </div>

              {/* Tertiary: Contest + time */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground/70 leading-tight truncate flex-1">
                  {contestTitle}
                </span>
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 opacity-70 whitespace-nowrap flex-shrink-0">
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