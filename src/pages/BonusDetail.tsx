import React, { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Gift } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';

interface BonusPrize {
  id: string;
  description: string;
  ticket_position: number;
  status: string;
}

interface Contest {
  id: string;
  title: string;
}

const BonusDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
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
        .select('id, title')
        .eq('id', id)
        .single();

      if (contestError) throw contestError;
      setContest(contestData);

      // Fetch bonus prizes
      const { data: bonusData, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', id)
        .order('ticket_position', { ascending: true });

      if (bonusError) throw bonusError;
      setBonusPrizes(bonusData || []);

    } catch (error) {
      console.error('Error fetching bonus data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
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
    <div className="min-h-screen bg-background">
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
                    <div className="flex justify-between items-start">
                      <Badge 
                        variant={prize.status === 'won' ? 'destructive' : 'default'}
                        className="text-xs"
                      >
                        #{prize.ticket_position.toLocaleString('cs-CZ')}
                      </Badge>
                      {prize.status === 'won' && (
                        <span className="text-xs text-muted-foreground">Vyhráno</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Prize image placeholder */}
                      <div className="aspect-square bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg flex items-center justify-center">
                        <Gift className="h-8 w-8 text-primary/40" />
                      </div>
                      
                      <div>
                        <h3 className="font-semibold text-sm mb-1">{prize.description}</h3>
                        <p className="text-xs text-muted-foreground">
                          Pozice tiketu #{prize.ticket_position.toLocaleString('cs-CZ')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  
                  {prize.status === 'won' && (
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