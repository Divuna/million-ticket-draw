import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ContestData {
  id: string;
  title: string;
  total_tickets: number;
  tickets_played: number;
  main_prize_ticket: number | null;
  bonus_tickets: number[];
}

interface TicketMapAdminProps {}

export const TicketMapAdmin: React.FC<TicketMapAdminProps> = () => {
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedMarkers, setHighlightedMarkers] = useState<Set<string>>(new Set());
  const highlightTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const fetchContests = async () => {
    try {
      setLoading(true);

      // 1. Load contests
      const { data: contestRows, error: contestError } = await supabase
        .from('contests')
        .select('id, title, ticket_count, status')
        .in('status', ['active', 'finished'])
        .order('created_at', { ascending: false });

      if (contestError) throw contestError;
      if (!contestRows || contestRows.length === 0) {
        setContests([]);
        return;
      }

      const contestIds = contestRows.map(c => c.id);

      // 2. Get ticket counts from admin_contest_status view (bypasses RLS on tickets table)
      const { data: statusRows, error: statusError } = await supabase
        .from('admin_contest_status')
        .select('contest_id, total_tickets')
        .in('contest_id', contestIds);

      if (statusError) console.error('Error fetching contest status:', statusError);

      const ticketCountMap: Record<string, number> = {};
      (statusRows || []).forEach(row => {
        ticketCountMap[row.contest_id] = row.total_tickets ?? 0;
      });

      // 3. Load bonus prize positions per contest
      const { data: bonusRows, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('contest_id, ticket_position')
        .in('contest_id', contestIds);

      if (bonusError) console.error('Error fetching bonus prizes:', bonusError);

      // Group bonus positions per contest
      const bonusMap: Record<string, number[]> = {};
      (bonusRows || []).forEach(b => {
        if (!bonusMap[b.contest_id]) bonusMap[b.contest_id] = [];
        bonusMap[b.contest_id].push(b.ticket_position);
      });

      const mapped: ContestData[] = contestRows.map(c => ({
        id: c.id,
        title: c.title,
        total_tickets: c.ticket_count,
        tickets_played: ticketCountMap[c.id] || 0,
        main_prize_ticket: null,
        bonus_tickets: bonusMap[c.id] || [],
      }));

      setContests(mapped);
    } catch (error) {
      console.error('Error fetching ticket map data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
    
    // Setup realtime subscriptions
    const bonusChannel = supabase
      .channel('ticket-map-bonus-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bonus_prizes'
      }, (payload) => {
        console.log('Bonus prize change detected:', payload);
        
        // Highlight the affected contest's bonus markers
        if (payload.new && 'contest_id' in payload.new && 'ticket_position' in payload.new) {
          highlightMarker(`bonus-${payload.new.contest_id}-${payload.new.ticket_position}`);
        } else if (payload.old && 'contest_id' in payload.old && 'ticket_position' in payload.old) {
          highlightMarker(`bonus-${payload.old.contest_id}-${payload.old.ticket_position}`);
        }
        
        // Refresh contest data
        fetchContests();
        
        // Show toast message
        let message = '';
        if (payload.eventType === 'INSERT' && payload.new && 'ticket_position' in payload.new) {
          message = `Nová bonusová cena přidána na pozici #${payload.new.ticket_position}`;
        } else if (payload.eventType === 'UPDATE' && payload.new && 'ticket_position' in payload.new) {
          message = `Bonusová cena aktualizována na pozici #${payload.new.ticket_position}`;
        } else if (payload.eventType === 'DELETE' && payload.old && 'ticket_position' in payload.old) {
          message = `Bonusová cena odstraněna z pozice #${payload.old.ticket_position}`;
        }
        
        if (message) {
          toast({
            title: "Změna bonusové ceny",
            description: message,
          });
        }
      })
      .subscribe();

    const ticketsChannel = supabase
      .channel('ticket-map-tickets-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets'
      }, (payload) => {
        console.log('Ticket change detected:', payload);
        
        // Refresh contest data to update tickets_played count
        fetchContests();
        
        // Show toast for new tickets
        if (payload.eventType === 'INSERT' && payload.new && 'number' in payload.new) {
          toast({
            title: "Nový tiket",
            description: `Tiket #${payload.new.number} byl zakoupen`,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(bonusChannel);
      supabase.removeChannel(ticketsChannel);
      
      // Clean up highlight timeouts
      Object.values(highlightTimeoutRef.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, []);

  const getProgressPercentage = (played: number, total: number) => {
    return Math.min((played / total) * 100, 100);
  };

  const getMarkerPosition = (ticketNumber: number, totalTickets: number) => {
    return (ticketNumber / totalTickets) * 100;
  };

  const highlightMarker = (markerId: string) => {
    setHighlightedMarkers(prev => new Set(prev).add(markerId));
    
    // Clear existing timeout for this marker
    if (highlightTimeoutRef.current[markerId]) {
      clearTimeout(highlightTimeoutRef.current[markerId]);
    }
    
    // Set new timeout to remove highlight after 3 seconds
    highlightTimeoutRef.current[markerId] = setTimeout(() => {
      setHighlightedMarkers(prev => {
        const newSet = new Set(prev);
        newSet.delete(markerId);
        return newSet;
      });
      delete highlightTimeoutRef.current[markerId];
    }, 3000);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Mapa tiketů</CardTitle>
        <CardDescription>
          Přehled prodaných tiketů a pozic cen pro všechny soutěže
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Načítání...
          </div>
        ) : contests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Žádná data k zobrazení
          </div>
        ) : (
          contests.map((contest, index) => (
            <div key={contest.id} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="font-semibold text-base">{contest.title}</h3>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-muted-foreground">
                    {contest.tickets_played.toLocaleString()} / {contest.total_tickets.toLocaleString()} tiketů
                  </div>
                  <Link to={`/admin/contest/${contest.id}`}>
                    <Button variant="outline" size="sm">
                      Detail soutěže
                    </Button>
                  </Link>
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
                            className={`absolute top-0 w-1 h-full bg-yellow-500 cursor-pointer hover:bg-yellow-400 transition-all duration-300 z-10 ${
                              highlightedMarkers.has(`main-${contest.id}`) ? 'animate-pulse shadow-lg shadow-yellow-400' : ''
                            }`}
                            style={{
                              left: `${getMarkerPosition(contest.main_prize_ticket, contest.total_tickets)}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className={`absolute -top-2 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-yellow-500 rotate-45 border border-yellow-600 ${
                              highlightedMarkers.has(`main-${contest.id}`) ? 'shadow-lg shadow-yellow-400' : ''
                            }`} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Hlavní cena: tiket #{contest.main_prize_ticket}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  
                  {/* Bonus tickets markers */}
                  {contest.bonus_tickets.map((ticketNumber, bonusIndex) => {
                    const markerId = `bonus-${contest.id}-${ticketNumber}`;
                    const isHighlighted = highlightedMarkers.has(markerId);
                    
                    return (
                      <TooltipProvider key={bonusIndex}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-0 w-1 h-full bg-orange-500 cursor-pointer hover:bg-orange-400 transition-all duration-300 z-10 ${
                                isHighlighted ? 'animate-pulse shadow-lg shadow-orange-400' : ''
                              }`}
                              style={{
                                left: `${getMarkerPosition(ticketNumber, contest.total_tickets)}%`,
                                transform: 'translateX(-50%)'
                              }}
                            >
                              <div className={`absolute -top-1.5 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-orange-500 rounded-full border border-orange-600 ${
                                isHighlighted ? 'shadow-lg shadow-orange-400' : ''
                              }`} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Bonus: tiket #{ticketNumber}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
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