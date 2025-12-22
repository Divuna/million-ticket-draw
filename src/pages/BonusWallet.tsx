import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Coins, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PendingBonus {
  bonus_prize_id: string;
  description: string;
  amount: number;
  contest_title: string;
  winner_id: string;
}

const BonusWallet: React.FC = () => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [pendingBonuses, setPendingBonuses] = useState<PendingBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const fetchPendingBonuses = async () => {
    if (!user) return;
    
    try {
      // Join winners with bonus_prizes to get pending MioCoin bonuses
      const { data: winnersData, error: winnersError } = await supabase
        .from('winners')
        .select('id, prize_id, contest_id')
        .eq('user_id', user.id)
        .eq('type', 'bonus');

      if (winnersError) throw winnersError;
      if (!winnersData || winnersData.length === 0) {
        setPendingBonuses([]);
        return;
      }

      // Get prize IDs that exist
      const prizeIds = winnersData
        .map(w => w.prize_id)
        .filter((id): id is string => id !== null);

      if (prizeIds.length === 0) {
        setPendingBonuses([]);
        return;
      }

      // Get pending bonus prizes with MioCoin amounts
      const { data: bonusData, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('id, description, amount, contest_id, status')
        .in('id', prizeIds)
        .eq('status', 'pending')
        .gt('amount', 0);

      if (bonusError) throw bonusError;
      if (!bonusData || bonusData.length === 0) {
        setPendingBonuses([]);
        return;
      }

      // Get contest titles
      const contestIds = [...new Set(bonusData.map(b => b.contest_id))];
      const { data: contestsData } = await supabase
        .from('contests')
        .select('id, title')
        .in('id', contestIds);

      const contestsMap = new Map(contestsData?.map(c => [c.id, c.title]) || []);

      // Map winners to their bonus prizes
      const bonuses: PendingBonus[] = [];
      for (const winner of winnersData) {
        const bonus = bonusData.find(b => b.id === winner.prize_id);
        if (bonus && bonus.amount && bonus.amount > 0) {
          bonuses.push({
            bonus_prize_id: bonus.id,
            description: bonus.description,
            amount: bonus.amount,
            contest_title: contestsMap.get(bonus.contest_id) || 'Neznámá soutěž',
            winner_id: winner.id
          });
        }
      }

      setPendingBonuses(bonuses);
    } catch (error) {
      console.error('Error fetching pending bonuses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPendingBonuses();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleClaimBonus = async (bonus: PendingBonus) => {
    if (!user) return;
    
    setClaimingId(bonus.bonus_prize_id);
    try {
      const { error } = await supabase.rpc('claim_miocoin_bonus', {
        p_bonus_id: bonus.bonus_prize_id,
        p_user_id: user.id
      });

      if (error) {
        toast({
          title: 'Chyba',
          description: error.message || 'Nepodařilo se převést MioCoiny.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'MioCoiny převedeny!',
        description: `${bonus.amount} MioCoinů bylo připsáno na tvůj účet.`
      });

      // Refresh both wallets
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });

      // Refresh bonus list
      await fetchPendingBonuses();
    } catch (err) {
      console.error('Error claiming bonus:', err);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se převést MioCoiny.',
        variant: 'destructive'
      });
    } finally {
      setClaimingId(null);
    }
  };

  const totalPending = pendingBonuses.reduce((sum, b) => sum + b.amount, 0);

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <p className="text-muted-foreground text-center">Pro zobrazení bonusové peněženky se musíte přihlásit.</p>
        </main>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Coins className="h-8 w-8 text-yellow-500" />
          <h1 className="text-2xl font-bold text-foreground">Bonusová peněženka</h1>
        </div>

        {/* Total pending balance */}
        <Card className="mb-6 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Nevyzvednuté MioCoiny</p>
                <p className="text-3xl font-bold text-yellow-500">{totalPending.toLocaleString('cs-CZ')}</p>
              </div>
              <Coins className="h-12 w-12 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>

        {/* Pending bonuses list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-muted/40 animate-pulse h-24" />
            ))}
          </div>
        ) : pendingBonuses.length === 0 ? (
          <div className="text-center py-12">
            <Coins className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-xl font-semibold mb-2">Žádné nevyzvednuté bonusy</h3>
            <p className="text-muted-foreground">Všechny MioCoiny byly převedeny do hry.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingBonuses.map((bonus) => (
              <Card key={bonus.bonus_prize_id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">{bonus.contest_title}</p>
                      <p className="font-medium text-foreground">{bonus.description}</p>
                      <p className="text-lg font-bold text-yellow-500">
                        {bonus.amount.toLocaleString('cs-CZ')} MioCoinů
                      </p>
                    </div>
                    <Button
                      onClick={() => handleClaimBonus(bonus)}
                      disabled={claimingId === bonus.bonus_prize_id}
                      className="shrink-0"
                    >
                      {claimingId === bonus.bonus_prize_id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Převádím...
                        </>
                      ) : (
                        <>
                          Převést do hry
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default BonusWallet;
