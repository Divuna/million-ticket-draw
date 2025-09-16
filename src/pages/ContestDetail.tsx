import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { TicketResultModal } from '@/components/TicketResultModal';
import { BottomNavigation } from '@/components/BottomNavigation';

import { AdminContestView } from '@/components/AdminContestView';
import { CustomerContestView } from '@/components/CustomerContestView';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
}

interface BonusPrize {
  id: string;
  description: string;
  ticket_position: number;
  status: string;
}

interface UserWallet {
  balance_coins: number;
}

interface UserWin {
  id: string;
  description: string;
  type: 'main' | 'bonus';
  status: string;
  delivered: boolean;
}

interface TicketResult {
  ticket_number: number;
  distance_to_next_bonus: number | null;
  next_bonus_position: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: 'bonus' | 'main' | null;
  bonus_prize_id?: string | null;
}

const ContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [currentTickets, setCurrentTickets] = useState(0);
  const [userWallet, setUserWallet] = useState<UserWallet>({ balance_coins: 0 });
  const [userWins, setUserWins] = useState<UserWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [ticketResult, setTicketResult] = useState<TicketResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    if (id) {
      fetchContestData();
    }
  }, [id]);

  useEffect(() => {
    if (user) {
      fetchUserWallet();
      fetchUserWins();
    }
  }, [user, id]);

  const fetchContestData = async () => {
    try {
      if (!id) return;

      // Fetch contest data
      const { data: contestData, error: contestError } = await supabase
        .from('contests')
        .select('*')
        .eq('id', id)
        .single();

      if (contestError) throw contestError;
      setContest(contestData);

      // Fetch bonus prizes
      const { data: bonusData, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', id)
        .order('ticket_position', { ascending: true });

      if (bonusError) throw bonusError;
      setBonusPrizes(bonusData || []);

      // Fetch current tickets count
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('contest_id', id);

      setCurrentTickets(count || 0);
    } catch (error) {
      console.error('Error fetching contest data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserWallet = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('wallets')
        .select('balance_coins')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setUserWallet({ balance_coins: data?.balance_coins || 0 });
    } catch (error) {
      console.error('Error fetching wallet:', error);
      setUserWallet({ balance_coins: 0 });
    }
  };

  const fetchUserWins = async () => {
    try {
      if (!user || !id) return;
      
      const { data, error } = await supabase
        .from('winners')
        .select(`
          id,
          type,
          delivered,
          prize_id,
          contest_id,
          contests!inner(main_prize)
        `)
        .eq('user_id', user.id)
        .eq('contest_id', id);

      if (error) throw error;

      const wins: UserWin[] = [];
      
      for (const win of data || []) {
        let description = '';
        
        if (win.type === 'main') {
          description = win.contests?.main_prize || 'Hlavní cena';
        } else if (win.type === 'bonus' && win.prize_id) {
          // Fetch bonus prize description separately
          const { data: bonusData } = await supabase
            .from('bonus_prizes')
            .select('description')
            .eq('id', win.prize_id)
            .single();
          
          description = bonusData?.description || 'Bonusová cena';
        }

        wins.push({
          id: win.id,
          description,
          type: win.type as 'main' | 'bonus',
          status: 'Stav bude doplněn',
          delivered: win.delivered
        });
      }

      setUserWins(wins);
    } catch (error) {
      console.error('Error fetching user wins:', error);
      setUserWins([]);
    }
  };

  const buyTicket = async () => {
    if (!user || !contest) return;

    if (userWallet.balance_coins < 1) {
      toast({
        title: "Nedostatek mincí",
        description: "Pro nákup tiketu potřebujete alespoň 1 minci.",
        variant: "destructive"
      });
      return;
    }

    setPurchasing(true);

    try {
      // Call the unlock_ticket function using the generic rpc call
      const { data, error } = await supabase.rpc('unlock_ticket' as any, {
        contest_id: contest.id,
        user_id: user.id
      }) as { data: any; error: any };

      if (error || !data) throw error || new Error('No data returned');

      // Development logging - Raw RPC unlock_ticket data
      if (import.meta.env.DEV) {
        console.log('🎫 Raw RPC unlock_ticket data:', JSON.stringify(data, null, 2));
        console.log('🎫 Ticket purchase result:', {
          current_ticket: data.ticket_number,
          next_bonus_position: data.next_bonus_position,
          distance_to_next_bonus: data.distance_to_next_bonus,
          won_prize: data.won_prize,
          won_type: data.won_type,
          bonus_prize_id: data.bonus_prize_id,
          remaining_tickets: data.remaining_tickets
        });
        
        if (data.won_prize) {
          console.log('🎉 Winner record should be created for user:', user.id);
          console.log('🎉 Won type:', data.won_type);
        }
      }

      // Prepare result for modal
      const result: TicketResult = {
        ticket_number: data.ticket_number || 0,
        distance_to_next_bonus: data.distance_to_next_bonus,
        next_bonus_position: data.next_bonus_position,
        won_prize: data.won_prize,
        won_type: data.won_type,
        bonus_prize_id: data.bonus_prize_id,
        remaining_tickets: data.remaining_tickets,
      };

      setTicketResult(result);
      setShowResultModal(true);

      // Refresh data
      await fetchUserWallet();
      await fetchUserWins();

    } catch (error) {
      console.error('Error purchasing ticket:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se uplatnit miocoiny. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setPurchasing(false);
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Determine admin access
  const isAdmin = user?.email === 'divispavel2@gmail.com';

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám soutěž...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Soutěž nenalezena</h1>
            <p className="text-muted-foreground">Požadovaná soutěž neexistuje nebo byla odstraněna.</p>
          </div>
        </div>
      </div>
    );
  }

  const progressPercentage = (currentTickets / contest.ticket_count) * 100;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {isAdmin ? (
          <AdminContestView
            contest={contest}
            bonusPrizes={bonusPrizes}
            currentTickets={currentTickets}
            userWallet={userWallet}
            purchasing={purchasing}
            onBuyTicket={buyTicket}
          />
        ) : (
          <CustomerContestView
            contest={contest}
            bonusPrizes={bonusPrizes}
            userWallet={userWallet}
            userWins={userWins}
            purchasing={purchasing}
            onBuyTicket={buyTicket}
          />
        )}
      </div>

      {/* Ticket Result Modal */}
      <TicketResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        contestId={contest?.id || ''}
        result={ticketResult}
      />

      {!isAdmin && <BottomNavigation />}
    </div>
  );
};

export default ContestDetail;