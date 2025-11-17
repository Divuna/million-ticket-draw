import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { toast } from "@/hooks/use-toast";
import { TicketResultModal } from "@/components/TicketResultModal";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";

import { AdminContestView } from "@/components/AdminContestView";
import { CustomerContestView } from "@/components/CustomerContestView";

// ✅ OPRAVENÁ DEFINICE — bezpečná, kompatibilní, nepadá
interface Contest {
  id: string;
  title?: string | null;
  description?: string | null;
  main_prize?: any;
  ticket_price?: number | null;
  status?: string | null;
  ticket_count?: number | null;
  created_at?: string | null;
  [key: string]: any; // chrání před chybami Lovable
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

interface TicketResult {
  ticket_number: number;
  distance_to_next_bonus: number | null;
  next_bonus_position: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: "bonus" | "main" | null;
  bonus_prize_id?: string | null;
}

const ContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [currentTickets, setCurrentTickets] = useState(0);
  const [userWallet, setUserWallet] = useState<UserWallet>({ balance_coins: 0 });
  const [userWins, setUserWins] = useState<UserWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [ticketResult, setTicketResult] = useState<TicketResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    if (id) fetchContestData();
  }, [id]);

  useEffect(() => {
    if (user) {
      fetchUserWallet();
      fetchUserWins();
    }
  }, [user, id]);

  const fetchContestData = async () => {
    try {
      if (!id) return;

      const { data: contestData, error: contestError } = await supabase
        .from("contests")
        .select("*")
        .eq("id", id)
        .single();

      if (contestError) throw contestError;
      setContest(contestData);

      const { data: bonusData, error: bonusError } = await supabase
        .from("bonus_prizes")
        .select("*")
        .eq("contest_id", id)
        .order("ticket_position", { ascending: true });

      if (bonusError) throw bonusError;
      setBonusPrizes(bonusData || []);

      const { count } = await supabase.from("tickets").select("*", { head: true, count: "exact" }).eq("contest_id", id);

      setCurrentTickets(count || 0);
    } catch (error) {
      console.error("Error fetching contest data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserWallet = async () => {
    try {
      if (!user) return;

      const { data, error } = await supabase.from("wallets").select("balance_coins").eq("user_id", user.id).single();

      if (error) throw error;
      setUserWallet({ balance_coins: data?.balance_coins || 0 });
    } catch {
      setUserWallet({ balance_coins: 0 });
    }
  };

  const fetchUserWins = async () => {
    try {
      if (!user || !id) return;

      const { data, error } = await supabase
        .from("winners")
        .select(
          `
          id,
          type,
          delivered,
          prize_id,
          contest_id,
          contests!inner(main_prize)
        `,
        )
        .eq("user_id", user.id)
        .eq("contest_id", id);

      if (error) throw error;

      const wins: UserWin[] = [];

      for (const win of data || []) {
        let description = "";

        if (win.type === "main") {
          description = (win.contests as any)?.main_prize || "Hlavní cena";
        } else if (win.type === "bonus" && win.prize_id) {
          const { data: bonusData } = await supabase
            .from("bonus_prizes")
            .select("description")
            .eq("id", win.prize_id)
            .single();

          description = bonusData?.description || "Bonusová cena";
        }

        wins.push({
          id: win.id,
          description,
          type: win.type,
          status: (win as any).status || "čeká na potvrzení",
          delivered: win.delivered,
        });
      }

      setUserWins(wins);
    } catch {
      setUserWins([]);
    }
  };

  const buyTicket = async () => {
    if (!user || !contest) return;

    if (contest.status !== "active") {
      toast({
        title: "Nedostupná akce",
        description: contest.status === "paused" ? "Soutěž je pozastavena." : "Soutěž je uzavřena.",
        variant: "destructive",
      });
      return;
    }

    if (userWallet.balance_coins < 1) {
      toast({
        title: "Nedostatek mincí",
        description: "Potřebujete minci.",
        variant: "destructive",
      });
      return;
    }

    setPurchasing(true);

    try {
      const { data, error } = await supabase.rpc("unlock_ticket", {
        contest_id: contest.id,
        user_id: user.id,
      });

      if (error || !data) throw error;

      const result: TicketResult = {
        ticket_number: data.ticket_number,
        distance_to_next_bonus: data.distance_to_next_bonus,
        next_bonus_position: data.next_bonus_position,
        won_prize: data.won_prize,
        won_type: data.won_type,
        bonus_prize_id: data.bonus_prize_id,
        remaining_tickets: data.remaining_tickets,
      };

      setTicketResult(result);
      setShowResultModal(true);

      await fetchUserWallet();
      await fetchUserWins();
    } catch (error) {
      toast({
        title: "Chyba",
        description: "Nákup se nepodařil.",
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  if (!session) return <Navigate to="/login" replace />;

  const { isAdmin } = useUserRole();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <p>Načítám soutěž...</p>
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold">Soutěž nenalezena</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8">
        {isAdmin ? (
          <AdminContestView
            contest={contest as any}
            bonusPrizes={bonusPrizes}
            currentTickets={currentTickets}
            userWallet={userWallet}
            purchasing={purchasing}
            onBuyTicket={buyTicket}
          />
        ) : (
          <CustomerContestView
            contest={contest as any}
            bonusPrizes={bonusPrizes}
            userWallet={userWallet}
            userWins={userWins}
            purchasing={purchasing}
            onBuyTicket={buyTicket}
          />
        )}
      </div>

      <TicketResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        contestId={contest?.id || ""}
        result={ticketResult}
      />

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default ContestDetail;
