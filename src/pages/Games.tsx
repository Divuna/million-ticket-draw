import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { TicketResultModal } from '@/components/TicketResultModal';
import { ContestCard } from '@/components/ContestCard';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { buildBuyTicketAtomicRpcPayload } from '@/utils/buyTicketAtomicRpcArgs';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { recordLocalTicketPlay } from '@/lib/retentionLocal';
import {
  logRpcHttpFailure,
  logTicketPurchaseException,
  logTicketPurchaseRejected,
  logTicketPurchaseSuccess,
  recordTicketPurchaseAttemptForAbuseCheck,
} from '@/lib/monitoring';
import { Heart, Trophy, Wallet, Plus, TrendingUp } from 'lucide-react';

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

interface PartnerOfferResult {
  id: string;
  title: string;
  short_text: string | null;
  logo_url: string | null;
  banner_url: string | null;
  link_or_code: string | null;
  valid_to: string | null;
  partner_name: string;
}

interface UnlockTicketResult {
  ticket_number: number;
  ticket_price: number;
  next_bonus_position?: number | null;
  distance_to_next_bonus?: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: 'bonus' | 'main' | null;
  bonus_prize_id?: string | null;
  partner_offer?: PartnerOfferResult | null;
}

const Index = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, { tickets_sold: number; tickets_total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number | undefined>(undefined);
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
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Contest[];
      setContests(rows);

      if (rows.length === 0) {
        setProgressMap({});
        return;
      }

      const ids = rows.map((c) => c.id);
      const { data: progressRows, error: progressError } = await supabase
        .from('contest_progress')
        .select('contest_id, tickets_sold, tickets_total')
        .in('contest_id', ids);

      if (progressError) {
        console.error('Error fetching contest progress:', progressError);
        setProgressMap({});
        return;
      }

      const map: Record<string, { tickets_sold: number; tickets_total: number }> = {};
      (progressRows || []).forEach((r) => {
        if (r.contest_id == null) return;
        map[r.contest_id] = {
          tickets_sold: r.tickets_sold ?? 0,
          tickets_total: r.tickets_total ?? 1_000_000,
        };
      });
      setProgressMap(map);
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
      toast.error('Pro uložení oblíbených se musíte přihlásit');
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

  const handleUnlockTicket = async (contestId: string) => {
    if (!user) {
      toast.error('Pro koupi tiketu se musíte přihlásit');
      return;
    }

    const contest = contests.find((c) => c.id === contestId);
    if (!contest) return;

    let effectiveBalance = walletBalance;
    if (typeof effectiveBalance !== 'number') {
      effectiveBalance = await loadWallet();
    }
    if (effectiveBalance < contest.ticket_price) {
      const shortage = Math.max(0, Math.ceil(contest.ticket_price - effectiveBalance));
      toast.error(`Chybí ti ${shortage.toLocaleString('cs-CZ')} MioCoinů`);
      return;
    }

    setProcessingContestId(contestId);
    
    try {
      const built = buildBuyTicketAtomicRpcPayload(contestId, user.id);
      if (!built.ok) {
        toast.error((built as { ok: false; message: string }).message);
        setProcessingContestId(null);
        return;
      }
      const payload = built.payload;
      console.log('buy_ticket_atomic RPC payload', payload);

      const { data, error } = await supabase.rpc('buy_ticket_atomic', payload);

      if (error) {
        console.error('RPC error:', error);
        if (error.message?.includes('closed') || error.message?.includes('uzavřena')) {
          toast.error('Soutěž je uzavřena');
        } else if (error.message?.includes('coins') || error.message?.includes('mincí') || error.message?.includes('balance')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (error.message?.includes('full') || error.message?.includes('plná')) {
          toast.error('Soutěž je plná');
        } else {
          toast.error('Chyba při koupi tiketu');
        }
        return;
      }

      // Normalize result - handle both array and object responses
      const rpcResult = Array.isArray(data) ? data[0] : data;
      
      if (!rpcResult) {
        toast.error('Chyba při koupi tiketu');
        logTicketPurchaseRejected({
          userId: user.id,
          contestId: contestId,
          errorCode: 'empty_rpc_payload',
        });
        return;
      }

      if (!rpcResult.success) {
        const errorMsg = String(rpcResult.error || 'Chyba při koupi tiketu');
        logTicketPurchaseRejected({
          userId: user.id,
          contestId: contestId,
          errorCode: errorMsg.slice(0, 200),
        });
        if (errorMsg.includes('closed') || errorMsg.includes('uzavřena')) {
          toast.error('Soutěž je uzavřena');
        } else if (errorMsg.includes('coins') || errorMsg.includes('mincí') || errorMsg.includes('balance')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (errorMsg.includes('full') || errorMsg.includes('plná')) {
          toast.error('Soutěž je plná');
        } else {
          toast.error(errorMsg);
        }
        return;
      }

      console.log('🔥 RPC raw response:', JSON.stringify(rpcResult, null, 2));

      logTicketPurchaseSuccess({
        userId: user.id,
        contestId: contestId,
        ticketNumber: rpcResult.ticket_number,
      });
      
      // ── Partner Offer lookup ──────────────────────────────────────────────
      let partnerOffer: PartnerOfferResult | null = null;
      const ticketRowId = rpcResult.ticket_row_id as string | undefined;
      if (ticketRowId && user) {
        try {
          const { data: upoRow } = await supabase
            .from('user_partner_offers')
            .select(`
              id,
              partner_offers (
                title, short_text, logo_url, banner_url, link_or_code, valid_to,
                partners (company_name, name)
              )
            `)
            .eq('ticket_id', ticketRowId)
            .eq('user_id', user.id)
            .maybeSingle();
          if (upoRow?.partner_offers) {
            const po = upoRow.partner_offers as any;
            partnerOffer = {
              id: upoRow.id,
              title: po.title ?? '',
              short_text: po.short_text ?? null,
              logo_url: po.logo_url ?? null,
              banner_url: po.banner_url ?? null,
              link_or_code: po.link_or_code ?? null,
              valid_to: po.valid_to ?? null,
              partner_name: po.partners?.company_name || po.partners?.name || '',
            };
          }
        } catch (poErr) {
          console.warn('[Games] partner offer lookup skipped:', poErr);
        }
      }

      const result: UnlockTicketResult = {
        ticket_number: rpcResult.ticket_number,
        ticket_price: rpcResult.ticket_price ?? 1,
        next_bonus_position: rpcResult.next_bonus_position ?? null,
        distance_to_next_bonus: rpcResult.distance_to_next_bonus ?? null,
        won_prize: rpcResult.won_prize ?? null,
        won_type: rpcResult.won_type ?? null,
        bonus_prize_id: rpcResult.bonus_prize_id ?? null,
        remaining_tickets: rpcResult.remaining_tickets ?? 0,
        partner_offer: partnerOffer,
      };

      // Send event to Sofinity
      try {
        await supabase.functions.invoke('send_event_to_sofinity', {
          body: {
            event_name: 'coin_redeemed',
            user_id: user.id,
            contest_id: contestId,
            metadata: {
              ticket_number: result.ticket_number,
              ticket_price: result.ticket_price
            }
          }
        });
      } catch (sofinityError) {
        console.error('Sofinity event error:', sofinityError);
      }

      setModalResult(result);
      setModalContestId(contestId);
      recordLocalTicketPlay();

      // Refresh contests (includes progress)
      fetchContests();
      await loadWallet();

      if (result.won_prize) {
        toast.success(`Gratulujeme! Vyhrál jsi ${result.won_prize}!`);
      } else {
        toast.success(`Tiket #${result.ticket_number.toLocaleString('cs-CZ')} zakoupen!`);
      }
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
    }
  };

if (loading) {
    return (
      <div className="min-h-screen bg-background dark">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">Načítání soutěží...</div>
        </div>
      </div>
    );
  }

  const featuredContest = contests[0] ?? null;
  const remainingContests = contests.slice(1);

  // Total MioCoins invested per contest
  const totalInvested = (contestId: string, ticketPrice: number) => {
    const sold = progressMap[contestId]?.tickets_sold ?? 0;
    return sold * ticketPrice;
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      <div className="container mx-auto px-4 py-5 space-y-3">

        {/* Page header row */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-heading-gold flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Soutěže
          </h1>
          <button
            className="
              flex items-center gap-1.5 px-4 py-2
              rounded-full border border-[hsl(40_75%_50%/0.4)]
              text-[hsl(45_85%_55%)] text-sm font-medium
              bg-[rgba(0,0,0,0.3)] backdrop-blur-sm
              hover:border-[hsl(40_75%_55%)] hover:bg-[rgba(0,0,0,0.5)]
              transition-all duration-200
            "
            onClick={() => navigate('/favorite-games')}
          >
            <Heart className="w-4 h-4" />
            Oblíbené
          </button>
        </div>

        {contests.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <Trophy className="w-16 h-16 mx-auto text-muted-foreground/50" />
            <h3 className="text-xl font-bold text-foreground">Žádné soutěže</h3>
            <p className="text-sm text-muted-foreground">Momentálně nejsou dostupné žádné soutěže.</p>
          </div>
        )}

        {/* ── HERO BLOCK: featured contest (2/3) + info tiles (1/3) ── */}
        {featuredContest && (
          <div className="flex gap-3" style={{ height: '300px' }}>

            {/* Featured contest – large tile */}
            <div className="flex-[2] min-w-0">
              <ContestCard
                contest={featuredContest}
                user={user}
                isAdmin={isAdmin}
                processingContestId={processingContestId}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onPlay={handleUnlockTicket}
                fromPage="games"
                showTotalOnly
                ticketsSold={progressMap[featuredContest.id]?.tickets_sold ?? 0}
                ticketsTotal={progressMap[featuredContest.id]?.tickets_total ?? 1_000_000}
                walletBalance={walletBalance}
                size="featured"
                totalInvestedCoins={totalInvested(featuredContest.id, featuredContest.ticket_price)}
              />
            </div>

            {/* Right column – 3 info tiles stacked */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">

              {/* Wallet tile */}
              <div
                className="
                  flex-1 rounded-[16px]
                  border-[2px] border-[hsl(40_75%_45%/0.5)]
                  bg-[rgba(8,8,12,0.97)]
                  p-3 flex flex-col justify-between
                  cursor-pointer
                  hover:border-[hsl(40_75%_60%/0.7)]
                  transition-colors duration-200
                "
                onClick={() => navigate('/profile')}
              >
                <Wallet className="w-4 h-4 text-[hsl(45_75%_55%)]" />
                <div>
                  <div className="text-[11px] text-white/40 uppercase tracking-wider leading-tight mb-0.5">Peněženka</div>
                  <div className="text-lg font-bold text-[hsl(45_85%_60%)] leading-tight">
                    {walletBalance !== undefined ? walletBalance.toLocaleString('cs-CZ') : '–'}
                  </div>
                  <div className="text-[10px] text-white/35 leading-tight">MioCoinů</div>
                </div>
              </div>

              {/* Top-up tile */}
              <div
                className="
                  flex-1 rounded-[16px]
                  border-[2px] border-[hsl(40_75%_45%/0.5)]
                  bg-gradient-to-br from-[rgba(28,18,4,0.97)] to-[rgba(8,8,12,0.97)]
                  p-3 flex flex-col justify-between
                  cursor-pointer
                  hover:border-[hsl(40_75%_60%/0.7)]
                  transition-all duration-200
                "
                onClick={() => navigate('/profile', { state: { paymentReturnTo: '/games' } })}
              >
                <Plus className="w-4 h-4 text-[hsl(45_75%_55%)]" />
                <div>
                  <div className="text-[11px] text-white/40 uppercase tracking-wider leading-tight mb-0.5">Dobít</div>
                  <div className="text-sm font-bold text-[hsl(45_85%_60%)] leading-tight">MioCoiny</div>
                </div>
              </div>

              {/* Invested tile */}
              <div
                className="
                  flex-1 rounded-[16px]
                  border-[2px] border-[hsl(40_75%_45%/0.5)]
                  bg-[rgba(8,8,12,0.97)]
                  p-3 flex flex-col justify-between
                "
              >
                <TrendingUp className="w-4 h-4 text-[hsl(45_75%_55%)]" />
                <div>
                  <div className="text-[11px] text-white/40 uppercase tracking-wider leading-tight mb-0.5">Vloženo</div>
                  <div className="text-sm font-bold text-[hsl(45_85%_60%)] leading-tight">
                    {totalInvested(featuredContest.id, featuredContest.ticket_price).toLocaleString('cs-CZ')}
                  </div>
                  <div className="text-[10px] text-white/35 leading-tight">MioCoinů</div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── MOSAIC GRID: remaining contests ── */}
        {remainingContests.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {remainingContests.map((contest, i) => {
              // Every 3rd card (index 2, 5, 8…) spans full width as a secondary featured
              const isWide = i > 0 && (i + 1) % 3 === 0;
              const invested = totalInvested(contest.id, contest.ticket_price);
              return (
                <div
                  key={contest.id}
                  className={isWide ? 'col-span-2' : ''}
                  style={{ height: isWide ? '200px' : '180px' }}
                >
                  <ContestCard
                    contest={contest}
                    user={user}
                    isAdmin={isAdmin}
                    processingContestId={processingContestId}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onPlay={handleUnlockTicket}
                    fromPage="games"
                    showTotalOnly
                    ticketsSold={progressMap[contest.id]?.tickets_sold ?? 0}
                    ticketsTotal={progressMap[contest.id]?.tickets_total ?? 1_000_000}
                    walletBalance={walletBalance}
                    size={isWide ? 'featured' : 'compact'}
                    totalInvestedCoins={invested}
                  />
                </div>
              );
            })}
          </div>
        )}

      </div>

      <TicketResultModal
        result={modalResult ? {
          ticket_number: modalResult.ticket_number,
          distance_to_next_bonus: modalResult.distance_to_next_bonus,
          next_bonus_position: modalResult.next_bonus_position,
          won_prize: modalResult.won_prize,
          won_type: modalResult.won_type,
          bonus_prize_id: modalResult.bonus_prize_id,
          remaining_tickets: modalResult.remaining_tickets
        } : null}
        contestId={modalContestId}
        isOpen={!!modalResult}
        onClose={() => {
          setModalResult(null);
          setModalContestId(null);
        }}
      />

    </div>
  );
};

export default Index;
