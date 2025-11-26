import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Winner {
  id: string;
  user_id: string;
  user_name: string;
  user_nickname: string | null;
  prize_name: string;
  contest_title: string;
  created_at: string;
  type: string;
}

export const useLatestWinners = (limit: number = 50) => {
  return useQuery({
    queryKey: ["latest-winners", limit],
    queryFn: async () => {
      // 1) Fetch winners only (NO JOINS → no RLS problems)
      const { data: winnersData, error } = await supabase
        .from("winners")
        .select("id, user_id, contest_id, prize_id, type, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      if (!winnersData || winnersData.length === 0) {
        return [];
      }

      // Extract user_ids and contest_ids
      const userIds = [...new Set(winnersData.map((w) => w.user_id))];

      const contestIds = [...new Set(winnersData.map((w) => w.contest_id))];

      const bonusPrizeIds = winnersData.filter((w) => w.type === "bonus" && w.prize_id).map((w) => w.prize_id);

      // 2) Fetch users separately
      const { data: users } = await supabase
        .from("users")
        .select("id, name, nickname, first_name, last_name, email")
        .in("id", userIds);

      const usersMap = new Map(users?.map((u) => [u.id, u]) || []);

      // 3) Fetch contests separately
      const { data: contests } = await supabase.from("contests").select("id, title, main_prize").in("id", contestIds);

      const contestsMap = new Map(contests?.map((c) => [c.id, c]) || []);

      // 4) Fetch bonus prizes
      let bonusPrizesMap = new Map();
      if (bonusPrizeIds.length > 0) {
        const { data: bonusPrizes } = await supabase
          .from("bonus_prizes")
          .select("id, description, amount")
          .in("id", bonusPrizeIds);

        bonusPrizesMap = new Map(bonusPrizes?.map((bp) => [bp.id, bp]) || []);
      }

      // 5) Final result mapping
      const result: Winner[] = winnersData.map((winner) => {
        const user = usersMap.get(winner.user_id);
        const contest = contestsMap.get(winner.contest_id);

        let prizeName = "";
        if (winner.type === "main") {
          prizeName = contest?.main_prize || "Hlavní výhra";
        } else if (winner.type === "bonus") {
          const bonus = bonusPrizesMap.get(winner.prize_id);
          if (bonus) {
            prizeName = bonus.amount ? `${bonus.amount} MioCoins` : bonus.description || "Bonus";
          } else {
            prizeName = "Bonus";
          }
        } else {
          prizeName = "Výhra";
        }

        const userName =
          user?.nickname ||
          user?.name ||
          (user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : user?.email || "Uživatel");

        return {
          id: winner.id,
          user_id: winner.user_id,
          user_name: userName,
          user_nickname: user?.nickname || null,
          prize_name: prizeName,
          contest_title: contest?.title || "Soutěž",
          created_at: winner.created_at,
          type: winner.type,
        };
      });

      return result;
    },
  });
};
