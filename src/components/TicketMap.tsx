import React, { useMemo } from "react";

interface TicketMapProps {
  contestId: string;
  contestTitle: string;
  ticketCount: number;
  ticketPrice: number;
}

export const TicketMap: React.FC<TicketMapProps> = ({ contestId, contestTitle, ticketCount, ticketPrice }) => {
  // Maximum number of tickets to render for performance reasons
  const MAX_RENDER_TICKETS = 2000;
  const displayedTickets = Math.min(ticketCount, MAX_RENDER_TICKETS);

  // Grid layout: ~40 tickets per row
  const columns = 40;
  const rows = Math.max(1, Math.ceil(displayedTickets / columns));

  // Pre-generate only the displayed tickets
  const tickets = useMemo(() => Array.from({ length: displayedTickets }, (_, index) => index + 1), [displayedTickets]);

  const densityLabel =
    ticketCount > MAX_RENDER_TICKETS
      ? `Zobrazen náhled ${displayedTickets.toLocaleString("cs-CZ")} z ${ticketCount.toLocaleString(
          "cs-CZ",
        )} ticketů (optimalizace výkonu).`
      : `Zobrazeno všech ${ticketCount.toLocaleString("cs-CZ")} ticketů.`;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground/90">Mapa ticketů (náhled)</h3>
          <p className="text-xs text-muted-foreground">
            Soutěž: <span className="font-medium">{contestTitle}</span> • Cena ticketu:{" "}
            <span className="font-medium">{ticketPrice} MioCoinů</span>
          </p>
        </div>
        <div className="text-xs text-muted-foreground">{densityLabel}</div>
      </div>

      {/* Ticket preview grid */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-2">
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {tickets.map((ticketNumber) => (
            <div
              key={ticketNumber}
              className="aspect-square rounded-[2px] bg-gradient-to-br from-[#111827] via-[#020617] to-[#020617] border border-border/40"
            />
          ))}
        </div>
      </div>

      {/* Info footer */}
      <p className="text-[11px] text-muted-foreground/80">
        Tato mapa zobrazuje pouze vizuální rozložení ticketů. Pro zachování výkonu není každý ticket vykreslen zvlášť,
        zejména u soutěží s vysokým počtem ticketů.
      </p>
    </div>
  );
};
