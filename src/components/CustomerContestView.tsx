import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { TicketMap } from "@/components/TicketMap";
import { Coins, Crown, Gift, Info } from "lucide-react";

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
  generated_poster_url?: string | null; // připraveno na AI plakát
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

export const CustomerContestView: React.FC<CustomerContestViewProps> = ({
  contest,
  bonusPrizes,
  userWallet,
  userWins,
  purchasing,
  onBuyTicket,
}) => {
  const navigate = useNavigate();

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

  const statusVariant =
    contest.status === "active"
      ? "default"
      : contest.status === "paused"
        ? "secondary"
        : contest.status === "finished"
          ? "outline"
          : "secondary";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      {/* HERO / BANNER */}
      {(contest.generated_poster_url || contest.banner_image) && (
        <div className="w-full rounded-2xl overflow-hidden bg-gradient-to-br from-background via-card to-background shadow-xl border border-border/60">
          <div className="relative">
            <img
              src={contest.generated_poster_url || contest.banner_image || ""}
              alt={`${contest.title} banner`}
              className="w-full max-h-[420px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/40 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground drop-shadow">{contest.title}</h1>
                {contest.description && (
                  <p className="mt-1 max-w-2xl text-sm md:text-base text-primary-foreground/90 drop-shadow">
                    {contest.description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                <Badge variant={statusVariant}>{statusLabel}</Badge>
                <Badge variant="outline" className="backdrop-blur bg-background/70">
                  <Coins className="w-4 h-4 mr-1" />
                  Cena ticketu: {contest.ticket_price} MioCoins
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HLAVNÍ INFORMACE O SOUTĚŽI */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1.1fr)]">
        {/* Detail hlavní výhry */}
        <Card className="rounded-2xl shadow-md border-border/70">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              <CardTitle className="text-xl">Hlavní výhra</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-lg font-semibold text-primary">{contest.main_prize}</p>
            {contest.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{contest.description}</p>
            )}
            <div className="text-xs text-muted-foreground/80 flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>
                Počet ticketů v soutěži: <span className="font-medium">{contest.ticket_count.toLocaleString()}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Peněženka + nákup ticketu */}
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

      {/* BONUSOVÉ VÝHRY */}
      <Card className="rounded-2xl shadow-md border-border/70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
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
                <div key={bonus.id} className="rounded-xl border border-border/70 bg-card/80 p-3 flex flex-col gap-1">
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

      {/* MAPA TICKETŮ */}
      <Card className="rounded-2xl shadow-md border-border/70">
        <CardHeader>
          <CardTitle>Mapa ticketů</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketMap contestId={contest.id} />
        </CardContent>
      </Card>

      {/* MOJE VÝHRY */}
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
