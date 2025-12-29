import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminMenu } from '@/components/AdminMenu';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Filter, ArrowUp, ArrowDown, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WinCard } from '@/components/WinCard';
import { WinDetailModal } from '@/components/WinDetailModal';
import { toast } from '@/hooks/use-toast';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { Badge } from '@/components/ui/badge';
import { useUnseenWinsCount } from '@/hooks/useUnseenWinsCount';

interface Win {
  id: string;
  type: string;
  status: string | null;
  delivered: boolean;
  notes: string | null;
  created_at: string;
  contest_id: string;
  prize_id: string | null;
  contest: {
    id: string;
    title: string;
    main_prize: string;
    main_image: string | null;
    main_prize_secondary_image: string | null;
  } | null;
  bonus_prize: {
    id: string;
    title: string | null;
    image_url: string | null;
    guardian_required: boolean | null;
  } | null;
}

type FilterStatus = 'all' | 'pending' | 'shipped' | 'delivered';
type FilterType = 'all' | 'main' | 'bonus';
type SortOrder = 'newest' | 'oldest';

const Wins: React.FC = () => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { soundEnabled } = useNotificationSettings();
  const { refresh: refreshUnseenWins } = useUnseenWinsCount();
  const [wins, setWins] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedWins, setHighlightedWins] = useState<Set<string>>(new Set());
  const [selectedWin, setSelectedWin] = useState<Win | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [userAge, setUserAge] = useState<number | null>(null);

  // Filter and sort wins
  const filteredWins = useMemo(() => {
    let result = wins;
    
    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter(win => win.type === typeFilter);
    }
    
    // Apply status filter
    if (filter !== 'all') {
      result = result.filter(win => {
        if (filter === 'delivered') {
          return win.delivered || win.status === 'vyplaceno';
        }
        if (filter === 'shipped') {
          return win.status === 'odesláno' || win.status === 'připraveno k odeslání';
        }
        if (filter === 'pending') {
          return !win.delivered && win.status !== 'vyplaceno' && win.status !== 'odesláno' && win.status !== 'připraveno k odeslání';
        }
        return true;
      });
    }
    
    // Apply sort
    return [...result].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [wins, filter, typeFilter, sortOrder]);

  // Count wins by status for badges
  const statusCounts = useMemo(() => ({
    all: wins.length,
    pending: wins.filter(w => !w.delivered && w.status !== 'vyplaceno' && w.status !== 'odesláno' && w.status !== 'připraveno k odeslání').length,
    shipped: wins.filter(w => w.status === 'odesláno' || w.status === 'připraveno k odeslání').length,
    delivered: wins.filter(w => w.delivered || w.status === 'vyplaceno').length,
  }), [wins]);

  // Count wins by type for badges
  const typeCounts = useMemo(() => ({
    all: wins.length,
    main: wins.filter(w => w.type === 'main').length,
    bonus: wins.filter(w => w.type === 'bonus').length,
  }), [wins]);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      // Create audio context for a simple notification tone
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Could not play notification sound:', error);
    }
  }, []);

  // Mark wins as seen and fetch data on page load (non-admin users only)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const initPage = async () => {
      // Mark wins as seen via SQL function (only for non-admin users)
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
        await supabase.rpc('mark_wins_as_seen');
        refreshUnseenWins();
      }

      // Fetch wins and user age
      fetchWins();
      fetchUserAge();
    };

    initPage();
  }, [user]);

  const fetchUserAge = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('date_of_birth')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user age:', error);
        return;
      }
      
      const dob = (data as any)?.date_of_birth;
      if (dob) {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        setUserAge(age);
      }
    } catch (error) {
      console.error('Error fetching user age:', error);
    }
  };

  // Realtime subscription for winner status updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('wins-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'winners',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const winId = payload.new.id as string;
          const newStatus = payload.new.status as string;
          
          // Update the specific win in state
          setWins(prev => prev.map(win => 
            win.id === winId 
              ? { ...win, status: newStatus, delivered: payload.new.delivered }
              : win
          ));
          
          // Play notification sound (if enabled)
          if (soundEnabled) {
            playNotificationSound();
          }
          
          // Show toast notification
          toast({
            title: "Stav výhry aktualizován",
            description: `Nový stav: ${newStatus || 'Čeká na potvrzení'}`,
          });
          
          // Highlight the updated win
          setHighlightedWins(prev => new Set(prev).add(winId));
          
          // Remove highlight after 2 seconds
          setTimeout(() => {
            setHighlightedWins(prev => {
              const next = new Set(prev);
              next.delete(winId);
              return next;
            });
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchWins = async () => {
    if (!user) return;

    try {
      const { data: winsData, error: winsError } = await supabase
        .from('winners')
        .select('id, type, status, delivered, notes, created_at, contest_id, prize_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (winsError) throw winsError;
      if (!winsData || winsData.length === 0) {
        setWins([]);
        return;
      }

      const contestIds = [...new Set(winsData.map(w => w.contest_id).filter(Boolean))] as string[];
      const prizeIds = [...new Set(winsData.map(w => w.prize_id).filter(Boolean))] as string[];

      let contestsMap = new Map<string, any>();
      if (contestIds.length > 0) {
        const { data: contestsData } = await supabase
          .from('contests')
          .select('id, title, main_prize, main_image, main_prize_secondary_image')
          .in('id', contestIds);
        
        if (contestsData) {
          contestsMap = new Map(contestsData.map(c => [c.id, c]));
        }
      }

      let prizesMap = new Map<string, any>();
      if (prizeIds.length > 0) {
        const { data: prizesData } = await supabase
          .from('bonus_prizes')
          .select('id, title, image_url, guardian_required')
          .in('id', prizeIds);
        
        if (prizesData) {
          prizesMap = new Map(prizesData.map(p => [p.id, p]));
        }
      }

      const transformedWins: Win[] = winsData.map(win => ({
        ...win,
        contest: contestsMap.get(win.contest_id) || null,
        bonus_prize: win.prize_id ? prizesMap.get(win.prize_id) || null : null
      }));

      setWins(transformedWins);
    } catch (error) {
      console.error('Error fetching wins:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <p className="text-muted-foreground text-center">Pro zobrazení výher se musíte přihlásit.</p>
        </main>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="h-8 w-8 text-yellow-500" />
          <h1 className="text-2xl font-bold text-foreground">Moje výhry</h1>
        </div>

        {/* Filter and Sort Controls */}
        {wins.length > 0 && (
          <div className="space-y-4 mb-6">
            {/* Type Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground mr-1">Typ:</span>
              <Badge
                variant={typeFilter === 'all' ? 'default' : 'outline'}
                className={`cursor-pointer transition-colors ${typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setTypeFilter('all')}
              >
                Všechny ({typeCounts.all})
              </Badge>
              <Badge
                variant={typeFilter === 'main' ? 'default' : 'outline'}
                className={`cursor-pointer transition-colors ${typeFilter === 'main' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'}`}
                onClick={() => setTypeFilter('main')}
              >
                <Trophy className="w-3 h-3 mr-1" />
                Hlavní ({typeCounts.main})
              </Badge>
              <Badge
                variant={typeFilter === 'bonus' ? 'default' : 'outline'}
                className={`cursor-pointer transition-colors ${typeFilter === 'bonus' ? 'bg-purple-500 text-white border-purple-500' : 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'}`}
                onClick={() => setTypeFilter('bonus')}
              >
                <Gift className="w-3 h-3 mr-1" />
                Bonus ({typeCounts.bonus})
              </Badge>
            </div>

            {/* Status Filter and Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Status Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Badge
                  variant={filter === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  onClick={() => setFilter('all')}
                >
                  Všechny ({statusCounts.all})
                </Badge>
                <Badge
                  variant={filter === 'pending' ? 'default' : 'outline'}
                  className={`cursor-pointer transition-colors ${filter === 'pending' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20'}`}
                  onClick={() => setFilter('pending')}
                >
                  Čeká ({statusCounts.pending})
                </Badge>
                <Badge
                  variant={filter === 'shipped' ? 'default' : 'outline'}
                  className={`cursor-pointer transition-colors ${filter === 'shipped' ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'}`}
                  onClick={() => setFilter('shipped')}
                >
                  Odesláno ({statusCounts.shipped})
                </Badge>
                <Badge
                  variant={filter === 'delivered' ? 'default' : 'outline'}
                  className={`cursor-pointer transition-colors ${filter === 'delivered' ? 'bg-green-500 text-white border-green-500' : 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'}`}
                  onClick={() => setFilter('delivered')}
                >
                  Doručeno ({statusCounts.delivered})
                </Badge>
              </div>

              {/* Sort Toggle */}
              <button
                onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground"
              >
                {sortOrder === 'newest' ? (
                  <ArrowDown className="w-4 h-4" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
                {sortOrder === 'newest' ? 'Nejnovější' : 'Nejstarší'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-muted/40 animate-pulse">
                <div className="w-full h-64 bg-muted/60" />
              </div>
            ))}
          </div>
        ) : wins.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-xl font-semibold mb-2">Zatím nemáte žádné výhry</h3>
            <p className="text-muted-foreground">Kupte si tikety v soutěžích a vyhrajte skvělé ceny!</p>
          </div>
        ) : filteredWins.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-xl font-semibold mb-2">Žádné výhry v této kategorii</h3>
            <p className="text-muted-foreground">Zkuste jiný filtr pro zobrazení výher.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWins.map((win) => (
              <WinCard
                key={win.id}
                win={win}
                onClick={() => setSelectedWin(win)}
                isHighlighted={highlightedWins.has(win.id)}
              />
            ))}
          </div>
        )}

        {/* Win Detail Modal */}
        <WinDetailModal
          win={selectedWin}
          open={!!selectedWin}
          onClose={() => setSelectedWin(null)}
          onNavigateToContest={(contestId) => navigate(`/contest/${contestId}`)}
          userAge={userAge}
        />
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Wins;
