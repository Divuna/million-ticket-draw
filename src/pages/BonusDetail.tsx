import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Gift } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { useUserRole } from '@/hooks/useUserRole';

interface BonusPrize {
  id: string;
  description: string;
  status: string;
  winner_user_id?: string;
}

interface Contest {
  id: string;
  title: string;
}

const BonusDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch contest info
      const { data: contestData, error: contestError } = await supabase
        .from('contests')
        .select('id, title, status')
        .eq('id', id)
        .single();

      if (contestError) throw contestError;
      if (contestData?.status === 'draft') {
        navigate('/games', { replace: true });
        return;
      }
      setContest(contestData);

      // Fetch bonus prizes
      const { data: bonusData, error: bonusError } = await supabase
        .from('public_bonus_prizes')
        .select('id, description, status')
        .eq('contest_id', id);

      if (bonusError) throw bonusError;

      const bonusPrizeIds = (bonusData || []).map(prize => prize.id);
      const uid = session?.user?.id ?? null;

      // Only resolve "you won" for the current user (strict RLS: no other users' winner rows)
      const myWonPrizeIds = new Set<string>();
      if (uid && bonusPrizeIds.length > 0) {
        const { data: myBonusWins, error: myWinsError } = await supabase
          .from('winners')
          .select('prize_id')
          .eq('user_id', uid)
          .eq('contest_id', id as string)
          .eq('type', 'bonus')
          .in('prize_id', bonusPrizeIds);

        if (myWinsError) throw myWinsError;
        (myBonusWins || []).forEach((row) => {
          if (row.prize_id) myWonPrizeIds.add(row.prize_id);
        });
      }

      const processedPrizes = (bonusData || []).map((prize: any) => ({
        ...prize,
        winner_user_id: myWonPrizeIds.has(prize.id) ? uid : null,
      }));

      // Development logging
      if (import.meta.env.DEV) {
        console.log('🎁 Bonus prizes fetched:', processedPrizes);
        console.log('👤 Current user ID:', session?.user?.id);
        console.log('🎯 User won prizes:', processedPrizes.filter(p => p.winner_user_id === session?.user?.id));
        
      }
      
      setBonusPrizes(processedPrizes);

    } catch (error) {
      console.error('Error fetching bonus data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <NavigateToLogin />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám bonusové ceny...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Header with back button */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(`/contest/${id}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Bonusové ceny</h1>
              {contest && (
                <p className="text-muted-foreground">{contest.title}</p>
              )}
            </div>
          </div>

          {/* Info card */}
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Gift className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-1">
                    Tyto ceny mohou být ukryty kdekoli v průběhu hry
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Každý tiket má šanci vyhrát jednu z těchto bonusových cen na konkrétní pozici.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bonus prizes grid */}
          {bonusPrizes.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bonusPrizes.map((prize) => (
                <Card key={prize.id} className="relative overflow-hidden">
                  <CardHeader className="pb-3">
                    {prize.winner_user_id === session?.user?.id && (
                      <Badge variant="destructive" className="w-fit text-xs">Vyhráno</Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Prize image placeholder */}
                      <div className="aspect-square bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg flex items-center justify-center">
                        <Gift className="h-8 w-8 text-primary/40" />
                      </div>
                      
                      <div>
                        <h3 className="font-semibold text-sm mb-1">{prize.description}</h3>
                      </div>
                    </div>
                  </CardContent>
                  
                  {prize.winner_user_id === session?.user?.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">VYHRÁNO</span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Gift className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Žádné bonusové ceny</h3>
                  <p className="text-muted-foreground">
                    Pro tuto soutěž nejsou zatím nastaveny žádné bonusové ceny.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
};

export default BonusDetail;
