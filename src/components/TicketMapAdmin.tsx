import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Eye, Loader2 } from 'lucide-react';

interface ContestData {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  main_image: string;
  status: string;
  tickets_played: number;
  total_tickets: number;
  main_prize_ticket: number | null;
  bonus_tickets: number[];
  created_at: string;
  ticket_price: number;
}

interface TicketMapAdminProps {}

export const TicketMapAdmin: React.FC<TicketMapAdminProps> = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);

  const getProgressPercentage = (played: number, total: number) => {
    return Math.min((played / total) * 100, 100);
  };

  const getMarkerPosition = (ticketNumber: number, totalTickets: number) => {
    return (ticketNumber / totalTickets) * 100;
  };

  useEffect(() => {
    fetchContestsData();
  }, []);

  const fetchContestsData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contests')
        .select(`
          id, title, description, main_prize, main_image, status, 
          ticket_count, ticket_price, created_at
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch additional data for each contest
      const contestsWithData = await Promise.all(
        (data || []).map(async (contest: any) => {
          // Get tickets played count
          const { count: ticketsPlayed } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('contest_id', contest.id);
          
          // Get bonus tickets positions (limited to 50)
          const { data: bonusPrizes } = await supabase
            .from('bonus_prizes')
            .select('ticket_position')
            .eq('contest_id', contest.id)
            .order('ticket_position', { ascending: true })
            .limit(50);
          
          return {
            ...contest,
            tickets_played: ticketsPlayed || 0,
            total_tickets: contest.ticket_count,
            main_prize_ticket: contest.ticket_count, // Assuming last ticket wins main prize
            bonus_tickets: (bonusPrizes || []).map(bp => bp.ticket_position)
          };
        })
      );
      
      setContests(contestsWithData);
    } catch (error) {
      console.error('Error fetching contests data:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst data soutěží.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContestDetail = (contestId: string) => {
    navigate(`/admin/contest/${contestId}`);
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Mapa tiketů</CardTitle>
          <CardDescription>
            Přehled prodaných tiketů a pozic cen pro všechny soutěže
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-muted-foreground">Načítání dat...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Mapa tiketů</CardTitle>
        <CardDescription>
          Přehled prodaných tiketů a pozic cen pro všechny soutěže
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {contests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Žádná data k zobrazení
          </div>
        ) : (
          contests.map((contest, index) => (
            <div key={contest.id} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="font-semibold text-base">{contest.title}</h3>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {contest.tickets_played.toLocaleString()} / {contest.total_tickets.toLocaleString()} tiketů
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleContestDetail(contest.id)}
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Detail soutěže
                  </Button>
                </div>
              </div>
              
              <div className="relative">
                {/* Progress bar container */}
                <div className="relative h-8 bg-secondary rounded-lg overflow-hidden">
                  {/* Filled progress bar */}
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ 
                      width: `${getProgressPercentage(contest.tickets_played, contest.total_tickets)}%` 
                    }}
                  />
                  
                  {/* Main prize marker */}
                  {contest.main_prize_ticket && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-0 w-1 h-full bg-yellow-500 cursor-pointer hover:bg-yellow-400 transition-colors z-10"
                            style={{
                              left: `${getMarkerPosition(contest.main_prize_ticket, contest.total_tickets)}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-yellow-500 rotate-45 border border-yellow-600" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Hlavní cena: tiket #{contest.main_prize_ticket}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  
                  {/* Bonus tickets markers */}
                  {contest.bonus_tickets.map((ticketNumber, bonusIndex) => (
                    <TooltipProvider key={bonusIndex}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-0 w-1 h-full bg-orange-500 cursor-pointer hover:bg-orange-400 transition-colors z-10"
                            style={{
                              left: `${getMarkerPosition(ticketNumber, contest.total_tickets)}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className="absolute -top-1.5 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-orange-500 rounded-full border border-orange-600" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Bonus: tiket #{ticketNumber}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
                
                {/* Progress percentage label */}
                <div className="mt-2 text-right">
                  <span className="text-sm font-medium text-primary">
                    {getProgressPercentage(contest.tickets_played, contest.total_tickets).toFixed(1)}% prodáno
                  </span>
                </div>
              </div>
              
              {/* Legend */}
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 bg-blue-500 rounded" />
                  <span>Prodané tikety</span>
                </div>
                {contest.main_prize_ticket && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rotate-45 border border-yellow-600" />
                    <span>Hlavní cena</span>
                  </div>
                )}
                {contest.bonus_tickets.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full border border-orange-600" />
                    <span>Bonusové ceny ({contest.bonus_tickets.length})</span>
                  </div>
                )}
              </div>
              
              {index < contests.length - 1 && (
                <div className="border-b border-border mt-6" />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};