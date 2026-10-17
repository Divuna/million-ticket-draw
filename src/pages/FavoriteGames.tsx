import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GamesTabsHeader, GamesEmpty } from "@/components/brand/GamesTabsHeader";
import { Header } from '@/components/Header';
import { ArrowLeft } from 'lucide-react';
import { ContestCard } from '@/components/ContestCard';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  banner_image?: string | null;
  main_prize_secondary_image?: string | null;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
  fast_game?: boolean;
}

const FavoriteGames = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);
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

  const handleRemoveFavorite = async (contestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    setRemovingFavoriteId(contestId);
    
    // Optimistic update
    setContests(prev => prev.filter(c => c.id !== contestId));

    try {
      const { error } = await supabase
        .from('user_contest_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('contest_id', contestId);

      if (error) {
        // Revert on error
        fetchFavoriteContests();
        toast.error('Chyba při odebírání z oblíbených');
      } else {
        toast.success('Odebráno z oblíbených');
      }
    } catch (error) {
      fetchFavoriteContests();
      toast.error('Chyba při odebírání z oblíbených');
    } finally {
      setRemovingFavoriteId(null);
    }
  };

  useEffect(() => {
    if (!user) {
      setWalletBalance(undefined);
      return;
    }
    fetchFavoriteContests();
    loadWallet();
  }, [user, loadWallet]);

  const fetchFavoriteContests = async () => {
    if (!user) return;

    try {
      // Fetch only favorited contests using JOIN via Supabase's foreign key relationship
      const { data, error } = await supabase
        .from('user_contest_favorites')
        .select(`
          contest_id,
          contests (
            id, title, description, main_prize, main_image, banner_image, main_prize_secondary_image, ticket_price, ticket_count, status, created_at, fast_game
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Extract contests from the joined data - contests is a single object due to foreign key relationship
      const contestData: Contest[] = [];
      data?.forEach(item => {
        const contest = item.contests as unknown as Contest | null;
        if (contest) {
          contestData.push(contest);
        }
      });

      if (contestData.length === 0) {
        setContests([]);
        return;
      }

      setContests(contestData);
    } catch (error) {
      console.error('Error fetching favorite contests:', error);
      toast.error('Chyba při načítání oblíbených soutěží');
    } finally {
      setLoading(false);
    }
  };

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

    recordLocalTicketPlay();
    fetchFavoriteContests();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Načítání oblíbených soutěží...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="games-light-page min-h-screen bg-background pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-8">
        <GamesTabsHeader active="favorites" favoritesCount={contests.length} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contests.map((contest) => (
            <ContestCard
              key={contest.id}
              contest={contest}
              user={user}
              isAdmin={isAdmin}
              processingContestId={processingContestId}
              onRemoveFavorite={handleRemoveFavorite}
              onPlay={handleUnlockTicket}
              fromPage="favorites"
              showTotalOnly
              ticketsTotal={contest.ticket_count ?? 1_000_000}
              walletBalance={walletBalance}
            />
          ))}
        </div>

        {contests.length === 0 && (
          <GamesEmpty
            title="Žádné oblíbené"
            text="Zatím nemáš žádnou oblíbenou soutěž. Označ ji srdíčkem a najdeš ji tady."
            actionLabel="Prohlédnout soutěže"
            onAction={() => navigate('/games')}
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

export default FavoriteGames;
