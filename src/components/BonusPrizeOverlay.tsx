import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Gift, Trophy, Star, Sparkles, Crown, Target } from 'lucide-react';

interface BonusPrize {
  id: string;
  description: string;
  ticket_position: number;
  status: string;
  contest_id: string;
}

interface BonusPrizeOverlayProps {
  contestId: string;
  contestTitle: string;
  children: React.ReactNode; // Trigger element
}

export const BonusPrizeOverlay: React.FC<BonusPrizeOverlayProps> = ({ 
  contestId, 
  contestTitle, 
  children 
}) => {
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingBonus, setClaimingBonus] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  const fetchBonusPrizes = async () => {
    try {
      const { data, error } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', contestId)
        .order('ticket_position', { ascending: true });

      if (error) throw error;
      setBonusPrizes(data || []);
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
      toast.error('Chyba při načítání bonusových cen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBonusPrizes();
    }
  }, [contestId, isOpen]);

  const handleClaimBonus = async (bonusId: string, bonusDescription: string) => {
    // Non-logged-in users get login prompt
    if (!user) {
      toast.error('Pro uplatnění bonusu se musíte přihlásit');
      navigate('/login');
      return;
    }


    setClaimingBonus(bonusId);

    try {
      // This would typically call an edge function to claim the bonus
      // For now, we'll show a placeholder implementation
      const { data, error } = await supabase.rpc('claim_bonus_prize' as any, {
        bonus_prize_id: bonusId,
        user_id: user.id
      });

      if (error) {
        console.error('Error claiming bonus:', error);
        toast.error('Chyba při uplatňování bonusu');
        return;
      }

      // Refresh bonus prizes
      fetchBonusPrizes();
      toast.success(`Bonus "${bonusDescription}" byl úspěšně uplatněn!`);
    } catch (error: any) {
      console.error('Error claiming bonus:', error);
      toast.error('Chyba při uplatňování bonusu');
    } finally {
      setClaimingBonus(null);
    }
  };

  const getBonusIcon = (description: string) => {
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('premium') || lowerDesc.includes('vip')) return Crown;
    if (lowerDesc.includes('special') || lowerDesc.includes('speciální')) return Sparkles;
    if (lowerDesc.includes('rare') || lowerDesc.includes('vzácný')) return Star;
    if (lowerDesc.includes('jackpot') || lowerDesc.includes('hlavní')) return Trophy;
    if (lowerDesc.includes('target') || lowerDesc.includes('cíl')) return Target;
    return Gift;
  };

  const getBonusStyles = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400';
      case 'claimed':
        return 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400';
      case 'won':
        return 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-400';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Dostupný';
      case 'claimed':
        return 'Uplatněný';
      case 'won':
        return 'Vyhrán';
      default:
        return 'Neznámý';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Bonusové ceny - {contestTitle}
          </DialogTitle>
          
          
          {!user && (
            <Badge variant="outline" className="w-fit">
              Přihlaste se pro uplatnění bonusů
            </Badge>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Načítání bonusových cen...</div>
          ) : bonusPrizes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-6 text-muted-foreground">
                  <Gift className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Žádné bonusové ceny nejsou k dispozici.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bonusPrizes.map((bonus) => {
                const IconComponent = getBonusIcon(bonus.description);
                const isClaimable = bonus.status === 'pending' && user && !isAdmin;
                
                return (
                  <Card 
                    key={bonus.id} 
                    className={`transition-all duration-200 ${getBonusStyles(bonus.status)} ${
                      isClaimable ? 'hover:scale-105 cursor-pointer' : ''
                    }`}
                    onClick={() => isClaimable && handleClaimBonus(bonus.id, bonus.description)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <IconComponent className="w-5 h-5" />
                          <Badge variant="outline" className="text-xs">
                            Tiket #{bonus.ticket_position.toLocaleString('cs-CZ')}
                          </Badge>
                        </div>
                        <Badge 
                          variant={bonus.status === 'pending' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {getStatusText(bonus.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <h4 className="font-semibold mb-2 text-sm leading-tight">
                        {bonus.description}
                      </h4>
                      
                      <div className="text-xs text-muted-foreground mb-3">
                        Pozice: #{bonus.ticket_position.toLocaleString('cs-CZ')}
                      </div>

                      {/* Action buttons based on user role */}
                      {isClaimable && (
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="w-full"
                          disabled={claimingBonus === bonus.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClaimBonus(bonus.id, bonus.description);
                          }}
                        >
                          {claimingBonus === bonus.id ? (
                            <>
                              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
                              Uplatňuji...
                            </>
                          ) : (
                            'Uplatnit bonus'
                          )}
                        </Button>
                      )}

                      {!user && bonus.status === 'pending' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/login');
                          }}
                        >
                          Přihlásit se
                        </Button>
                      )}

                      {bonus.status !== 'pending' && (
                        <div className="text-center text-xs text-muted-foreground py-2">
                          {bonus.status === 'claimed' && 'Bonus již byl uplatněn'}
                          {bonus.status === 'won' && 'Bonus byl vyhrán'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Instructions for non-admin users */}
          {user && !isAdmin && bonusPrizes.some(b => b.status === 'pending') && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground text-center">
                  💡 Klikněte na dostupný bonus pro jeho uplatnění
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};