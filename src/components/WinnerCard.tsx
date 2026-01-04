import { Trophy, User, Sparkles } from 'lucide-react';
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
        <CardContent className="flex-1 p-4 overflow-hidden">
          <div className="flex gap-3 items-center h-full">
            {/* Avatar */}
            <Avatar className="w-11 h-11 border-2 border-primary/20 flex-shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Winner Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              {/* Primary: Winner name - bold, bright, prominent */}
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-foreground/80 flex-shrink-0" />
                <span className="font-bold text-foreground text-lg tracking-tight leading-tight truncate">
                  {userNickname || userName}
                </span>
              </div>
              
              {/* Secondary: Prize name - gold accent, strong visibility */}
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-secondary flex-shrink-0" />
                <span className="text-base font-semibold text-secondary tracking-wide leading-tight truncate">
                  {prizeName}
                </span>
              </div>

              {/* Tertiary: Contest + time */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Sparkles className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground/80 leading-tight truncate">
                    {contestTitle}
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