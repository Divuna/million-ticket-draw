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
    <Card className="rounded-xl overflow-hidden bg-transparent border-0 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer relative w-full">
      {/* Base layer - card PNG renders 1:1 with intrinsic aspect ratio */}
      {cardStyleImageUrl && (
        <img 
          src={cardStyleImageUrl}
          alt=""
          className="w-full h-auto block"
        />
      )}
      
      {/* Content overlay - absolutely positioned above PNG */}
      <div className="absolute inset-0 flex z-10">
        {/* Prize Image Slot - Left Side (35% width) */}
        <div className="w-[35%] flex-shrink-0 flex items-center justify-center overflow-hidden">
          {prizeImageUrl ? (
            <img 
              src={prizeImageUrl} 
              alt={prizeName} 
              className="w-full h-full object-cover"
            />
          ) : (
            <img 
              src={miocoinImage} 
              alt="MioCoin" 
              className="w-16 h-16 object-contain animate-coin-pulse"
            />
          )}
        </div>

        {/* Right Side - Avatar and Info */}
        <CardContent className="flex-1 p-4 flex items-center">
          <div className="flex gap-3 items-center w-full">
            {/* Avatar */}
            <Avatar className="w-12 h-12 border-2 border-primary/20 flex-shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Winner Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-bold text-foreground text-sm line-clamp-1">
                  {userNickname || userName}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs font-semibold text-primary line-clamp-1">
                  {prizeName}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {contestTitle}
                </span>
                <Badge variant="secondary" className="text-xs whitespace-nowrap">
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