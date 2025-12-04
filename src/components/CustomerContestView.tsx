import React from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Crown, Gift, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { TicketMap } from "@/components/TicketMap";

/* ------------------------------------------------------------------ */
/*  TYPES                                                             */
/* ------------------------------------------------------------------ */

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
  banner_image?: string | null;
  generated_poster_url?: string | null;
  // volitelné – pokud zatím nemáš sloupec, nic se nestane
  main_prize_secondary_image?: string | null;
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
  type: "main" | "bonus";
  status: string;
  delivered: boolean;
}

interface CustomerContestViewProps {
  contest: Contest;
  bonusPrizes: BonusPrize[];
  userWallet: UserWallet;
  userWins: UserWin[];
  purchasing: boolean;
  onBuyTicket: () => void;
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                         */
/* ------------------------------------------------------------------ */

export const CustomerContestView: React.FC<CustomerContestViewProps> = ({
  contest,
  bonusPrizes,
  userWallet,
  userWins,
  purchasing,
  onBuyTicket,
}) => {
  const navigate = useNavigate();

  /* ----------------------------- LOGIKA ---------------------------- */

  const handleBuyTicket = () => {
    if (userWallet.balance_coins < contest.ticket_price) {
      toast({
        title: "Nedostatečný zůstatek",
        description: "Nemáš dostatek MioCoinů pro nákup ticketu.",
        variant: "destructive",
      });
      return;
    }

    if (contest.status !== "active") {
      toast({
        title: "Soutěž není aktivní",
        description: "Ticket lze koupit pouze v aktivní soutěži.",
        variant: "destructive",
      });
      return;
    }

    onBuyTicket();
  };

  const statusLabel =
    contest.status === "active"
      ? "Probíhá"
      : contest.status === "paused"
        ? "Pozastavená"
        : contest.status === "finished"
          ? "Ukončená"
          : "Připravena";

  const statusVariant: React.ComponentProps<typeof Badge>["variant"] =
    contest.status === "active"
      ? "default"
      : contest.status === "paused"
        ? "secondary"
        : contest.status === "finished"
          ? "outline"
          : "secondary";

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-24">
      {/* ==============================================================
          1) HERO / BANNER
          ============================================================== */}
      <div className="rounded-3xl border border-border/60 bg-gradient-to-b from-background via-background/60 to-background shadow-xl overflow-hidden">
        <div className="relative">
          {contest.generated_poster_url || contest.banner_image ? (
            <img
              src={contest.generated_poster_url || contest.banner_image || ""}
              alt={`${contest.title} banner`}
              className="w-full max-h-[420px] object-cover"
            />
          ) : (
            <div className="h-[260px] w-full bg-gradient-to-br from-[#040810] via-[#08111f] to-[#020308] flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-3xl font-semibold bg-gradient-to-r from-yellow-400 via-yellow-300 to-amber-300 bg-clip-text text-transparent drop-shadow">
                  {contest.title}
                </p>
                <p className="text-sm text-muted-foreground">Luxusní soutěž v systému OneMil</p>
              </div>
            </div>
          )}

          {/* overlay + text */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/40 to-transparent pointer-events-none" />

          <div className="absolute inset-x-4 bottom-4 md:bottom-6 md:left-8 md:right-8 pointer-events-none">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2 pointer-events-auto">
                <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground drop-shadow">{contest.title}</h1>
                {contest.description && (
                  <p className="max-w-2xl text-sm md:text-base text-primary-foreground/90 drop-shadow">
                    {contest.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                  <Badge
                    variant="outline"
                    className="backdrop-blur bg-background/70 border-yellow-500/40 text-yellow-300 flex items-center gap-1"
                  >
                    <Coins className="w-4 h-4" />
                    Cena ticketu: {contest.ticket_price} MioCoins
                  </Badge>
                </div>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2 pointer-events-auto">
                <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Počet ticketů v soutěži</p>
                <p className="text-lg md:text-2xl font-semibold text-primary-foreground">
                  {contest.ticket_count.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-primary-foreground/70">ticketů</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==============================================================
          2) HLAVNÍ VÝHRA + PENĚŽENKA
          ============================================================== */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1.15fr)]">
        {/* Hlavní výhra */}
        <Card className="rounded-2xl shadow-md border-border/70 bg-gradient-to-br from-background via-background/80 to-background">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-yellow-500/15 flex items-center justify-center">
                <Crown className="w-4 h-4 text-yellow-400" />
              </div>
              <CardTitle className="text-xl">Hlavní výhra</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold text-primary">{contest.main_prize}</p>

            {contest.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{contest.description}</p>
            )}

            {contest.main_prize_secondary_image && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Doplňkový obrázek hlavní výhry</p>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
                  <img
                    src={contest.main_prize_secondary_image}
                    alt="Hlavní výhra detail"
                    className="w-full max-h-64 object-cover"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground/90 pt-2 border-t border-border/60">
              <div className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                <span>
                  Ticketů v soutěži: <span className="font-medium">{contest.ticket_count.toLocaleString()}</span>
                </span>
              </div>
              <span>Vytvořeno: {new Date(contest.created_at).toLocaleDateString("cs-CZ")}</span>
            </div>
          </CardContent>
        </Card>

        {/* Peněženka + nákup */}
        <Card className="rounded-2xl shadow-md border-border/70">
          <CardHeader>
            <CardTitle>Tvá peněženka</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Zůstatek MioCoinů</span>
              <span className="text-lg font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-yellow-400" />
                {userWallet.balance_coins}
              </span>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleBuyTicket}
              disabled={purchasing || contest.status !== "active"}
            >
              {purchasing ? "Probíhá nákup ticketu…" : "Uplatnit 1 MioCoin"}
            </Button>

            <Button variant="outline" className="w-full" onClick={() => navigate("/wallet")}>
              Dobít MioCoiny
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ==============================================================
          3) PROGRESS BAR – CESTA K HLAVNÍ VÝHŘE (zatím statický design)
          ============================================================== */}
      <Card className="rounded-2xl shadow-md border-border/70 bg-gradient-to-r from-background via-background/80 to-background">
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Cesta k hlavní výhře</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Linka */}
          <div className="relative h-2 rounded-full bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-yellow-400/40 via-yellow-300/30 to-transparent" />
          </div>

          {/* Milníky – čistě vizuální, zatím bez logiky pro „sold“ */}
          <div className="flex justify-between text-[11px] text-muted-foreground/80">
            {["10 000", "50 000", "100 000", "250 000", "500 000", "750 000", "1 000 000"].map((label, index) => (
              <div key={label} className="flex flex-col items-center gap-1 flex-1">
                <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.7)]" />
                <span className={index === 6 ? "font-semibold text-yellow-300" : ""}>{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ==============================================================
          4) BONUSOVÉ VÝHRY
          ============================================================== */}
      <Card className="rounded-2xl shadow-md border-border/70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Gift className="w-4 h-4 text-primary" />
            </div>
            <CardTitle>Bonusové výhry</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {bonusPrizes.length > 0 ? (
            <div
              className={
                bonusPrizes.length <= 3 ? "grid gap-3 md:grid-cols-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              }
            >
              {bonusPrizes.map((bonus) => (
                <div
                  key={bonus.id}
                  className="rounded-xl border border-border/70 bg-card/80 p-3 flex flex-col gap-1 hover:border-yellow-500/60 hover:bg-card/90 transition-colors"
                >
                  <div className="text-sm font-semibold">{bonus.description}</div>
                  <div className="text-xs text-muted-foreground">
                    Výherní ticket: <span className="font-medium">{bonus.ticket_position.toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/80">Stav: {bonus.status}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pro tuto soutěž zatím nejsou definovány žádné bonusové výhry.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ==============================================================
          5) MAPA TICKETŮ
          ============================================================== */}
      <div className="mt-4">
        <TicketMap
          contestId={contest.id}
          contestTitle={contest.title}
          ticketCount={contest.ticket_count}
          ticketPrice={contest.ticket_price}
        />
      </div>

      {/* ==============================================================
          6) MOJE VÝHRY
          ============================================================== */}
      <Card className="rounded-2xl shadow-md border-border/70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <CardTitle>Moje výhry</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {userWins.length > 0 ? (
            <div className="space-y-3">
              {userWins.map((win) => (
                <div
                  key={win.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-xl border border-border/70 bg-card/80 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{win.type === "main" ? "Hlavní výhra" : "Bonusová výhra"}</p>
                    <p className="text-sm text-muted-foreground">{win.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">Stav: {win.status}</span>
                    {win.delivered && (
                      <Badge variant="outline" className="text-xs">
                        Doručeno
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">Zatím nemáš v této soutěži žádné výhry.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
