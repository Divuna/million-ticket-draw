import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { LoggedOutScreen } from '@/components/LoggedOutScreen';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, ArrowUp, ArrowDown, Tag } from 'lucide-react';
import { OneMilFilterIcon, OneMilGiftIcon, OneMilDiamondIcon, OneMilTrophyIcon, OneMilWinIcon } from '@/components/icons/OneMilIcons';
import { useNavigate } from 'react-router-dom';
import { WinCard } from '@/components/WinCard';
import { WinDetailModal } from '@/components/WinDetailModal';
import { OfferCard, type UserOffer } from '@/components/OfferCard';
import { OfferDetailModal } from '@/components/OfferDetailModal';
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
// Uses backend status values first, then falls back to notes markers for older rows.
const deriveUiStatus = (
  delivered: boolean,
  status: string | null,
  notes: string | null
): UiStatus => {
  if (delivered || status === 'delivered') return 'doručeno';
  if (status === 'shipped') return 'odesláno';
  if (notes && notes.toLowerCase().includes('shipped')) return 'odesláno';
  return 'čeká';
};

type FilterStatus = 'all' | 'pending' | 'shipped' | 'delivered';
type FilterType = 'all' | 'main' | 'bonus';
type SortOrder = 'newest' | 'oldest';
type ActiveTab = 'vyhry' | 'nabidky';

