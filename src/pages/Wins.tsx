import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminMenu } from '@/components/AdminMenu';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Filter, ArrowUp, ArrowDown, Gift, Sparkles, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WinCard } from '@/components/WinCard';
import { WinDetailModal } from '@/components/WinDetailModal';
import { toast } from '@/hooks/use-toast';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { Badge } from '@/components/ui/badge';
import { useUnseenWinsCount } from '@/hooks/useUnseenWinsCount';

type UiStatus = 'čeká' | 'odesláno' | 'doručeno';

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
  ui_status: UiStatus;
}

// Helper to derive ui_status from win data
const deriveUiStatus = (delivered: boolean, notes: string | null): UiStatus => {
  if (delivered) return 'doručeno';
  if (notes && notes.toLowerCase().includes('odesláno')) return 'odesláno';
  return 'čeká';
};

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
    
    // Apply status filter based on ui_status
    if (filter !== 'all') {
      result = result.filter(win => {
        if (filter === 'delivered') return win.ui_status === 'doručeno';
        if (filter === 'shipped') return win.ui_status === 'odesláno';
        if (filter === 'pending') return win.ui_status === 'čeká';
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

  // Count wins by ui_status for badges
  const statusCounts = useMemo(() => ({
    all: wins.length,
    pending: wins.filter(w => w.ui_status === 'čeká').length,
    shipped: wins.filter(w => w.ui_status === 'odesláno').length,
    delivered: wins.filter(w => w.ui_status === 'doručeno').length,
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
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
        await supabase.rpc('mark_wins_as_seen');
        refreshUnseenWins();
      }

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
      
      const dob = data?.date_of_birth;
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
          
          const newDelivered = payload.new.delivered as boolean;
          const newNotes = payload.new.notes as string | null;
          setWins(prev => prev.map(win => 
            win.id === winId 
              ? { ...win, status: newStatus, delivered: newDelivered, notes: newNotes, ui_status: deriveUiStatus(newDelivered, newNotes) }
              : win
          ));
          
          if (soundEnabled) {
            playNotificationSound();
          }
          
          toast({
            title: "Stav výhry aktualizován",
            description: `Nový stav: ${newStatus || 'Čeká na potvrzení'}`,
          });
          
          setHighlightedWins(prev => new Set(prev).add(winId));
          
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
        bonus_prize: win.prize_id ? prizesMap.get(win.prize_id) || null : null,
        ui_status: deriveUiStatus(win.delivered, win.notes)
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
      <div className="min-h-screen bg-gradient-to-b from-[hsl(220,20%,4%)] via-[hsl(220,25%,6%)] to-[hsl(220,20%,4%)] pb-20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <p className="text-gray-400 text-center">Pro zobrazení výher se musíte přihlásit.</p>
        </main>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(220,20%,4%)] via-[hsl(220,25%,6%)] to-[hsl(220,20%,4%)] relative overflow-hidden pb-20">
      {/* Premium floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(25)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: `radial-gradient(circle, hsl(45, 93%, ${50 + Math.random() * 20}%) 0%, transparent 70%)`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.15 + Math.random() * 0.15,
              animation: `float ${8 + Math.random() * 12}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Premium shimmer overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          background: 'linear-gradient(45deg, transparent 30%, hsl(45, 93%, 60%) 50%, transparent 70%)',
          backgroundSize: '200% 200%',
          animation: 'shimmer 8s ease-in-out infinite',
        }}
      />

      <Header />
      
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Premium Header Card */}
        <div 
          className="relative overflow-hidden rounded-2xl p-6 mb-8"
          style={{
            background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
            border: '1px solid hsl(45, 70%, 40%, 0.2)',
            boxShadow: '0 8px 32px hsl(0, 0%, 0%, 0.4), inset 0 1px 0 hsl(45, 70%, 50%, 0.1)',
          }}
        >
          {/* Header shimmer */}
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 60%) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 4s ease-in-out infinite',
            }}
          />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 35%) 100%)',
                  boxShadow: '0 4px 20px hsl(45, 80%, 40%, 0.3)',
                }}
              >
                <Trophy className="w-8 h-8 text-black" />
              </div>
              
              <div>
                <h1 
                  className="text-3xl font-bold tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, hsl(45, 93%, 65%) 0%, hsl(35, 90%, 55%) 50%, hsl(45, 93%, 65%) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Moje výhry
                </h1>
                <p className="text-gray-400 mt-1">Přehled všech vašich výher</p>
              </div>
            </div>

            {wins.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(45,80%,45%)]/10 border border-[hsl(45,70%,50%)]/20">
                <Crown className="w-5 h-5 text-[hsl(45,80%,55%)]" />
                <span className="text-lg font-bold text-[hsl(45,80%,60%)]">{wins.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter and Sort Controls */}
        {wins.length > 0 && (
          <div 
            className="relative overflow-hidden rounded-2xl p-5 mb-6 space-y-4"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 10%) 100%)',
              border: '1px solid hsl(220, 20%, 18%)',
              boxShadow: '0 4px 16px hsl(0, 0%, 0%, 0.3)',
            }}
          >
            {/* Type Filter */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-400 font-medium">Typ:</span>
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                  typeFilter === 'all' 
                    ? 'bg-gradient-to-r from-[hsl(45,80%,45%)] to-[hsl(35,90%,35%)] text-black shadow-[0_4px_16px_hsl(45,80%,40%,0.3)]' 
                    : 'bg-[hsl(220,25%,12%)] text-gray-300 border border-[hsl(220,20%,20%)] hover:border-[hsl(45,70%,50%)]/30'
                }`}
              >
                Všechny ({typeCounts.all})
              </button>
              <button
                onClick={() => setTypeFilter('main')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                  typeFilter === 'main' 
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-[0_4px_16px_rgba(245,158,11,0.3)]' 
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Hlavní ({typeCounts.main})
              </button>
              <button
                onClick={() => setTypeFilter('bonus')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                  typeFilter === 'bonus' 
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-[0_4px_16px_rgba(168,85,247,0.3)]' 
                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20'
                }`}
              >
                <Gift className="w-4 h-4" />
                Bonus ({typeCounts.bonus})
              </button>
            </div>

            {/* Status Filter and Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-[hsl(220,20%,15%)]">
              {/* Status Filter Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <Filter className="w-4 h-4 text-gray-500" />
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    filter === 'all' 
                      ? 'bg-gradient-to-r from-[hsl(45,80%,45%)] to-[hsl(35,90%,35%)] text-black shadow-[0_4px_16px_hsl(45,80%,40%,0.3)]' 
                      : 'bg-[hsl(220,25%,12%)] text-gray-300 border border-[hsl(220,20%,20%)] hover:border-[hsl(45,70%,50%)]/30'
                  }`}
                >
                  Všechny ({statusCounts.all})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    filter === 'pending' 
                      ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black shadow-[0_4px_16px_rgba(234,179,8,0.3)]' 
                      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20'
                  }`}
                >
                  Čeká ({statusCounts.pending})
                </button>
                <button
                  onClick={() => setFilter('shipped')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    filter === 'shipped' 
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)]' 
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
                  }`}
                >
                  Odesláno ({statusCounts.shipped})
                </button>
                <button
                  onClick={() => setFilter('delivered')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    filter === 'delivered' 
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-[0_4px_16px_rgba(34,197,94,0.3)]' 
                      : 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                  }`}
                >
                  Doručeno ({statusCounts.delivered})
                </button>
              </div>

              {/* Sort Toggle */}
              <button
                onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[hsl(220,25%,12%)] border border-[hsl(220,20%,20%)] hover:border-[hsl(45,70%,50%)]/30 transition-all duration-300 text-sm text-gray-300 hover:text-white"
              >
                {sortOrder === 'newest' ? (
                  <ArrowDown className="w-4 h-4 text-[hsl(45,70%,50%)]" />
                ) : (
                  <ArrowUp className="w-4 h-4 text-[hsl(45,70%,50%)]" />
                )}
                {sortOrder === 'newest' ? 'Nejnovější' : 'Nejstarší'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{
                  background: 'linear-gradient(135deg, hsl(220, 25%, 10%) 0%, hsl(220, 30%, 14%) 100%)',
                  border: '1px solid hsl(220, 20%, 18%)',
                }}
              >
                <div className="w-full h-64 bg-[hsl(220,25%,15%)]" />
              </div>
            ))}
          </div>
        ) : wins.length === 0 ? (
          <div 
            className="relative overflow-hidden rounded-2xl p-12 text-center"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
              border: '1px solid hsl(45, 70%, 40%, 0.15)',
              boxShadow: '0 8px 32px hsl(0, 0%, 0%, 0.3)',
            }}
          >
            <div 
              className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 16%) 100%)',
                border: '1px solid hsl(45, 70%, 40%, 0.1)',
              }}
            >
              <Trophy className="w-12 h-12 text-[hsl(45,70%,50%)]/30" />
            </div>
            <h3 
              className="text-2xl font-bold mb-3"
              style={{
                background: 'linear-gradient(135deg, hsl(45, 93%, 65%) 0%, hsl(35, 90%, 55%) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Zatím nemáte žádné výhry
            </h3>
            <p className="text-gray-400 text-lg">Kupte si tikety v soutěžích a vyhrajte skvělé ceny!</p>
          </div>
        ) : filteredWins.length === 0 ? (
          <div 
            className="relative overflow-hidden rounded-2xl p-12 text-center"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 100%)',
              border: '1px solid hsl(220, 20%, 18%)',
            }}
          >
            <Filter className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">Žádné výhry v této kategorii</h3>
            <p className="text-gray-500">Zkuste jiný filtr pro zobrazení výher.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWins.map((win, index) => (
              <div
                key={win.id}
                className="transform transition-all duration-500 hover:scale-[1.02]"
                style={{
                  animation: `fade-in 0.5s ease-out ${index * 0.1}s both`,
                }}
              >
                <WinCard
                  win={win}
                  onClick={() => setSelectedWin(win)}
                  isHighlighted={highlightedWins.has(win.id)}
                />
              </div>
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

      {/* Global animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          25% { transform: translateY(-20px) translateX(10px); }
          50% { transform: translateY(-10px) translateX(-5px); }
          75% { transform: translateY(-30px) translateX(15px); }
        }
        
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Wins;
