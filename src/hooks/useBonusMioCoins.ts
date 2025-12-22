import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface BonusPrize {
  id: string;
  description: string;
  amount: number;
  title: string | null;
  contest_id: string;
  ticket_position: number;
}

interface UseBonusMioCoinsResult {
  bonuses: BonusPrize[];
  totalBonusBalance: number;
  loading: boolean;
  claiming: string | null;
  refresh: () => Promise<void>;
  claimBonus: (bonusId: string) => Promise<boolean>;
}

export const useBonusMioCoins = (userId: string | undefined): UseBonusMioCoinsResult => {
  const [bonuses, setBonuses] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchBonuses = useCallback(async () => {
    if (!userId) {
      setBonuses([]);
      setLoading(false);
      return;
    }

    try {
      // First get winner records for user with type 'bonus'
      const { data: winnersData, error: winnersError } = await supabase
        .from('winners')
        .select('prize_id')
        .eq('user_id', userId)
        .eq('type', 'bonus');

      if (winnersError) {
        console.error('Error fetching winners:', winnersError);
        setBonuses([]);
        return;
      }

      if (!winnersData || winnersData.length === 0) {
        setBonuses([]);
        return;
      }

      // Get prize IDs from winners
      const prizeIds = winnersData
        .map(w => w.prize_id)
        .filter((id): id is string => id !== null);

      if (prizeIds.length === 0) {
        setBonuses([]);
        return;
      }

      // Fetch all pending bonus prizes (regardless of amount - even 0 or 1 MioCoin bonuses should appear)
      const { data: bonusData, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('id, description, amount, title, contest_id, ticket_position')
        .in('id', prizeIds)
        .eq('status', 'pending');

      if (bonusError) {
        console.error('Error fetching bonus prizes:', bonusError);
        setBonuses([]);
        return;
      }

      setBonuses(bonusData || []);
    } catch (error) {
      console.error('Error fetching bonus MioCoins:', error);
      setBonuses([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchBonuses();
  }, [fetchBonuses]);

  const claimBonus = async (bonusId: string): Promise<boolean> => {
    if (!userId) return false;

    setClaiming(bonusId);
    try {
      const { error } = await supabase.rpc('claim_miocoin_bonus', {
        p_bonus_id: bonusId,
        p_user_id: userId
      });

      if (error) {
        console.error('Error claiming bonus:', error);
        toast({
          title: "Chyba",
          description: "Nepodařilo se převést bonus. Zkuste to znovu.",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Úspěch!",
        description: "MioCoiny byly úspěšně převedeny do vaší peněženky."
      });

      // Refresh bonuses list
      await fetchBonuses();
      return true;
    } catch (error) {
      console.error('Error claiming bonus:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se převést bonus. Zkuste to znovu.",
        variant: "destructive"
      });
      return false;
    } finally {
      setClaiming(null);
    }
  };

  const totalBonusBalance = bonuses.reduce((sum, b) => sum + (b.amount || 0), 0);

  return {
    bonuses,
    totalBonusBalance,
    loading,
    claiming,
    refresh: fetchBonuses,
    claimBonus
  };
};
