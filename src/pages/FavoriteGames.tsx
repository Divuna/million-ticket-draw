import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BottomNavigation } from '@/components/BottomNavigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Contest {
  id: string;
  title: string;
  description: string | null;
  main_prize: string;
  main_image: string | null;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
}

const FavoriteGames = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    fetchFavoriteContests();
  }, [user, navigate]);

  const fetchFavoriteContests = async () => {
    if (!user) return;

    try {
      // Get favorited contests
      const { data: favoriteData, error: favoriteError } = await supabase
        .from('user_contest_favorites')
        .select('contest_id')
        .eq('user_id', user.id);

      if (favoriteError) throw favoriteError;

      // Get contests where user has purchased tickets
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('contest_id')
        .eq('user_id', user.id);

      if (ticketError) throw ticketError;

      // Combine both sets of contest IDs
      const favoriteIds = favoriteData?.map(f => f.contest_id) || [];
      const ticketIds = ticketData?.map(t => t.contest_id) || [];
      const contestIds = [...new Set([...favoriteIds, ...ticketIds])];

      if (contestIds.length === 0) {
        setContests([]);
        setLoading(false);
        return;
      }

      // Fetch contest details
      const { data: contestData, error: contestError } = await supabase
        .from('contests')
        .select(`
          id, title, description, main_prize, main_image, ticket_price, ticket_count, status, created_at
        `)
        .in('id', contestIds)
        .order('created_at', { ascending: false });

      if (contestError) throw contestError;
      
      setContests(contestData as Contest[]);
    } catch (error) {
      console.error('Error fetching favorite contests:', error);
      toast.error('Chyba při načítání oblíbených soutěží');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Načítání oblíbených soutěží...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="mb-4 text-4xl font-bold text-neon-green">Oblíbené soutěže</h1>
          <p className="text-xl text-muted-foreground">Soutěže, které máte oblíbené nebo jste již hráli</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contests.map((contest) => (
            <Card key={contest.id} className="ticket-game ticket-perforations relative cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/contest/${contest.id}`)}>
              {contest.status === 'closed' && (
                <Badge className="absolute top-4 right-4 bg-destructive text-destructive-foreground">
                  Hra ukončena
                </Badge>
              )}
              
              <CardHeader>
                <div className="w-full h-48 rounded-md mb-4 overflow-hidden bg-gradient-to-br from-purple-900/20 to-cyan-900/20 flex items-center justify-center">
                  {contest.main_image ? (
                    <img
                      src={contest.main_image.startsWith('http') ? contest.main_image : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`}
                      alt={contest.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-6xl">🎯</div>
                  )}
                </div>
                <CardTitle className="text-neon-green">{contest.title}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {contest.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Hlavní výhra:</span>
                    <span className="text-sm font-medium text-neon-green">{contest.main_prize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Cena tiketu:</span>
                    <span className="text-sm font-medium text-neon-green">
                      {contest.ticket_price} miocoinů
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Stav:</span>
                    <span className="text-sm font-medium">
                      {contest.status}
                    </span>
                  </div>
                </div>
              </CardContent>
              
              <CardFooter>
                <Button 
                  className="w-full bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 text-white border-0 glow-cyan"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/contest/${contest.id}`);
                  }}
                >
                  Zobrazit detail
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {contests.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">❤️</div>
            <h3 className="text-xl font-semibold mb-2">Žádné oblíbené soutěže</h3>
            <p className="text-muted-foreground mb-6">
              Zatím jste si neoblíbili ani nehráli žádnou soutěž.
            </p>
            <Button onClick={() => navigate('/games')}>
              Prohlédnout soutěže
            </Button>
          </div>
        )}
      </div>

      <BottomNavigation />
    </div>
  );
};

export default FavoriteGames;
