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
      const { data, error } = await supabase.rpc('unlock_ticket' as any, {
        contest_id: contestId,
        user_id: user.id
      });

      if (error) {
        console.error('Error unlocking ticket:', error);
        
        if (error.message?.includes('insufficient') || error.message?.includes('nedostatek')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (error.message?.includes('closed') || error.message?.includes('ukončen')) {
          toast.error('Tato hra již byla ukončena');
        } else {
          toast.error(error.message || 'Chyba při koupi tiketu');
        }
        return;
      }

      if (data) {
        // Trigger success animation for non-admin users
        if (!isAdmin) {
          setRecentlyUnlocked(data.ticket_number);
          setAnimatingTickets(prev => new Set([...prev, data.ticket_number]));
          
          // Remove animation after 2 seconds
          setTimeout(() => {
            setAnimatingTickets(prev => {
              const next = new Set(prev);
              next.delete(data.ticket_number);
              return next;
            });
            setRecentlyUnlocked(null);
          }, 2000);
        }
        
        // Refresh ticket data
        fetchTicketData();
        
        if (data.won_prize) {
          toast.success(`Gratulujeme! Vyhrál jsi ${data.won_prize}!`);
        } else {
          toast.success(`Tiket #${data.ticket_number.toLocaleString('cs-CZ')} zakoupen!`);
        }
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