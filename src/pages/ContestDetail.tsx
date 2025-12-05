import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Gift, Ticket, Trophy, Wallet as WalletIcon, Coins } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ContestDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const [contest, setContest] = useState<any>(null);
  const [bonusPrizes, setBonusPrizes] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [userWins, setUserWins] = useState<any[]>([]);
  const [ticketsPlayed, setTicketsPlayed] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const contestId = id ?? "";

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1) Soutěž + total_miocoin_bonus
        const { data: contestData, error: contestError } = await supabase
          .from("contests")
          .select("*")
          .eq("id", contestId)
          .single();

        if (contestError || !contestData) {
          setError("Nepodařilo se načíst soutěž.");
          setLoading(false);
          return;
        }

        setContest(contestData);

        // 2) Bonusové výhry – pouze věcné (NE MioCoiny)
        const { data: allBonusPrizes, error: bonusError } = await supabase
          .from("bonus_prizes")
          .select("*")
          .eq("contest_id", contestId)
          .order("ticket_position", { ascending: true });

        if (!bonusError && allBonusPrizes) {
          const onlyPhysical = allBonusPrizes.filter((b: any) => {
            if (!b.description) return false;
            const lower = b.description.toLowerCase();
            return !lower.startsWith("miocoin");
          });

          setBonusPrizes(onlyPhysical);
        }

        // 3) Odehrané tickety
        const { count: ticketsCount } = await supabase
          .from("tickets")
          .select("*", { count: "exact", head: true })
          .eq("contest_id", contestId);

        setTicketsPlayed(ticketsCount ?? 0);

        // 4) Peněženka
        if (user) {
          const { data: walletData } = await supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle();

          if (walletData) setWallet(walletData);

          // 5) Výhry uživatele v soutěži
          const { data: winsData } = await supabase
            .from("winners")
            .select("*")
            .eq("contest_id", contestId)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (winsData) setUserWins(winsData);
        }
      } catch (err) {
        setError("Při načítání soutěže došlo k chybě.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [contestId, user]);

  const progressPercent =
    contest && contest.ticket_count > 0 ? Math.round((ticketsPlayed / contest.ticket_count) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </main>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-6">
          <p className="text-center text-destructive">{error}</p>
        </main>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* tlačítko zpět */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na soutěže
        </button>

        {/* HLAVNÍ INFO O SOUTĚŽI */}
        <Card className="bg-card/40 border border-primary/20 shadow-lg">
          {contest.main_prize_secondary_image && (
            <img src={contest.main_prize_secondary_image} alt={contest.title} className="w-full h-56 object-cover" />
          )}

          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-400" />
              {contest.title}
            </CardTitle>

            <div className="flex gap-2 flex-wrap text-sm">
              <Badge variant="secondary">Hlavní výhra: {contest.main_prize}</Badge>
              <Badge variant="outline">Cena tiketu: {contest.ticket_price} MioCoinů</Badge>
            </div>
          </CardHeader>

          {contest.description && (
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{contest.description}</p>
            </CardContent>
          )}
        </Card>

        {/* CESTA K HLAVNÍ VÝHŘE */}
        <Card className="bg-card/40 border border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="h-5 w-5 text-primary" />
              Cesta k hlavní výhře
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Odehráno: {ticketsPlayed.toLocaleString("cs-CZ")}</span>
              <span>{progressPercent}%</span>
            </div>
          </CardContent>
        </Card>

        {/* BONUSOVÉ VĚCNÉ VÝHRY */}
        <Card className="bg-card/40 border border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-pink-400" />
              Bonusové věcné výhry
            </CardTitle>
          </CardHeader>

          <CardContent>
            {bonusPrizes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné věcné bonusové výhry nejsou nastavené.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bonusPrizes.map((bonus) => (
                  <div key={bonus.id} className="p-3 rounded-xl bg-black/30 border border-white/10">
                    <div className="font-medium text-sm">{bonus.description}</div>
                    <div className="text-xs text-muted-foreground">Výherní ticket: {bonus.ticket_position}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BONUSOVÉ MIOCOINY – JEDEN BOX */}
        <Card className="bg-card/40 border border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-yellow-400" />
              Bonusové MioCoiny
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="p-4 rounded-xl bg-black/30 border border-yellow-500/30">
              <div className="text-lg font-semibold text-yellow-300">
                {contest.total_miocoin_bonus?.toLocaleString("cs-CZ") || 0} MioCoinů
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Celkový součet bonusových MioCoin výher v této soutěži.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MOJE VÝHRY */}
        <Card className="bg-card/40 border border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-emerald-400" />
              Moje výhry v této soutěži
            </CardTitle>
          </CardHeader>

          <CardContent>
            {!user && <p className="text-sm text-muted-foreground">Pro zobrazení výher se přihlaste.</p>}

            {user && userWins.length === 0 && <p className="text-sm text-muted-foreground">Nemáš žádné výhry.</p>}

            {user && userWins.length > 0 && (
              <ul className="space-y-2">
                {userWins.map((win) => (
                  <li key={win.id} className="p-3 rounded-xl bg-black/30 border border-white/10 text-sm">
                    <div className="font-medium">
                      {win.type === "main" ? "Hlavní výhra" : win.type === "bonus" ? "Bonusová výhra" : "Výhra"}
                    </div>
                    {win.notes && <p className="text-xs text-muted-foreground">{win.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default ContestDetail;
