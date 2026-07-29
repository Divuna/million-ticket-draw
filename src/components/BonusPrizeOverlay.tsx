import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Target } from 'lucide-react';
import {
  OneMilCrownIcon,
  OneMilDiamondIcon,
  OneMilGiftIcon,
  OneMilStarIcon,
  OneMilTrophyIcon,
} from '@/components/icons/OneMilIcons';

interface BonusPrize {
  id: string;
  description: string;
  contest_id: string;
  display_status?: 'won' | 'shipped' | 'delivered';
}

interface BonusPrizeOverlayProps {
  contestId: string;
  contestTitle: string;
  children: React.ReactNode;
}

export const BonusPrizeOverlay: React.FC<BonusPrizeOverlayProps> = ({
  contestId,
  contestTitle,
  children,
}) => {
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!isOpen) return;

    const fetchBonusPrizes = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('public_bonus_prizes')
          .select('id, description, contest_id')
          .eq('contest_id', contestId);

        if (error) throw error;

        const bonusPrizeIds = (data || []).map((prize) => prize.id);
        let myWinnerByPrizeId = new Map<string, { status: string | null; delivered: boolean }>();

        // Fulfilment state is visible only for the current customer's own win.
        // Global bonus status is internal because its transition reveals draw
        // progress and therefore a hidden winning position.
        if (userId && bonusPrizeIds.length > 0) {
          const { data: winnersData, error: winnersError } = await supabase
            .from('winners')
            .select('prize_id, status, delivered')
            .eq('contest_id', contestId)
            .eq('type', 'bonus')
            .eq('user_id', userId)
            .in('prize_id', bonusPrizeIds);

          if (winnersError) throw winnersError;

          myWinnerByPrizeId = new Map(
            (winnersData || [])
              .filter((winner) => !!winner.prize_id)
              .map((winner) => [
                winner.prize_id as string,
                { status: winner.status ?? null, delivered: !!winner.delivered },
              ]),
          );
        }

        setBonusPrizes(
          (data || []).map((bonus) => {
            const myWinner = myWinnerByPrizeId.get(bonus.id);
            if (!myWinner) return bonus;

            const display_status =
              myWinner.delivered || myWinner.status === 'delivered'
                ? 'delivered'
                : myWinner.status === 'shipped'
                  ? 'shipped'
                  : 'won';
            return { ...bonus, display_status };
          }),
        );
      } catch (error) {
        console.error('Error fetching bonus prizes:', error);
        toast.error('Chyba při načítání bonusových cen');
      } finally {
        setLoading(false);
      }
    };

    void fetchBonusPrizes();
  }, [contestId, isOpen, userId]);

  const getBonusIcon = (description: string) => {
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('premium') || lowerDesc.includes('vip')) return OneMilCrownIcon;
    if (lowerDesc.includes('special') || lowerDesc.includes('speciální')) return OneMilDiamondIcon;
    if (lowerDesc.includes('rare') || lowerDesc.includes('vzácný')) return OneMilStarIcon;
    if (lowerDesc.includes('jackpot') || lowerDesc.includes('hlavní')) return OneMilTrophyIcon;
    if (lowerDesc.includes('target') || lowerDesc.includes('cíl')) return Target;
    return OneMilGiftIcon;
  };

  const getBonusStyles = (status?: BonusPrize['display_status']) => {
    switch (status) {
      case 'shipped':
        return 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400';
      case 'delivered':
        return 'bg-[rgba(255,138,0,0.08)] border-[rgba(255,138,0,0.3)] text-[#FF8A00] dark:bg-[rgba(255,138,0,0.1)] dark:border-[rgba(255,138,0,0.3)] dark:text-[#FFB547]';
      case 'won':
        return 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-400';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  const getStatusText = (status: NonNullable<BonusPrize['display_status']>) => {
    switch (status) {
      case 'shipped':
        return 'Odesláno';
      case 'delivered':
        return 'Doručeno';
      case 'won':
        return 'Tvoje výhra';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <OneMilGiftIcon size={20} className="w-5 h-5 text-primary" />
            Bonusové ceny - {contestTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Načítání bonusových cen...</div>
          ) : bonusPrizes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-6 text-muted-foreground">
                  <OneMilGiftIcon size={48} className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Žádné bonusové ceny nejsou k dispozici.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bonusPrizes.map((bonus) => {
                const IconComponent = getBonusIcon(bonus.description);
                return (
                  <Card
                    key={bonus.id}
                    className={`transition-all duration-200 ${getBonusStyles(bonus.display_status)}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <IconComponent className="w-5 h-5" />
                        {bonus.display_status && (
                          <Badge variant="secondary" className="text-xs">
                            {getStatusText(bonus.display_status)}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <h4 className="font-semibold mb-2 text-sm leading-tight">
                        {bonus.description}
                      </h4>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
