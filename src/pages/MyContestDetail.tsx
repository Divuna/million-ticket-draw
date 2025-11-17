/* eslint-disable */
type Contest = any;
type BonusPrize = any;
type UserWin = any;

import React, { useEffect, useState } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MyContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  const [contest, setContest] = useState<Contest | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [userWins, setUserWins] = useState<UserWin[]>([]);
  const [ticketCount, setTicketCount] = useState(0);
  const [userTickets, setUserTickets] = useState(0);

  const [loadingContest, setLoadingContest] = useState(true);
  const [loadingBonuses, setLoadingBonuses] = useState(true);
  const [loadingWins, setLoadingWins] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);

  useEffect(() => {
    if (id && user) {
      fetchContestData();
      fetchBonusPrizes();
      fetchUserWins();
      fetchTicketData();
    }
  }, [id, user]);

  const fetchContestData = async () => {
    try {
      if (!id) return;

      const { data, error } = await supabase.from("contests").select("*").eq("id", id).single();

      if (error) throw error;
      setContest(data);
    } catch (error) {
      console.error("Error fetching contest:", error);
    } finally {
      setLoadingContest(false);
    }
  };

  const fetchBonusPrizes = async () => {
    try {
      if (!id) return;

      const { data, error } = await supabase
        .from("bonus_prizes")
        .select("*")
        .eq("contest_id", id)
        .order("ticket_position", { ascending: true });

      if (error) throw error;
      setBonusPrizes(data || []);
    } catch (error) {
      console.error("Error fetching bonus prizes:", error);
    } finally {
      setLoadingBonuses(false);
    }
  };

  const fetchUserWins = async () => {
    try {
      if (!user || !id) return;

      const { data, error } = await supabase.from("winners").select("*").eq("user_id", user.id).eq("contest_id", id);

      if (error) throw error;

      const wins: UserWin[] = [];

      for (const win of data || []) {
        let description = "";

        if (win.type === "main") {
          description = contest?.main_prize || "Hlavní cena";
        } else {
          const bonusPrize = bonusPrizes.find((bp) => bp.status === "won");
          description = bonusPrize?.description || "Bonusová cena";
        }

        wins.push({
          ...win,
          contest_title: contest?.title,
          description,
        });
      }

      setUserWins(wins);
    } catch (error) {
      console.error("Error fetching user wins:", error);
    } finally {
      setLoadingWins(false);
    }
  };

  const fetchTicketData = async () => {
    try {
      if (!id || !user) return;

      const { count: totalCount } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("contest_id", id);

      const { count: userCount } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("contest_id", id)
        .eq("user_id", user.id);

      setTicketCount(totalCount || 0);
      setUserTickets(userCount || 0);
    } catch (error) {
      console.error("Error fetching ticket data:", error);
    } finally {
      setLoadingTickets(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "closed":
        return "bg-gray-500";
      case "draft":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Aktivní";
      case "closed":
        return "Ukončená";
      case "draft":
        return "Příprava";
      default:
        return status;
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (loadingContest) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Soutěž nenalezena</h1>
            <p className="text-muted-foreground">Požadovaná soutěž neexistuje nebo byla odstraněna.</p>
          </div>
        </div>
      </div>
    );
  }

  const progressPercentage = contest.ticket_count > 0 ? (ticketCount / contest.ticket_count) * 100 : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <button
            onClick={() => navigate("/my-contests")}
            className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na Moje hry
          </button>

          <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-2xl text-primary">{contest.title}</CardTitle>
                <Badge className={`${getStatusColor(contest.status)} text-white`}>
                  {getStatusText(contest.status)}
                </Badge>
              </div>
              {contest.description && <p className="text-muted-foreground mt-2">{contest.description}</p>}
            </CardHeader>
          </Card>

          <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Trophy className="h-5 w-5" />
                Hlavní cena / Megajackpot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium">{contest.main_prize}</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-neon-purple">
                <Trophy className="h-5 w-5" />
                Moje výhry
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingWins ? (
                <Skeleton className="h-16 w-full" />
              ) : userWins.length === 0 ? (
                <p className="text-muted-foreground">Žádné výhry</p>
              ) : (
                <div className="space-y-3">
                  {userWins.map((win: any) => (
                    <div key={win.id} className="flex justify-between items-center p-3 bg-secondary/20 rounded-lg">
                      <div>
                        <p className="font-medium">{win.type === "main" ? "Hlavní cena" : "Bonusová cena"}</p>
                        <p className="text-sm text-muted-foreground">{win.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(win.created_at).toLocaleDateString("cs-CZ")}
                        </p>
                      </div>
                      <Badge variant={win.delivered ? "default" : "secondary"}>
                        {win.delivered ? "Předáno" : win.status || "Čeká na potvrzení"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default MyContestDetail;
