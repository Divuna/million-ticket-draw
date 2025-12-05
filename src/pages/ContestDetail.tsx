import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, Gift, Coins } from "lucide-react";

const ContestDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [contest, setContest] = useState<any>(null);
  const [bonusPrizes, setBonusPrizes] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [userWins, setUserWins] = useState<any[]>([]);
  const [ticketsPlayed, setTicketsPlayed] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const contestId = id ?? "";

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const { data: contestData } = await supabase.from("contests").select("*").eq("id", contestId).single();

      if (!contestData) {
        setLoading(false);
        return;
      }

      setContest(contestData);

      const { data: bonusData } = await supabase
        .from("bonus_prizes")
        .select("*")
        .eq("contest_id", contestId)
        .order("ticket_position", { ascending: true });

      if (bonusData) {
        const physical = bonusData.filter((b) => {
          if (!b.description) return false;
          const lower = b.description.toLowerCase();
          return !lower.startsWith("miocoin");
        });
        setBonusPrizes(physical);
      }

      const { count: ticketsCount } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("contest_id", contestId);

      setTicketsPlayed(ticketsCount ?? 0);

      if (user) {
        const { data: walletData } = await supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle();

        if (walletData) setWallet(walletData);

        const { data: winsData } = await supabase
          .from("winners")
          .select("*")
          .eq("contest_id", contestId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (winsData) setUserWins(winsData);
      }

      setLoading(false);
    };

    loadData();
  }, [contestId, user]);

  const progressPercent =
    contest && contest.ticket_count > 0 ? Math.round((ticketsPlayed / contest.ticket_count) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-6">
          <p className="text-center text-muted-foreground">Načítání…</p>
        </main>
        <BottomNavigation />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-6">
          <p className="text-center text-destructive">Soutěž nenalezena.</p>
        </main>
        <BottomNavigation />
      </div>
    );
  }

  const bannerSrc = contest.banner_image || contest.main_prize_secondary_image || "/corvette-banner.png"; // můžeš nahradit tím PNG s Corvette

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět
        </button>

        {/* HLAVNÍ PROMO CARD */}
        <Card className="bg-gradient-to-br from-black via-slate-900 to-black border border-yellow-500/20 shadow-[0_0_40px_rgba(250,204,21,0.25)] rounded-3xl overflow-hidden">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-transparent to-yellow-500/10 pointer-events-none" />
            <div className="absolute -top-20 -right-40 w-[380px] h-[380px] rounded-full bg-yellow-500/10 blur-3xl" />

            <div className="flex flex-col lg:flex-row items-stretch">
              {/* Levá část – text */}
              <div className="flex-1 px-6 sm:px-10 py-8 space-y-4 relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/40">
                    Vytvořeno: {new Date(contest.created_at).toLocaleDateString("cs-CZ")}
                  </Badge>

                  <div className="flex flex-col items-end text-xs sm:text-sm text-muted-foreground gap-1">
                    <span>
                      Cena tiketu: <span className="text-white font-semibold">{contest.ticket_price} MioCoinů</span>
                    </span>
                    <span>
                      Tiketů v soutěži:{" "}
                      <span className="text-white font-semibold">{contest.ticket_count?.toLocaleString("cs-CZ")}</span>
                    </span>
                    <span>
                      Odehráno:{" "}
                      <span className="text-white font-semibold">
                        {ticketsPlayed?.toLocaleString("cs-CZ")} ({progressPercent}%)
                      </span>
                    </span>
                  </div>
                </div>

                <CardTitle className="text-4xl sm:text-5xl font-bold text-yellow-400">{contest.title}</CardTitle>

                {contest.description && (
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line max-w-2xl">
                    {contest.description}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4">
                  <button className="w-full sm:w-64 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/30 transition">
                    Uplatnit {contest.ticket_price} MioCoinů
                  </button>

                  <div className="flex flex-col gap-1 sm:items-end flex-1">
                    <button className="w-full sm:w-40 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold py-3 rounded-xl shadow-lg shadow-yellow-500/30 transition">
                      Dobít MioCoiny
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Zůstatek:{" "}
                      <span className="text-white font-semibold">
                        {wallet?.amount?.toLocaleString("cs-CZ") ?? 0} MioCoinů
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Pravá část – banner s autem */}
              <div className="relative flex-1 min-h-[260px] lg:min-h-[320px]">
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-black/30 to-black/70" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[90%] max-w-md aspect-[3/2] rounded-3xl bg-gradient-to-br from-slate-900 via-black to-slate-900 border border-white/5 shadow-[0_0_50px_rgba(15,23,42,0.8)] overflow-hidden flex items-center justify-center">
                    <img src={bannerSrc} alt={contest.title} className="w-full h-full object-contain" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* CESTA K HLAVNÍ VÝHŘE – statická vizuální osa */}
        <Card className="bg-card/40 border border-white/10 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Cesta k hlavní výhře</CardTitle>
          </CardHeader>

          <CardContent className="pt-2">
            <div className="w-full h-3 rounded-full bg-black/60 overflow-hidden mb-6 shadow-inner">
              <div className="h-full bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500" />
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground mt-2">
              {["10 000", "50 000", "100 000", "250 000", "500 000", "750 000", "1 000 000"].map((step, index) => (
                <div key={index} className="flex flex-col items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.8)]" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* BONUSOVÉ VĚCNÉ VÝHRY */}
        <Card className="bg-card/40 border border-white/10 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-pink-400" /> Bonusové věcné výhry
            </CardTitle>
          </CardHeader>

          <CardContent>
            {bonusPrizes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Žádné bonusové výhry.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bonusPrizes.map((bonus) => (
                  <div
                    key={bonus.id}
                    className="p-4 rounded-2xl bg-gradient-to-br from-black/60 via-slate-900/60 to-black/60 border border-white/10 shadow-[0_0_20px_rgba(15,23,42,0.8)]"
                  >
                    <div className="text-sm text-muted-foreground mb-1">
                      Výherní ticket: <span className="text-white font-semibold">{bonus.ticket_position}</span>
                    </div>
                    <div className="font-semibold text-white text-sm">{bonus.description}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BONUSOVÉ MIOCOINY */}
        <Card className="bg-card/40 border border-yellow-500/40 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-yellow-400" /> Bonusové MioCoiny
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="p-4 bg-gradient-to-r from-black/70 via-slate-900/70 to-black/70 rounded-2xl border border-yellow-500/40 flex items-center gap-4 shadow-[0_0_25px_rgba(250,204,21,0.45)]">
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-400/60 flex items-center justify-center">
                <img src="/miocoin.png" alt="MioCoin" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <div className="text-yellow-300 font-bold text-xl">
                  {contest.total_miocoin_bonus?.toLocaleString("cs-CZ") ?? 0} MioCoinů
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Celkový počet bonusových MioCoin výher v této soutěži.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MOJE VÝHRY */}
        <Card className="bg-card/40 border border-white/10 rounded-2xl mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-emerald-400" /> Moje výhry
            </CardTitle>
          </CardHeader>

          <CardContent>
            {!user && <p className="text-muted-foreground text-sm">Pro zobrazení výher je potřeba být přihlášen.</p>}

            {user && userWins.length === 0 && <p className="text-muted-foreground text-sm">Nemáš žádné výhry.</p>}

            {user && userWins.length > 0 && (
              <ul className="space-y-3">
                {userWins.map((win) => (
                  <li key={win.id} className="p-4 rounded-xl bg-black/40 border border-white/10 text-sm">
                    <div className="font-semibold text-white">{win.prize_name ?? "Výhra"}</div>
                    {win.notes && <div className="text-xs text-muted-foreground mt-1">{win.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default ContestDetail;
