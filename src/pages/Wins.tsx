import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { LoggedOutScreen } from '@/components/LoggedOutScreen';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { WinCard } from '@/components/WinCard';
import { WinDetailModal } from '@/components/WinDetailModal';
import { OfferCard, type UserOffer } from '@/components/OfferCard';
import { OfferDetailModal } from '@/components/OfferDetailModal';
import { toast } from '@/hooks/use-toast';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useUnseenWinsCount } from '@/hooks/useUnseenWinsCount';
import avatarWinner from '@/assets/redesign/avatar/face-vitez.png';
import avatarShrug from '@/assets/redesign/avatar/avatar-krci-rameny.png';
import avatarSearch from '@/assets/redesign/avatar/avatar-lupa.png';
import avatarPoint from '@/assets/redesign/avatar/avatar-ukazuje.png';

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
    description: string | null;
    amount: number | null;
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

  // ── Offers state ───────────────────────────────────────────────────────────
  const [offers, setOffers] = useState<UserOffer[]>([]);
  const [offerLoading, setOfferLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<UserOffer | null>(null);

  // ── Filter and sort wins ───────────────────────────────────────────────────
  const filteredWins = useMemo(() => {
    let result = wins;

    if (filter !== 'all') {
      result = result.filter(win => {
        if (filter === 'delivered') return win.ui_status === 'doručeno';
        if (filter === 'shipped') return win.ui_status === 'odesláno';
        if (filter === 'pending') return win.ui_status === 'čeká';
        return true;
      });
    }

    // Hlavní výhra vždy nahoře, jinak od nejnovější.
    return [...result].sort((a, b) => {
      if (a.type === 'main' && b.type !== 'main') return -1;
      if (b.type === 'main' && a.type !== 'main') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [wins, filter]);

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
    };

    initPage();
  }, [user]);

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
          .select('id, title, description, amount, image_url, guardian_required')
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

  const statusChips: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'Vše', count: statusCounts.all },
    { key: 'pending', label: 'Čeká', count: statusCounts.pending },
    { key: 'shipped', label: 'Odesláno', count: statusCounts.shipped },
    { key: 'delivered', label: 'Doručeno', count: statusCounts.delivered },
  ];

  return (
    <div className="wins-light-page min-h-screen bg-background relative overflow-hidden pb-20">
      <Header />

      <div className="relative z-10 container mx-auto max-w-5xl px-4 py-6 md:py-8">
        {/* Hlavička */}
        <div className="mb-5 flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="om-mg-title">Moje výhry</h1>
            <p className="text-[13px] leading-normal text-[#5E5B57]">Přehled všech tvých výher</p>
          </div>
          <div className="om-wins-avatar om-float mr-12" aria-hidden="true">
            <img src={avatarWinner} alt="" />
          </div>
        </div>

        {/* Záložky Výhry / Nabídky */}
        <div className="om-wins-seg mb-4" role="tablist" aria-label="Výhry a nabídky">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'vyhry'}
            onClick={() => setActiveTab('vyhry')}
            className="om-wins-tab"
          >
            Výhry
            {wins.length > 0 && <span className="om-wins-tab-count">{wins.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'nabidky'}
            onClick={() => setActiveTab('nabidky')}
            className="om-wins-tab"
          >
            Nabídky
            {offers.length > 0 && <span className="om-wins-tab-count">{offers.length}</span>}
          </button>
        </div>

        {/* ═══ Záložka: Výhry ═══ */}
        {activeTab === 'vyhry' && (
          <>
            {wins.length > 0 && (
              <div className="om-wins-chips mb-4" aria-label="Filtrovat podle stavu">
                {statusChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={filter === chip.key}
                    onClick={() => setFilter(chip.key)}
                    className="om-wins-chip"
                  >
                    {chip.label} {chip.count}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex flex-col gap-3" aria-label="Načítám výhry">
                <div className="om-wins-skeleton h-[168px]" />
                <div className="om-wins-skeleton h-[84px]" />
                <div className="om-wins-skeleton h-[84px]" />
              </div>
            ) : wins.length === 0 ? (
              <div className="om-wins-empty">
                <img src={avatarShrug} alt="" aria-hidden="true" />
                <h2 className="om-wins-empty-title">Zatím nemáš žádné výhry</h2>
                <p className="om-wins-empty-text">Otevři tiket v některé soutěži – první výhra tady může být tvoje.</p>
                <button type="button" onClick={() => navigate('/games')} className="om-mg-cta mt-2">
                  Vybrat soutěž
                </button>
              </div>
            ) : filteredWins.length === 0 ? (
              <div className="om-wins-empty">
                <img src={avatarSearch} alt="" aria-hidden="true" />
                <h2 className="om-wins-empty-title">Tady nic není</h2>
                <p className="om-wins-empty-text">V tomhle stavu teď žádnou výhru nemáš. Zkus jiný filtr.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredWins.map((win, index) => (
                  <div
                    key={win.id}
                    className={win.type === 'main' ? 'md:col-span-2' : ''}
                    style={{ animation: `fade-in 0.4s ease-out ${Math.min(index, 8) * 0.06}s both` }}
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
            />
          </>
        )}

        {/* ═══ Záložka: Nabídky ═══ */}
        {activeTab === 'nabidky' && (
          <>
            {offerLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Načítám nabídky">
                <div className="om-wins-skeleton h-[210px]" />
                <div className="om-wins-skeleton h-[210px]" />
              </div>
            ) : offers.length === 0 ? (
              <div className="om-wins-empty">
                <img src={avatarPoint} alt="" aria-hidden="true" />
                <h2 className="om-wins-empty-title">Zatím nemáš žádné nabídky</h2>
                <p className="om-wins-empty-text">
                  Nabídky partnerů se přidělují automaticky k tvým tiketům v soutěžích.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {offers.map((offer, index) => (
                  <div
                    key={offer.id}
                    style={{ animation: `fade-in 0.4s ease-out ${Math.min(index, 8) * 0.06}s both` }}
                  >
                    <OfferCard offer={offer} onClick={() => setSelectedOffer(offer)} />
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

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Wins;