const Wins: React.FC = () => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { soundEnabled } = useNotificationSettings();
  const { refresh: refreshUnseenWins } = useUnseenWinsCount();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('vyhry');

  // ── Wins state ─────────────────────────────────────────────────────────────
  const [wins, setWins] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedWins, setHighlightedWins] = useState<Set<string>>(new Set());
  const [selectedWin, setSelectedWin] = useState<Win | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [userAge, setUserAge] = useState<number | null>(null);

  // ── Offers state ───────────────────────────────────────────────────────────
  const [offers, setOffers] = useState<UserOffer[]>([]);
  const [offerLoading, setOfferLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<UserOffer | null>(null);

  // ── Filter and sort wins ───────────────────────────────────────────────────
  const filteredWins = useMemo(() => {
    let result = wins;

    if (typeFilter !== 'all') {
      result = result.filter(win => win.type === typeFilter);
    }

    if (filter !== 'all') {
      result = result.filter(win => {
        if (filter === 'delivered') return win.ui_status === 'doručeno';
        if (filter === 'shipped') return win.ui_status === 'odesláno';
        if (filter === 'pending') return win.ui_status === 'čeká';
        return true;
      });
    }

    return [...result].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [wins, filter, typeFilter, sortOrder]);

  const statusCounts = useMemo(() => ({
    all: wins.length,
    pending: wins.filter(w => w.ui_status === 'čeká').length,
    shipped: wins.filter(w => w.ui_status === 'odesláno').length,
    delivered: wins.filter(w => w.ui_status === 'doručeno').length,
  }), [wins]);

  const typeCounts = useMemo(() => ({
    all: wins.length,
    main: wins.filter(w => w.type === 'main').length,
    bonus: wins.filter(w => w.type === 'bonus').length,
  }), [wins]);

  // ── Notification sound ─────────────────────────────────────────────────────
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

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setOfferLoading(false);
      return;
    }

    const initPage = async () => {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleData?.role !== 'admin' && roleData?.role !== 'superadmin') {
        await supabase.rpc('mark_wins_as_seen');
        refreshUnseenWins();
      }

      fetchWins();
      fetchOffers();
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

  // ── Realtime: win status updates ───────────────────────────────────────────
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
              ? { ...win, status: newStatus, delivered: newDelivered, notes: newNotes, ui_status: deriveUiStatus(newDelivered, newStatus, newNotes) }
              : win
          ));

          if (soundEnabled) {
            playNotificationSound();
          }

          toast({
            title: "Stav výhry aktualizován",
            description: `Nový stav: ${
              newStatus === 'pending'
                ? 'Čeká'
                : newStatus === 'shipped'
                  ? 'Odesláno'
                  : newStatus === 'delivered'
                    ? 'Předáno'
                    : newStatus || 'Čeká'
            }`,
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

  // ── Fetch wins ─────────────────────────────────────────────────────────────
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
        ui_status: deriveUiStatus(win.delivered, win.status ?? null, win.notes)
      }));

      setWins(transformedWins);
    } catch (error) {
      console.error('Error fetching wins:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch offers ───────────────────────────────────────────────────────────
  // Reads user_partner_offers joined with partner_offers and partners.
  // Only active, non-hidden rows are shown.
  const fetchOffers = async () => {
    if (!user) return;
    setOfferLoading(true);
    try {
      const { data, error } = await (supabase
        .from('user_partner_offers')
        .select(`
          id,
          offer_id,
          obtained_at,
          opened_at,
          partner_offers (
            id,
            title,
            short_text,
            logo_url,
            banner_url,
            valid_to,
            link_or_code,
            partners (
              company_name,
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .is('hidden_at', null)
        .eq('status', 'active')
        .order('obtained_at', { ascending: false }) as any);

      if (error) throw error;
      setOffers((data || []) as UserOffer[]);
    } catch (err) {
      console.error('Error fetching offers:', err);
    } finally {
      setOfferLoading(false);
    }
  };

  // ── Hide offer callback ────────────────────────────────────────────────────
  // Called by OfferDetailModal after a successful hidden_at write.
  const handleOfferHidden = (upoId: string) => {
    setOffers(prev => prev.filter(o => o.id !== upoId));
    setSelectedOffer(null);
  };

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return <LoggedOutScreen />;
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
              background: `radial-gradient(circle, rgba(255,181,71,1) 0%, transparent 70%)`,
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
          background: 'linear-gradient(45deg, transparent 30%, rgba(255,181,71,1) 50%, transparent 70%)',
          backgroundSize: '200% 200%',
          animation: 'shimmer 8s ease-in-out infinite',
        }}
      />

      <Header />

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Premium Header Card */}
        <div
          className="relative overflow-hidden rounded-2xl p-6 mb-6"
          style={{
            background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
            border: '1px solid rgba(255,138,0,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.1)',
          }}
        >
          {/* Header shimmer */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,181,71,1) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 4s ease-in-out infinite',
            }}
          />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)',
                  boxShadow: '0 4px 20px rgba(255,138,0,0.3)',
                }}
              >
                <Trophy className="w-8 h-8 text-black" />
              </div>

              <div>
                <h1
                  className="text-3xl font-bold tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, #FFB547 0%, #FF8A00 50%, #FFB547 100%)',
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
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(255,138,0,0.1)] border border-[rgba(255,138,0,0.2)]">
                <OneMilWinIcon size={20} className="w-5 h-5 text-[#FF8A00]" />
                <span className="text-lg font-bold text-[#FFB547]">{wins.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Tab switcher: Výhry / Nabídky ─────────────────────────────────── */}
        <div
          className="flex gap-2 mb-6 p-1 rounded-xl"
          style={{
            background: 'hsl(220, 25%, 8%)',
            border: '1px solid hsl(220, 20%, 16%)',
          }}
        >
          <button
            onClick={() => setActiveTab('vyhry')}
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ${
              activeTab === 'vyhry'
                ? 'bg-gradient-to-r from-[#FF8A00] to-[#c86000] text-black shadow-[0_4px_16px_rgba(255,138,0,0.3)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <OneMilWinIcon size={16} className="w-4 h-4" />
            Výhry
            {wins.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'vyhry' ? 'bg-black/20 text-black' : 'bg-[hsl(220,25%,14%)] text-gray-400'
              }`}>
                {wins.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('nabidky')}
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ${
              activeTab === 'nabidky'
                ? 'bg-gradient-to-r from-[#FF8A00] to-[#c86000] text-black shadow-[0_4px_16px_rgba(255,138,0,0.3)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Tag className="w-4 h-4" />
            Nabídky
            {offers.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'nabidky' ? 'bg-white/20 text-white' : 'bg-[hsl(220,25%,14%)] text-gray-400'
              }`}>
                {offers.length}
              </span>
            )}
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: VÝHRY                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'vyhry' && (
          <>
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
                        ? 'bg-gradient-to-r from-[#FF8A00] to-[#c86000] text-black shadow-[0_4px_16px_rgba(255,138,0,0.3)]'
                        : 'bg-[hsl(220,25%,12%)] text-gray-300 border border-[hsl(220,20%,20%)] hover:border-[rgba(255,138,0,0.3)]'
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
                    <OneMilTrophyIcon size={16} className="w-4 h-4" />
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
                    <OneMilGiftIcon size={16} className="w-4 h-4" />
                    Bonus ({typeCounts.bonus})
                  </button>
                </div>

                {/* Status Filter and Sort */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-[hsl(220,20%,15%)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <OneMilFilterIcon size={16} className="w-4 h-4 text-gray-500" />
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        filter === 'all'
                          ? 'bg-gradient-to-r from-[#FF8A00] to-[#c86000] text-black shadow-[0_4px_16px_rgba(255,138,0,0.3)]'
                          : 'bg-[hsl(220,25%,12%)] text-gray-300 border border-[hsl(220,20%,20%)] hover:border-[rgba(255,138,0,0.3)]'
                      }`}
                    >
                      Všechny ({statusCounts.all})
                    </button>
                    <button
                      onClick={() => setFilter('pending')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        filter === 'pending'
                          ? 'bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black shadow-[0_4px_16px_rgba(255,138,0,0.3)]'
                          : 'bg-[rgba(255,138,0,0.1)] text-[#FFB547] border border-[rgba(255,138,0,0.3)] hover:bg-[rgba(255,138,0,0.2)]'
                      }`}
                    >
                      Čeká ({statusCounts.pending})
                    </button>
                    <button
                      onClick={() => setFilter('shipped')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        filter === 'shipped'
                          ? 'bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black shadow-[0_4px_16px_rgba(255,138,0,0.3)]'
                          : 'bg-[rgba(255,138,0,0.1)] text-[#FFB547] border border-[rgba(255,138,0,0.3)] hover:bg-[rgba(255,138,0,0.2)]'
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

                  <button
                    onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[hsl(220,25%,12%)] border border-[hsl(220,20%,20%)] hover:border-[rgba(255,138,0,0.3)] transition-all duration-300 text-sm text-gray-300 hover:text-white"
                  >
                    {sortOrder === 'newest' ? (
                      <ArrowDown className="w-4 h-4 text-[#FF8A00]" />
                    ) : (
                      <ArrowUp className="w-4 h-4 text-[#FF8A00]" />
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
                  border: '1px solid rgba(255,138,0,0.15)',
                  boxShadow: '0 8px 32px hsl(0, 0%, 0%, 0.3)',
                }}
              >
                <div
                  className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 16%) 100%)',
                    border: '1px solid rgba(255,138,0,0.1)',
                  }}
                >
                  <OneMilWinIcon size={48} className="w-12 h-12 text-[#FF8A00]/30" />
                </div>
                <h3
                  className="text-2xl font-bold mb-3"
                  style={{
                    background: 'linear-gradient(135deg, #FFB547 0%, #FF8A00 100%)',
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
                <OneMilFilterIcon size={64} className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <h3 className="text-xl font-semibold text-gray-300 mb-2">Žádné výhry v této kategorii</h3>
                <p className="text-gray-500">Zkuste jiný filtr pro zobrazení výher.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredWins.map((win, index) => (
                  <div
                    key={win.id}
                    className="transform transition-all duration-500 hover:scale-[1.02]"
                    style={{ animation: `fade-in 0.5s ease-out ${index * 0.1}s both` }}
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

            <WinDetailModal
              win={selectedWin}
              open={!!selectedWin}
              onClose={() => setSelectedWin(null)}
              onNavigateToContest={(contestId) => navigate(`/contest/${contestId}`)}
              userAge={userAge}
            />
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: NABÍDKY                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'nabidky' && (
          <>
            {offerLoading ? (
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
                    <div className="w-full h-44 bg-[hsl(220,25%,15%)]" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-[hsl(220,25%,18%)] rounded w-1/3" />
                      <div className="h-4 bg-[hsl(220,25%,18%)] rounded w-3/4" />
                      <div className="h-3 bg-[hsl(220,25%,18%)] rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : offers.length === 0 ? (
              <div
                className="relative overflow-hidden rounded-2xl p-12 text-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
                  border: '1px solid hsl(220, 20%, 18%)',
                  boxShadow: '0 8px 32px hsl(0, 0%, 0%, 0.3)',
                }}
              >
                <div
                  className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 16%) 100%)',
                    border: '1px solid hsl(220, 20%, 20%)',
                  }}
                >
                  <Tag className="w-12 h-12 text-[rgba(255,138,0,0.3)]" />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-gray-200">
                  Zatím nemáte žádné nabídky
                </h3>
                <p className="text-gray-400 text-lg">
                  Nabídky partnerů se přidělují automaticky k vašim tiketům v soutěžích.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {offers.map((offer, index) => (
                  <div
                    key={offer.id}
                    className="transform transition-all duration-500 hover:scale-[1.02]"
                    style={{ animation: `fade-in 0.5s ease-out ${index * 0.1}s both` }}
                  >
                    <OfferCard
                      offer={offer}
                      onClick={() => setSelectedOffer(offer)}
                    />
                  </div>
                ))}
              </div>
            )}

            <OfferDetailModal
              offer={selectedOffer}
              open={!!selectedOffer}
              onClose={() => setSelectedOffer(null)}
              onHidden={handleOfferHidden}
            />
          </>
        )}
      </div>

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
