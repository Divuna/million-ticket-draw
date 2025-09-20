import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';

interface ContestData {
  title: string;
  tickets_played: number;
  total_tickets: number;
  main_prize_ticket: number | null;
  bonus_tickets: number[];
}

interface TicketMapAdminProps {
  contests: ContestData[];
}

export const TicketMapAdmin: React.FC<TicketMapAdminProps> = ({ contests }) => {
  const getProgressPercentage = (played: number, total: number) => {
    return Math.min((played / total) * 100, 100);
  };

  const getMarkerPosition = (ticketNumber: number, totalTickets: number) => {
    return (ticketNumber / totalTickets) * 100;
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
        {contests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Žádná data k zobrazení
          </div>
        ) : (
          contests.map((contest, index) => (
            <div key={index} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="font-semibold text-base">{contest.title}</h3>
                <div className="text-sm text-muted-foreground">
                  {contest.tickets_played.toLocaleString()} / {contest.total_tickets.toLocaleString()} tiketů
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