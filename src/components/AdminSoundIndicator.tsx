import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Wifi, WifiOff, Users, Gamepad2, CreditCard, Banknote, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAdminPresenceCount } from '@/hooks/useAdminPresenceCount';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';
import { cs } from 'date-fns/locale';

interface AdminSoundIndicatorProps {
  soundEnabled: boolean;
  realtimeConnected: boolean;
  lastRealtimeEvent: Date | null;
  onToggleSound: () => void;
}

interface AdminStats {
  gamesToday: number;
  paymentsToday: number;
  revenueToday: number;
}

interface OnlineUserInfo {
  userId: string;
  email: string;
  name: string | null;
  onlineAt: string;
}

export const AdminSoundIndicator: React.FC<AdminSoundIndicatorProps> = ({
  soundEnabled,
  realtimeConnected,
  lastRealtimeEvent,
  onToggleSound,
}) => {
  const [isPulsing, setIsPulsing] = useState(false);
  const [stats, setStats] = useState<AdminStats>({ gamesToday: 0, paymentsToday: 0, revenueToday: 0 });
  const { onlineCount, onlineUsers, onUserJoin } = useAdminPresenceCount();
  const [onlineUserDetails, setOnlineUserDetails] = useState<OnlineUserInfo[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const userJoinAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize user join sound
  useEffect(() => {
    userJoinAudioRef.current = new Audio('/sounds/notification.mp3');
    userJoinAudioRef.current.volume = 0.5;
  }, []);

  // Register callback for user join - play sound
  useEffect(() => {
    onUserJoin((userId) => {
      if (soundEnabled && userJoinAudioRef.current) {
        console.log('[AdminSound] User joined, playing notification:', userId);
        userJoinAudioRef.current.currentTime = 0;
        userJoinAudioRef.current.play().catch(err => {
          console.warn('[AdminSound] Could not play user join sound:', err);
        });
      }
    });
  }, [onUserJoin, soundEnabled]);

  // Pulse animation when new event occurs
  useEffect(() => {
    if (!lastRealtimeEvent) return;
    
    setIsPulsing(true);
    const timeout = setTimeout(() => setIsPulsing(false), 1000);
    
    return () => clearTimeout(timeout);
  }, [lastRealtimeEvent]);

  // Fetch user details when online users change
  useEffect(() => {
    const fetchUserDetails = async () => {
      if (onlineUsers.length === 0) {
        setOnlineUserDetails([]);
        return;
      }

      setIsLoadingUsers(true);
      try {
        const userIds = onlineUsers.map(u => u.userId);
        const { data: users, error } = await supabase
          .from('users')
          .select('id, email, name, first_name, last_name, nickname')
          .in('id', userIds);

        if (error) {
          console.error('[AdminPresence] Error fetching user details:', error);
          return;
        }

        const details: OnlineUserInfo[] = onlineUsers.map(ou => {
          const user = users?.find(u => u.id === ou.userId);
          const displayName = user?.nickname || user?.name || 
            (user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : null) ||
            user?.first_name || null;
          
          return {
            userId: ou.userId,
            email: user?.email || 'Neznámý',
            name: displayName,
            onlineAt: ou.onlineAt,
          };
        });

        setOnlineUserDetails(details);
      } catch (error) {
        console.error('[AdminPresence] Error:', error);
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUserDetails();
  }, [onlineUsers]);

  // Fetch admin stats (excluding online count which is now live via Presence)
  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      try {
        // Games today: count of tickets created today
        const { count: gamesToday } = await supabase
          .from('tickets')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart);

        // Payments today: count and sum of completed payments today
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('amount')
          .gte('created_at', todayStart)
          .eq('status', 'completed');

        const paymentsToday = paymentsData?.length || 0;
        const revenueToday = paymentsData?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

        setStats({
          gamesToday: gamesToday || 0,
          paymentsToday,
          revenueToday,
        });
      } catch (error) {
        console.error('[AdminStats] Error fetching stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3">
      {/* Unified sound + connection component */}
      <div className="flex items-center bg-background/50 rounded-lg border border-border/50 overflow-hidden">
        {/* Sound toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSound}
          className={cn(
            "h-8 w-8 p-0 rounded-none border-r border-border/50 transition-all duration-200",
            isPulsing && "animate-pulse"
          )}
          title={soundEnabled ? "Zvuk zapnutý" : "Zvuk vypnutý"}
        >
          {soundEnabled ? (
            <Volume2 className={cn(
              "h-4 w-4 transition-colors",
              isPulsing ? "text-primary" : "text-green-500"
            )} />
          ) : (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>

        {/* Connection status badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs font-medium",
            realtimeConnected 
              ? "text-green-400" 
              : "text-destructive"
          )}
          title={realtimeConnected ? "Realtime připojeno" : "Realtime odpojeno"}
        >
          {realtimeConnected ? (
            <>
              <Wifi className="h-3 w-3" />
              <span className="hidden sm:inline">Připojeno</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              <span className="hidden sm:inline">Odpojeno</span>
            </>
          )}
        </div>
      </div>

      {/* Admin stats indicators */}
      <div className="hidden md:flex items-center gap-2">
        {/* Online teď - LIVE via Supabase Presence with dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-1.5 px-2 py-1 bg-background/50 rounded-md border border-border/50 text-xs hover:bg-background/80 transition-colors cursor-pointer"
              title="Online uživatelé (živě) - klikni pro detaily"
            >
              <Users className="h-3 w-3 text-blue-400" />
              <span className="text-muted-foreground">Online teď:</span>
              <span className="font-medium text-foreground">{onlineCount}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-80 p-0 bg-background border border-border shadow-lg z-50" 
            align="start"
          >
            <div className="p-3 border-b border-border">
              <h4 className="font-medium text-sm">Online uživatelé ({onlineCount})</h4>
              <p className="text-xs text-muted-foreground">Aktuálně připojení hráči</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {isLoadingUsers ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Načítám...
                </div>
              ) : onlineUserDetails.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Žádní online uživatelé
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {onlineUserDetails.map((user) => (
                    <li key={user.userId} className="p-3 hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user.name || user.email}
                          </p>
                          {user.name && (
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Online {formatDistanceToNow(new Date(user.onlineAt), { addSuffix: true, locale: cs })}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Hry dnes */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1 bg-background/50 rounded-md border border-border/50 text-xs"
          title="Počet odehraných her dnes"
        >
          <Gamepad2 className="h-3 w-3 text-purple-400" />
          <span className="text-muted-foreground">Hry dnes:</span>
          <span className="font-medium text-foreground">{stats.gamesToday}</span>
        </div>

        {/* Dobito dnes */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1 bg-background/50 rounded-md border border-border/50 text-xs"
          title="Počet dokončených plateb dnes"
        >
          <CreditCard className="h-3 w-3 text-green-400" />
          <span className="text-muted-foreground">Dobito dnes:</span>
          <span className="font-medium text-foreground">{stats.paymentsToday}</span>
        </div>

        {/* Tržba dnes */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1 bg-background/50 rounded-md border border-border/50 text-xs"
          title="Celková tržba z dobití dnes"
        >
          <Banknote className="h-3 w-3 text-yellow-400" />
          <span className="text-muted-foreground">Tržba dnes:</span>
          <span className="font-medium text-foreground">{stats.revenueToday.toLocaleString('cs-CZ')} Kč</span>
        </div>
      </div>
    </div>
  );
};
