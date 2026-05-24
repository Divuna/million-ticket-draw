import React from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Crown, Gift, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";


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
  main_prize_secondary_image?: string | null;
}

interface BonusPrize {
  id: string;
  description: string;
  ticket_position: number;
  status: string;
  image_url?: string | null;
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

  const heroImage = contest.generated_poster_url || contest.banner_image || undefined;

  const createdAt = contest.created_at ? new Date(contest.created_at) : undefined;

  const formattedCreatedAt = createdAt
    ? createdAt.toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-28">
      {/* HERO sekce */}
      <section className="rounded-3xl overflow-hidden border border-border/60 bg-gradient-to-b from-[#050816] via-background to-background shadow-[0_0_60px_rgba(0,0,0,0.55)]">
        <div className="relative">
          {heroImage && (
            <>
              <img src={heroImage} alt={`${contest.title} banner`} className="w-full max-h-[420px] object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),transparent_55%)]" />
            </>
          )}

          {/* Obsah hero */}
          <div className="relative px-6 md:px-10 pt-8 md:pt-10 pb-6 md:pb-10 flex flex-col gap-6">
            {/* Horní meta řádek */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={statusVariant} className="backdrop-blur bg-background/70 border-border/60">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  {statusLabel}
                </Badge>

                {formattedCreatedAt && (
                  <span className="text-xs md:text-sm text-muted-foreground/80">
                    Vytvořeno: <span className="font-medium">{formattedCreatedAt}</span>
                  </span>
                )}
              </div>

              <div className="hidden md:flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-[#FFB547]" />
                  <span>
                    Cena ticketu:{" "}
                    <span className="font-semibold">
                      {contest.ticket_price} MioCoin
                      {contest.ticket_price === 1 ? "" : "ů"}
                    </span>
                  </span>
                </div>
                <span className="h-4 w-px bg-border/60" />
                <div className="flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-primary" />
                  <span>
                    Ticketů v soutěži:{" "}
                    <span className="font-semibold">{contest.ticket_count.toLocaleString("cs-CZ")}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Titulek + CTA */}
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start lg:items-end justify-between">
              <div className="space-y-3 max-w-2xl">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#FFB547] via-[#FF8A00] to-[#FFB547] drop-shadow-[0_0_30px_rgba(255,138,0,0.45)]">
                    {contest.title}
                  </span>
                </h1>

                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {contest.description || "Vyber si svůj ticket, zapoj se do hry a zkus štěstí v této soutěži."}
                </p>

                <div className="inline-flex items-center gap-2 rounded-full bg-background/70 border border-border/60 px-3 py-1.5 text-xs md:text-sm text-muted-foreground">
                  <Crown className="w-4 h-4 text-[#FFB547]" />
                  <span className="font-medium text-foreground/90">Hlavní výhra:</span>
                  <span>{contest.main_prize}</span>
                </div>
              </div>

              {/* CTA blok */}
              <div className="flex flex-col gap-2 w-full sm:w-auto max-w-xs sm:max-w-none sm:items-end">
                <Button
                  size="lg"
                  variant="premium"
                  className="w-full sm:w-auto min-w-[200px] text-base font-semibold"
                  onClick={handleBuyTicket}
                  disabled={purchasing || contest.status !== "active"}
                >
                  {purchasing
                    ? "Probíhá nákup ticketu…"
                    : `Uplatnit ${contest.ticket_price} MioCoin${contest.ticket_price === 1 ? "" : "ů"}`}
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto border-border/70 bg-background/60"
                  onClick={() => navigate("/wallet")}
                >
                  Dobít MioCoiny
                </Button>
                <span className="text-[11px] text-muted-foreground/80 mt-1 text-center sm:text-right">
                  Zůstatek:{" "}
                  <span className="font-semibold text-foreground">
                    {userWallet.balance_coins} MioCoin
                    {userWallet.balance_coins === 1 ? "" : "ů"}
                  </span>
                </span>
              </div>
            </div>

            {/* Spodní meta řádek – responzivní verze ticket info */}
            <div className="flex md:hidden flex-wrap items-center gap-3 pt-1 border-t border-border/50 mt-2 pt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coins className="w-3.5 h-3.5 text-[#FFB547]" />
                <span>
                  Cena ticketu:{" "}
                  <span className="font-semibold">
                    {contest.ticket_price} MioCoin
                    {contest.ticket_price === 1 ? "" : "ů"}
                  </span>
                </span>
              </div>
              <span className="h-3 w-px bg-border/60" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 text-primary" />
                <span>
                  Ticketů: <span className="font-semibold">{contest.ticket_count.toLocaleString("cs-CZ")}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Detail + peněženka / info */}
      <section className="grid gap-5 md:grid-cols-[minmax(0,2.1fr),minmax(0,1.1fr)]">
        {/* Detail výhry + text */}
        <Card className="rounded-3xl shadow-md border-border/70 bg-gradient-to-b from-background/80 to-background/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-[#FFB547]" />
              <CardTitle className="text-xl">Detail hlavní výhry</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold text-primary">{contest.main_prize}</p>

