import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MioBadge } from "@/components/brand/MioBadge";
import { GamesTabsHeader, GamesEmpty } from "@/components/brand/GamesTabsHeader";
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { ContestCard } from '@/components/ContestCard';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { recordLocalTicketPlay } from '@/lib/retentionLocal';
import {
  logTicketPurchaseException,
  logTicketPurchaseRejected,
  logTicketPurchaseSuccess,
} from '@/lib/monitoring';
import { analytics } from '@/lib/analytics';
import { Trophy, Medal } from 'lucide-react';
import { OneMilHeartIcon, OneMilTrophyIcon } from '@/components/icons/OneMilIcons';
import { LoggedOutScreen } from '@/components/LoggedOutScreen';
import {
  MysteryPurchaseResultDialog,
  type MysteryTicketOutcome,
} from '@/components/MysteryPurchaseResultDialog';
import {
  mysteryErrorMessage,
  purchaseMysteryCoupon,
  type MysteryCoupon,
} from '@/lib/mysteryCouponPurchase';

interface Contest {
  id: string;
  title: string;
  description: string | null;
  main_prize: string;
  main_image: string | null;
  banner_image: string | null;
  main_prize_secondary_image: string | null;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
  fast_game?: boolean;
}

const Index = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number | undefined>(undefined);
  const [mysteryResult, setMysteryResult] = useState<{
    contestId: string;
    ticket: MysteryTicketOutcome;
    coupon: MysteryCoupon | null;
  } | null>(null);
  // Synchronní zámek nákupu. `processingContestId` je React state, takže se
  // projeví až po re-renderu — dvě kliknutí ve stejném ticku by jinak obě
  // prošla a vytvořila dva nákupy (každý s vlastním idempotency key).
  const purchaseInFlightRef = useRef(false);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  const loadWallet = useCallback(async (): Promise<number> => {
    if (!user?.id) {
      setWalletBalance(undefined);
      return 0;
    }
    const { data, error } = await supabase
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Error loading wallet:', error);
    }
    const n = data?.balance_coins ?? 0;
    setWalletBalance(n);
    return n;
  }, [user?.id]);

  // Removed automatic admin redirect to allow admins to view customer page

  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .select(`
          id, title, description, main_prize, main_image, banner_image, main_prize_secondary_image, ticket_price, ticket_count, status, created_at, fast_game
        `)
        .in('status', ['active', 'pending', 'paused'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Contest[];
      setContests(rows);
    } catch (error) {
      console.error('Error fetching contests:', error);
      toast.error('Chyba při načítání soutěží');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
    if (user) {
      fetchFavorites();
      loadWallet();
    } else {
      setWalletBalance(undefined);
    }
  }, [user, loadWallet]);

  const fetchFavorites = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_contest_favorites')
        .select('contest_id')
        .eq('user_id', user.id);

      if (error) throw error;
      
      setFavorites(new Set(data.map(f => f.contest_id)));
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const toggleFavorite = async (contestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Pro uložení oblíbených se musíš přihlásit');
      return;
    }

    const isFavorite = favorites.has(contestId);

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('user_contest_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('contest_id', contestId);

        if (error) throw error;

        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(contestId);
          return newSet;
        });
        toast.success('Odebráno z oblíbených');
      } else {
        const { error } = await supabase
          .from('user_contest_favorites')
          .insert({ user_id: user.id, contest_id: contestId });

        if (error) throw error;

        setFavorites(prev => new Set(prev).add(contestId));
        toast.success('Přidáno do oblíbených');
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error('Chyba při ukládání oblíbené');
    }
  };

  // Real-time updates: refresh when contests table changes
  useEffect(() => {
    const channel = supabase
      .channel('contests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contests' }, () => {
        fetchContests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const runMysteryPurchase = async (contestId: string) => {
    if (!user) return;

    const outcome = await purchaseMysteryCoupon(user.id, contestId);

    if (!outcome.success) {
      logTicketPurchaseRejected({
        userId: user.id,
        contestId,
        errorCode: outcome.error.slice(0, 200),
      });
      toast.error(mysteryErrorMessage(outcome.error));
      return;
    }

    logTicketPurchaseSuccess({
      userId: user.id,
      contestId,
      ticketNumber: outcome.ticket_number,
    });
    analytics.ticketPurchase({ contestId, ticketNumber: outcome.ticket_number });

    // Send event to Sofinity
    try {
      await supabase.functions.invoke('send_event_to_sofinity', {
        body: {
          event_name: 'coin_redeemed',
          user_id: user.id,
          contest_id: contestId,
          metadata: {
            ticket_number: outcome.ticket_number,
            ticket_price: outcome.charged_miocoins,
          },
        },
      });
    } catch (sofinityError) {
      console.error('Sofinity event error:', sofinityError);
    }

    recordLocalTicketPlay();
    fetchContests();
    await loadWallet();

    // Jeden společný výsledek: výhra z tiketu nahoře, kupon jako druhý bonus.
    // Tiket i kupon už jsou uložené — dialog jen ukazuje, co vzniklo.
    setMysteryResult({
      contestId,
      ticket: {
        ticket_number: outcome.ticket_number,
        won_type: outcome.won_type,
        won_prize: outcome.won_prize,
        distance_to_next_bonus: outcome.distance_to_next_bonus,
      },
      coupon: outcome.coupon,
    });
  };

  const handleUnlockTicket = async (contestId: string) => {
    // Zámek se bere synchronně, ještě před prvním awaitem — druhý klik ve
    // stejném ticku se tak zahodí dřív, než vznikne jakýkoli idempotency key.
    // Platí pro mystery i klasický nákup.
    if (purchaseInFlightRef.current) return;
    purchaseInFlightRef.current = true;

    if (!user) {
      toast.error('Pro koupi tiketu se musíš přihlásit');
      purchaseInFlightRef.current = false;
      return;
    }

    const contest = contests.find((c) => c.id === contestId);
    if (!contest) {
      purchaseInFlightRef.current = false;
      return;
    }

    let effectiveBalance = walletBalance;
    if (typeof effectiveBalance !== 'number') {
      effectiveBalance = await loadWallet();
    }
    if (effectiveBalance < contest.ticket_price) {
      const shortage = Math.max(0, Math.ceil(contest.ticket_price - effectiveBalance));
      toast.error(`Chybí ti ${shortage.toLocaleString('cs-CZ')} MIO`);
      purchaseInFlightRef.current = false;
      return;
    }

    setProcessingContestId(contestId);

    try {
      // Nákup vede vždy přes garantovaný benefit bundle
      // (purchase_guaranteed_benefit_bundle_atomic — omezený i neomezený
      // fallback). Klasický holý nákup tiketu (`buy_ticket_atomic`) z téhle
      // cesty už NENÍ dosažitelný: když benefit není dostupný, je vypnutý
      // feature flag, nebo soutěž není na allowlistu, RPC to vrátí jako
      // běžnou chybu — MioCoiny se nestrhnou a tiket nevznikne.
      await runMysteryPurchase(contestId);
    } catch (error: any) {
      console.error('Error unlocking ticket:', error);
      if (user) {
        logTicketPurchaseException({
          userId: user.id,
          contestId: contestId,
          error,
        });
      }
      toast.error('Chyba při koupi tiketu');
    } finally {
      setProcessingContestId(null);
      purchaseInFlightRef.current = false;
    }
  };

  if (!user) {
    return <LoggedOutScreen />;
  }


  if (loading) {
    return (
      <div className="games-light-page min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Obrysy karet se třpytem místo prázdna (deska Načítání, krok 2) */}
          <div className="mx-auto flex max-w-md flex-col gap-3" role="status" aria-live="polite">
            <div className="flex items-center gap-2.5">
              <MioBadge width={44} />
              <strong className="text-sm text-[#5E5B57]">Načítání soutěží…</strong>
            </div>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[20px] bg-[#17171B] pb-3.5 shadow-[0_0_0_1.5px_rgba(233,185,73,0.35),0_14px_28px_rgba(23,23,27,0.2)]"
              >
                <span className="om-skd h-[150px] rounded-none" />
                <div className="flex flex-col gap-2 px-3.5 pt-3">
                  <span className="om-skd h-[18px] w-[70%]" />
                  <span className="om-skd h-3 w-[45%]" />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="om-skd h-3 w-[36%]" />
                    <span className="om-skd h-10 w-[120px]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="games-light-page min-h-screen bg-background pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <GamesTabsHeader
          active="all"
          allCount={contests.length}
          favoritesCount={contests.reduce((n, c) => n + (favorites.has(c.id) ? 1 : 0), 0)}
        />

        {/* Contests Grid - matching homepage card styling */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {contests.map((contest) => (
            <ContestCard
              key={contest.id}
              contest={contest}
              user={user}
              isAdmin={isAdmin}
              processingContestId={processingContestId}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onPlay={handleUnlockTicket}
              fromPage="games"
              showTotalOnly
              ticketsTotal={contest.ticket_count ?? 1_000_000}
              walletBalance={walletBalance}
              hideTitleAndCount
              className="customer-games-contest-card"
            />
          ))}
          </div>

        {contests.length === 0 && (
          <GamesEmpty
            title="Žádné soutěže"
            text="Momentálně nejsou dostupné žádné soutěže. Hledáme pro tebe další výhry."
            actionLabel="Prohlédnout vouchery"
            onAction={() => navigate('/vouchers')}
          />
        )}
      </div>

      <MysteryPurchaseResultDialog
        open={mysteryResult !== null}
        contestId={mysteryResult?.contestId ?? null}
        ticket={mysteryResult?.ticket ?? null}
        coupon={mysteryResult?.coupon ?? null}
        onClose={() => setMysteryResult(null)}
      />
    </div>
  );
};

export default Index;
