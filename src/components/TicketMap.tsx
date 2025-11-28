import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trophy, Gift, Lock, Unlock, Sparkles } from 'lucide-react';
import { BonusPrizeOverlay } from '@/components/BonusPrizeOverlay';

interface TicketMapProps {
  contestId: string;
  contestTitle: string;
  ticketCount: number;
  ticketPrice: number;
}

interface TicketData {
  number: number;
  status: 'locked' | 'unlocked' | 'bonus' | 'main_prize';
  userId?: string;
  prizeDescription?: string;
}

export const TicketMap: React.FC<TicketMapProps> = ({ 
  contestId, 
  contestTitle, 
  ticketCount, 
  ticketPrice 
}) => {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingTicket, setProcessingTicket] = useState<number | null>(null);
  const [animatingTickets, setAnimatingTickets] = useState<Set<number>>(new Set());
  const [recentlyUnlocked, setRecentlyUnlocked] = useState<number | null>(null);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  const fetchTicketData = async () => {
    try {
      // Fetch all purchased tickets for this contest
      const { data: purchasedTickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('number, user_id')
        .eq('contest_id', contestId);

      if (ticketsError) throw ticketsError;

      // Fetch bonus prize positions
      const { data: bonusPrizes, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('ticket_position, description, status')
        .eq('contest_id', contestId);

      if (bonusError) throw bonusError;

      // Create ticket map with all possible tickets
      const ticketMap: TicketData[] = [];
      const purchasedSet = new Set(purchasedTickets?.map(t => t.number) || []);
      const bonusPositions = new Map(bonusPrizes?.map(bp => [bp.ticket_position, bp]) || []);

      for (let i = 1; i <= ticketCount; i++) {
        let status: TicketData['status'] = 'locked';
        let prizeDescription: string | undefined;

        if (purchasedSet.has(i)) {
          status = 'unlocked';
        }

        if (bonusPositions.has(i)) {
          const bonus = bonusPositions.get(i)!;
          status = bonus.status === 'claimed' ? 'bonus' : 'bonus';
          prizeDescription = bonus.description;
        }

        // Check if this is the main prize ticket (last ticket)
        if (i === ticketCount) {
          status = purchasedSet.has(i) ? 'main_prize' : 'locked';
          prizeDescription = 'Hlavní výhra';
        }

        ticketMap.push({
          number: i,
          status,
          prizeDescription
        });
      }

      setTickets(ticketMap);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
      toast.error('Chyba při načítání tiketů');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicketData();
  }, [contestId]);

  const handleTicketClick = async (ticketNumber: number) => {
    // Non-logged-in users get login prompt
    if (!user) {
      toast.error('Pro koupi tiketu se musíte přihlásit');
      navigate('/login');
      return;
    }

    // Admin users see read-only view
    if (isAdmin) {
      toast.info('Admin zobrazení - pouze pro čtení');
      return;
    }

    // Only allow unlocking locked tickets
    const ticket = tickets.find(t => t.number === ticketNumber);
    if (ticket?.status !== 'locked') {
      return;
    }

    setProcessingTicket(ticketNumber);

    try {
      // 1. Get contest info
      const { data: contestData, error: contestError } = await supabase
        .from('contests')
        .select('*')
        .eq('id', contestId)
        .single();

      if (contestError || !contestData) {
        toast.error('Soutěž nenalezena');
        return;
      }

      if (contestData.status !== 'active') {
        toast.error('Tato hra již byla ukončena');
        return;
      }

      // 2. Check user wallet
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('balance_coins')
        .eq('user_id', user.id)
        .single();

      if (walletError || !walletData) {
        toast.error('Peněženka nenalezena');
        return;
      }

      if (walletData.balance_coins < ticketPrice) {
        toast.error('Nedostatek miocoinů pro nákup tiketu');
        return;
      }

      // 3. Get next ticket number
      const { data: lastTicket } = await supabase
        .from('tickets')
        .select('number')
        .eq('contest_id', contestId)
        .order('number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextTicketNumber = lastTicket ? lastTicket.number + 1 : 1;

      if (nextTicketNumber > contestData.ticket_count) {
        toast.error('Soutěž je plná');
        return;
      }

      // 4. Deduct coins from wallet
      const { error: walletUpdateError } = await supabase
        .from('wallets')
        .update({ balance_coins: walletData.balance_coins - ticketPrice })
        .eq('user_id', user.id);

      if (walletUpdateError) {
        toast.error('Chyba při odečítání mincí');
        return;
      }

      // 5. Create ticket
      const { error: ticketError } = await supabase
        .from('tickets')
        .insert({
          contest_id: contestId,
          user_id: user.id,
          number: nextTicketNumber
        });

      if (ticketError) {
        // Rollback wallet update
        await supabase
          .from('wallets')
          .update({ balance_coins: walletData.balance_coins })
          .eq('user_id', user.id);
        
        toast.error('Chyba při vytváření tiketu');
        return;
      }

      // 6. Check for bonus prize
      const { data: bonusPrize } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', contestId)
        .eq('ticket_position', nextTicketNumber)
        .maybeSingle();

      let wonPrize: string | null = null;
      let wonType: 'bonus' | 'main' | null = null;
      let bonusPrizeId: string | null = null;

      if (bonusPrize) {
        wonPrize = bonusPrize.description;
        wonType = 'bonus';
        bonusPrizeId = bonusPrize.id;

        await supabase
          .from('winners')
          .insert({
            contest_id: contestId,
            user_id: user.id,
            prize_id: bonusPrize.id,
            type: 'bonus',
            notes: `Bonusová výhra s tiketem #${nextTicketNumber}`
          });

        await supabase
          .from('bonus_prizes')
          .update({ status: 'won' })
          .eq('id', bonusPrize.id);
      }

      // 7. Check if main prize won (last ticket)
      if (nextTicketNumber === contestData.ticket_count) {
        wonPrize = contestData.main_prize;
        wonType = 'main';

        await supabase
          .from('winners')
          .insert({
            contest_id: contestId,
            user_id: user.id,
            type: 'main',
            notes: `Hlavní výhra s tiketem #${nextTicketNumber}`
          });

        await supabase
          .from('contests')
          .update({ status: 'closed' })
          .eq('id', contestId);
      }

      // 8. Get next bonus position
      const { data: nextBonus } = await supabase
        .from('bonus_prizes')
        .select('ticket_position')
        .eq('contest_id', contestId)
        .eq('status', 'pending')
        .gt('ticket_position', nextTicketNumber)
        .order('ticket_position', { ascending: true })
        .limit(1)
        .maybeSingle();

      const result = {
        ticket_number: nextTicketNumber,
        ticket_price: ticketPrice,
        next_bonus_position: nextBonus?.ticket_position || null,
        distance_to_next_bonus: nextBonus ? nextBonus.ticket_position - nextTicketNumber : null,
        won_prize: wonPrize,
        won_type: wonType,
        bonus_prize_id: bonusPrizeId,
        remaining_tickets: contestData.ticket_count - nextTicketNumber
      };

      // Trigger success animation for non-admin users
      setRecentlyUnlocked(result.ticket_number);
      setAnimatingTickets(prev => new Set([...prev, result.ticket_number]));
      
      // Remove animation after 2 seconds
      setTimeout(() => {
        setAnimatingTickets(prev => {
          const next = new Set(prev);
          next.delete(result.ticket_number);
          return next;
        });
        setRecentlyUnlocked(null);
      }, 2000);
      
      // Refresh ticket data
      fetchTicketData();
      
      if (result.won_prize) {
        toast.success(`Gratulujeme! Vyhrál jsi ${result.won_prize}!`);
      } else {
        toast.success(`Tiket #${result.ticket_number.toLocaleString('cs-CZ')} zakoupen!`);
      }
    } catch (error: any) {
      console.error('Error unlocking ticket:', error);
      toast.error('Chyba při koupi tiketu');
    } finally {
      setProcessingTicket(null);
    }
  };

  const getTicketStyles = (ticket: TicketData) => {
    const baseStyles = "w-12 h-12 border rounded-lg flex items-center justify-center text-xs font-medium relative transition-all duration-200";
    
    // Check if this is a milestone ticket (every 100,000)
    const isMilestone = ticket.number % 100000 === 0;
    
    // Check if ticket is currently animating
    const isAnimating = animatingTickets.has(ticket.number);
    const isRecentlyUnlocked = recentlyUnlocked === ticket.number;
    
    // Animation classes for non-admin users
    const animationClasses = !isAdmin && user ? [
      isAnimating ? 'animate-pulse' : '',
      isRecentlyUnlocked ? 'ring-2 ring-primary ring-opacity-75 animate-scale-in' : '',
      isMilestone && ticket.status === 'locked' ? 'ring-1 ring-amber-400 shadow-lg shadow-amber-400/25' : '',
    ].filter(Boolean).join(' ') : '';
    
    switch (ticket.status) {
      case 'locked':
        const milestoneStyles = isMilestone ? 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-800 border-amber-300 dark:from-amber-900/20 dark:to-amber-800/20 dark:text-amber-400 dark:border-amber-700' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80';
        return `${baseStyles} ${milestoneStyles} ${animationClasses} ${user && !isAdmin ? 'cursor-pointer' : ''}`;
      case 'unlocked':
        return `${baseStyles} bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 ${animationClasses}`;
      case 'bonus':
        return `${baseStyles} bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 ${animationClasses}`;
      case 'main_prize':
        return `${baseStyles} bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700 ${animationClasses}`;
      default:
        return `${baseStyles} ${animationClasses}`;
    }
  };

  const getTicketIcon = (ticket: TicketData) => {
    // Check if this is a milestone ticket
    const isMilestone = ticket.number % 100000 === 0;
    
    switch (ticket.status) {
      case 'locked':
        return (
          <div className="flex items-center justify-center">
            <Lock className="w-3 h-3" />
            {isMilestone && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            )}
          </div>
        );
      case 'unlocked':
        return <Unlock className="w-3 h-3" />;
      case 'bonus':
        return <Gift className="w-3 h-3" />;
      case 'main_prize':
        return <Trophy className="w-3 h-3" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mapa tiketů - {contestTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Načítání tiketů...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Mapa tiketů - {contestTitle}
          
          <BonusPrizeOverlay contestId={contestId} contestTitle={contestTitle}>
            <Button variant="outline" size="sm" className="ml-auto">
              <Sparkles className="w-4 h-4 mr-1" />
              Bonusy
            </Button>
          </BonusPrizeOverlay>
        </CardTitle>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            <span>Zamčený</span>
          </div>
          <div className="flex items-center gap-1">
            <Unlock className="w-3 h-3 text-blue-600" />
            <span>Odemčený</span>
          </div>
          <div className="flex items-center gap-1">
            <Gift className="w-3 h-3 text-amber-600" />
            <span>Bonus</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy className="w-3 h-3 text-purple-600" />
            <span>Hlavní výhra</span>
          </div>
        </div>
        
        {/* Admin read-only notice */}
        {user && isAdmin && (
          <Badge variant="secondary" className="w-fit">
            Admin zobrazení - pouze pro čtení
          </Badge>
        )}
        
        {/* Non-logged-in user notice */}
        {!user && (
          <Badge variant="outline" className="w-fit">
            Přihlaste se pro interakci s tikety
          </Badge>
        )}
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-10 sm:grid-cols-15 md:grid-cols-20 lg:grid-cols-25 gap-1 max-h-96 overflow-y-auto">
          {tickets.map((ticket) => (
            <div
              key={ticket.number}
              className={getTicketStyles(ticket)}
              onClick={() => handleTicketClick(ticket.number)}
              title={`Tiket #${ticket.number}${ticket.prizeDescription ? ` - ${ticket.prizeDescription}` : ''}`}
            >
              {processingTicket === ticket.number ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {getTicketIcon(ticket)}
                  <span className="absolute -bottom-1 -right-1 text-[8px] bg-background rounded px-0.5">
                    {ticket.number}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Celkem tiketů: {ticketCount.toLocaleString('cs-CZ')} | 
          Cena tiketu: {ticketPrice} miocoinů
        </div>
        
        {/* Interactive instructions for non-admin users */}
        {user && !isAdmin && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            Klikněte na zamčený tiket pro jeho odemčení za {ticketPrice} miocoinů
          </div>
        )}
      </CardContent>
    </Card>
  );
};