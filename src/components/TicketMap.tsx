import React from "react";

interface TicketMapProps {
  contestId: string;
  contestTitle: string;
  ticketCount: number;
  ticketPrice: number;
}

export const TicketMap: React.FC<TicketMapProps> = ({ contestTitle, ticketCount, ticketPrice }) => {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-6 text-center space-y-2">
      <p className="text-sm font-medium text-foreground/90">
        Mapa ticketů je skrytá pro optimalizaci výkonu.
      </p>
      <p className="text-xs text-muted-foreground">
        Detailní mapa je dostupná jen administrátorům.
      </p>
    </div>
  );
};
