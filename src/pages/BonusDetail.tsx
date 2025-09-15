import React, { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Contest {
  id: string;
  title: string;
  main_prize: string;
  status: string;
}

interface BonusPrize {
  id: string;
  contest_id: string;
  ticket_position: number;
  description: string;
  status: string;
}

const BonusDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && user) {
      fetchContestAndBonuses();
    }
  }, [id, user]);

  const fetchContestAndBonuses = async () => {
    try {
      // Fetch contest details
      const { data: contestData, error: contestError } = await supabase
        .from('contests')
        .select('*')
        .eq('id', id)
        .single();

      if (contestError) throw contestError;
      setContest(contestData);

      // Fetch bonus prizes
      const { data: bonusData, error: bonusError } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', id)
        .order('ticket_position');

      if (bonusError) throw bonusError;
      setBonusPrizes(bonusData || []);
    } catch (error) {
      console.error('Error fetching contest and bonuses:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Only allow non-admin users (customers) to access this page
  const isAdmin = user?.email === 'divispavel2@gmail.com';
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
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

  if (!contest) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Soutěž nebyla nalezena.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{contest.title}</CardTitle>
              <CardDescription>Bonusové ceny v této soutěži</CardDescription>
            </CardHeader>
          </Card>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Dostupné bonusové ceny</h2>
            
            {bonusPrizes.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    V této soutěži nejsou žádné bonusové ceny.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {bonusPrizes.map((bonus) => (
                  <Card key={bonus.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">Pozice #{bonus.ticket_position}</h3>
                          <p className="text-muted-foreground">{bonus.description}</p>
                        </div>
                        <div>
                          <Badge variant={bonus.status === 'pending' ? 'default' : 'secondary'}>
                            {bonus.status === 'pending' ? 'Dostupná' : 'Vyhrána'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BonusDetail;