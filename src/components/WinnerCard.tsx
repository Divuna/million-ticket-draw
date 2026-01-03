import { Trophy, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cs } from 'date-fns/locale';

interface WinnerCardProps {
  userName: string;
  userNickname: string | null;
  prizeName: string;
  contestTitle: string;
  createdAt: string;
  type: string;
  prizeImageUrl?: string | null;
}

export const WinnerCard = ({ 
  userName, 
  userNickname, 
  prizeName, 
  contestTitle, 
  createdAt,
  type,
  prizeImageUrl
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
    <Card className="rounded-xl overflow-hidden bg-card/60 border border-border/50 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Prize Image Slot - Left Side */}
          <div className="w-28 h-24 flex-shrink-0 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
            {prizeImageUrl ? (
              <img 
                src={prizeImageUrl} 
                alt={prizeName} 
                className="w-full h-full object-cover"
              />
            ) : (
              <Trophy className="w-10 h-10 text-muted-foreground/50" />
            )}
          </div>

          {/* Right Side - Avatar and Info */}
          <div className="flex-1 min-w-0 flex gap-3 items-center">
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
        </div>
      </CardContent>
    </Card>
  );
};