            {contest.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{contest.description}</p>
            )}

            {contest.main_prize_secondary_image && (
              <div className="mt-2">
                <div className="text-xs text-muted-foreground/80 mb-1">Doplňkový obrázek hlavní výhry</div>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                  <img
                    src={contest.main_prize_secondary_image}
                    alt="Detail hlavní výhry"
                    className="w-full max-h-[260px] object-cover"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80 border-t border-border/60 mt-2">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>
                  Ticketů v soutěži:{" "}
                  <span className="font-semibold">{contest.ticket_count.toLocaleString("cs-CZ")}</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Peněženka / meta info */}
        <Card className="rounded-3xl shadow-md border-border/70 bg-gradient-to-b from-background/90 via-background/70 to-background/40">
          <CardHeader className="pb-3">
            <CardTitle>Tvá peněženka</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Zůstatek MioCoinů</span>
              <span className="text-lg font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#FFB547]" />
                {userWallet.balance_coins}
              </span>
            </div>

            <Button
              className="w-full"
              size="lg"
              variant="premium"
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
      </section>

      {/* Cesta k hlavní výhře */}
      <Card className="rounded-3xl shadow-md border-border/70 bg-gradient-to-b from-background/90 via-background/70 to-background">
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Cesta k hlavní výhře</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress line */}
          <div className="relative w-full h-2 rounded-full bg-gradient-to-r from-border/50 via-border/40 to-border/20 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-full bg-[radial-gradient(circle_at_center,_rgba(255,138,0,0.2),transparent_55%)] opacity-60" />
            <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-[rgba(255,138,0,0.7)] via-[rgba(255,181,71,0.6)] to-transparent shadow-[0_0_30px_rgba(255,138,0,0.5)]" />
          </div>

          {/* Milestones */}
          <div className="relative mt-3">
            <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground/80">
              {[
                { value: 10000, label: "10 000" },
                { value: 50000, label: "50 000" },
                { value: 100000, label: "100 000" },
                { value: 250000, label: "250 000" },
                { value: 500000, label: "500 000" },
                { value: 750000, label: "750 000" },
                { value: 1000000, label: "1 000 000" },
              ].map((milestone, index) => (
                <div key={milestone.value} className="flex flex-col items-center gap-1 min-w-[40px]">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#FFB547] to-[#FF8A00] shadow-[0_0_16px_rgba(255,138,0,0.9)]" />
                  <span>{milestone.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BONUSOVÉ VĚCNÉ VÝHRY */}
      {(() => {
        const physicalPrizes = bonusPrizes.filter((prize) => {
          const desc = prize.description.toLowerCase();
          // Filter out MioCoin bonuses
          if (desc.includes("miocoin") || desc.includes("mio coin")) return false;
          // Filter out pure number descriptions (like "100" meaning 100 MioCoins)
          if (/^\d+$/.test(prize.description.trim())) return false;
          return true;
        });

        return (
          <Card className="rounded-3xl shadow-md border-border/70 bg-gradient-to-b from-background/90 via-background/70 to-background">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-primary" />
                <CardTitle>Bonusové věcné výhry</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {physicalPrizes.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 md:gap-3 auto-rows-[140px] sm:auto-rows-[160px] md:auto-rows-[180px]">
                  {physicalPrizes.map((prize, idx) => {
                    const patternIndex = idx % 6;
                    let spanClass = '';
                    if (patternIndex === 0) spanClass = 'col-span-2 row-span-2';
                    else if (patternIndex === 3) spanClass = 'col-span-2';
                    else if (patternIndex === 4) spanClass = 'col-span-2 row-span-2';
                    else spanClass = 'col-span-1';

                    return (
                      <div
                        key={prize.id}
                        className={`${spanClass} rounded-2xl border border-border/70 bg-card/80 overflow-hidden relative group`}
                      >
                        {prize.image_url && (
                          <div className="absolute inset-0">
                            <img 
                              src={prize.image_url} 
                              alt={prize.description}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                          </div>
                        )}
                        <div className="relative z-10 flex flex-col justify-end h-full p-3 md:p-4">
                          <p className="text-sm font-medium text-foreground drop-shadow-lg">{prize.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  Zatím nebyly přidány žádné věcné bonusové výhry.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

    </div>
  );
};
