import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Trophy, Gift, Coins, Wallet as WalletIcon } from "lucide-react";

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

        {/* HLAVNÍ CARD */}
        <Card className="bg-card/40 border border-primary/20 shadow-xl rounded-2xl overflow-hidden">
          {/* Banner obrázek */}
          {contest.banner_image && (
            <img src={contest.banner_image} alt={contest.title} className="w-full h-64 object-cover" />
          )}

          <CardHeader className="space-y-3">
            <div className="flex justify-between items-center">
              <Badge variant="secondary">Vytvořeno: {new Date(contest.created_at).toLocaleDateString("cs-CZ")}</Badge>

              <div className="flex items-center gap-3 text-sm">
                <span>Cena tiketu: {contest.ticket_price} MioCoinů</span>
                <span>Tiketů v soutěži: {contest.ticket_count.toLocaleString("cs-CZ")}</span>
              </div>
            </div>

            <CardTitle className="text-4xl font-bold text-yellow-400">{contest.title}</CardTitle>

            {contest.description && (
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{contest.description}</p>
            )}
          </CardHeader>

          <CardContent className="flex flex-col md:flex-row gap-6">
            <button className="w-full md:w-64 bg-primary hover:bg-primary/80 text-white font-semibold py-3 rounded-xl shadow-lg">
              Uplatnit {contest.ticket_price} MioCoinů
            </button>

            <div className="flex flex-col gap-2">
              <button className="w-full md:w-48 bg-secondary hover:bg-secondary/80 text-white font-semibold py-3 rounded-xl shadow">
                Dobít MioCoiny
              </button>
              <span className="text-sm text-muted-foreground">
                Zůstatek: {wallet?.amount?.toLocaleString("cs-CZ") ?? 0} MioCoinů
              </span>
            </div>
          </CardContent>
        </Card>

        {/* CESTA K HLAVNÍ VÝHŘE – statická verze */}
        <Card className="bg-card/40 border border-white/10 rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Cesta k hlavní výhře</CardTitle>
          </CardHeader>

          <CardContent className="pt-2">
            <div className="w-full h-3 rounded-full bg-black/30 overflow-hidden mb-6">
              <div className="h-full bg-yellow-400" style={{ width: "100%" }} />
            </div>

            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground mt-2">
              {["10 000", "50 000", "100 000", "250 000", "500 000", "750 000", "1 000 000"].map((step, index) => (
                <div key={index} className="flex flex-col items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-lg shadow-yellow-500/40"></div>
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
                  <div key={bonus.id} className="p-4 rounded-xl bg-black/30 border border-white/10 shadow-lg">
                    <div className="font-medium text-white">{bonus.description}</div>
                    <div className="text-xs text-muted-foreground">Výherní ticket: {bonus.ticket_position}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BONUSOVÉ MIOCOINY */}
        <Card className="bg-card/40 border border-white/10 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-yellow-400" /> Bonusové MioCoiny
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="p-4 bg-black/30 rounded-xl border border-yellow-400/40 flex items-center gap-4">
              <img src="/miocoin.png" alt="MioCoin" className="w-10 h-10 object-contain" />
              <div>
                <div className="text-yellow-300 font-bold text-xl">
                  {contest.total_miocoin_bonus?.toLocaleString("cs-CZ") ?? 0} MioCoinů
                </div>
                <div className="text-xs text-muted-foreground">Celkový počet bonusových Miocoin výher v soutěži.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MOJE VÝHRY */}
        <Card className="bg-card/40 border border-white/10 rounded-2xl">
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
                  <li key={win.id} className="p-4 rounded-xl bg-black/30 border border-white/10 text-sm">
                    <div className="font-semibold text-white">{win.prize_name ?? "Výhra"}</div>
                    {win.notes && <div className="text-xs text-muted-foreground">{win.notes}</div>}
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
