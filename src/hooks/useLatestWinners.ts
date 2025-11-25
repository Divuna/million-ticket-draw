import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
    queryKey: ['latest-winners', limit],
    queryFn: async () => {
      // Fetch winners with user, contest, and bonus prize data
      const { data: winnersData, error } = await supabase
        .from('winners')
        .select(`
          id,
          user_id,
          contest_id,
          prize_id,
          type,
          created_at,
          users!inner(
            id,
            name,
            nickname,
            first_name,
            last_name
          ),
          contests!inner(
            id,
            title,
            main_prize
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Fetch bonus prizes info if needed
      const bonusPrizeIds = winnersData
        ?.filter(w => w.type === 'bonus' && w.prize_id)
        .map(w => w.prize_id)
        .filter(Boolean) || [];

      let bonusPrizesMap = new Map();
      if (bonusPrizeIds.length > 0) {
        const { data: bonusPrizes } = await supabase
          .from('bonus_prizes')
          .select('id, description, amount')
          .in('id', bonusPrizeIds);

        bonusPrizesMap = new Map(
          bonusPrizes?.map(bp => [bp.id, bp]) || []
        );
      }

      // Format winners data
      const winners: Winner[] = (winnersData || []).map(winner => {
        const user = winner.users as any;
        const contest = winner.contests as any;
        
        let prizeName = '';
        if (winner.type === 'main') {
          prizeName = contest.main_prize;
        } else if (winner.type === 'bonus' && winner.prize_id) {
          const bonusPrize = bonusPrizesMap.get(winner.prize_id);
          if (bonusPrize) {
            prizeName = bonusPrize.amount 
              ? `${bonusPrize.amount} MioCoins` 
              : bonusPrize.description || 'Bonus';
          } else {
            prizeName = 'Bonus';
          }
        } else {
          prizeName = 'Výhra';
        }

        const userName = user.nickname || user.name || 
          (user.first_name && user.last_name 
            ? `${user.first_name} ${user.last_name}` 
            : user.email);

        return {
          id: winner.id,
          user_id: winner.user_id,
          user_name: userName,
          user_nickname: user.nickname,
          prize_name: prizeName,
          contest_title: contest.title,
          created_at: winner.created_at,
          type: winner.type,
        };
      });

      return winners;
    },
  });
};
