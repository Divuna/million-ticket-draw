import React, { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { OneMilTrophyIcon } from '@/components/icons/OneMilIcons';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigateToLogin } from '@/components/NavigateToLogin';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  status: string;
  ticket_count: number;
  created_at: string;
}

interface BonusPrize {
  id: string;
  description: string;
  amount?: number;
}

interface UserWin {
  id: string;
  type: 'main' | 'bonus';
  created_at: string;
  delivered: boolean;
  status?: string;
  prize_id?: string | null;
  contest_title?: string;
  description?: string;
}

const MyContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  
  const [contest, setContest] = useState<Contest | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [userWins, setUserWins] = useState<UserWin[]>([]);
  const [userTickets, setUserTickets] = useState(0);
  
  const [loadingContest, setLoadingContest] = useState(true);
  const [loadingBonuses, setLoadingBonuses] = useState(true);
  const [loadingWins, setLoadingWins] = useState(true);

  useEffect(() => {
    if (id && user) {
      fetchContestData();
      fetchBonusPrizes();
      fetchUserWins();
      fetchTicketData();
    }
  }, [id, user]);

  const fetchContestData = async () => {
    try {
      if (!id) return;
      
      const { data, error } = await supabase
        .from('public_contests')
        .select('id, title, description, main_prize, status, ticket_count, created_at')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (data?.status === 'draft') {
        navigate('/games', { replace: true });
        return;
      }
      setContest(data);
    } catch (error) {
      console.error('Error fetching contest:', error);
    } finally {
      setLoadingContest(false);
    }
  };

  const fetchBonusPrizes = async () => {
    try {
      if (!id) return;
      
      const { data, error } = await supabase
        .from('public_bonus_prizes')
        .select('id, description, amount')
        .eq('contest_id', id);

      if (error) throw error;
      setBonusPrizes(data || []);
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
    } finally {
      setLoadingBonuses(false);
    }
  };

  const fetchUserWins = async () => {
    try {
      if (!user || !id) return;
      
      const { data, error } = await supabase
        .from('winners')
        .select(`
          id,
          type,
          created_at,
          delivered,
          status,
          prize_id
        `)
        .eq('user_id', user.id)
        .eq('contest_id', id);

      if (error) throw error;

      // Fetch bonus prize descriptions separately for bonus wins
      const wins: UserWin[] = [];
      for (const win of data || []) {
        let description = '';
        
        if (win.type === 'main') {
          description = contest?.main_prize || 'Hlavní cena';
        } else if (win.type === 'bonus') {
          // Resolve bonus prize by winner.prize_id instead of bonus_prizes.status
          const bonusPrize = bonusPrizes.find(bp => bp.id === win.prize_id);
          description = bonusPrize?.description || 'Bonusová cena';
        }

        wins.push({
          id: win.id,
          type: win.type as 'main' | 'bonus',
          created_at: win.created_at,
          delivered: win.delivered,
          status: win.status,
          prize_id: win.prize_id,
          contest_title: contest?.title,
          description
        });
      }

      setUserWins(wins);
    } catch (error) {
      console.error('Error fetching user wins:', error);
    } finally {
      setLoadingWins(false);
    }
  };

  const fetchTicketData = async () => {
    try {
      if (!id || !user) return;

      const { data } = await supabase
        .rpc('get_my_tickets_public', { p_contest_id: id });

      setUserTickets(data?.length || 0);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'closed': return 'bg-gray-500';
      case 'draft': return 'bg-[#FF8A00]';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Aktivní';
      case 'closed': return 'Ukončená';
      case 'draft': return 'Příprava';
      default: return status;
    }
  };

  if (!session) {
    return <NavigateToLogin />;
  }

  if (loadingContest) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Soutěž nenalezena</h1>
            <p className="text-muted-foreground">Požadovaná soutěž neexistuje nebo byla odstraněna.</p>
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
          
          {/* Back Button */}
          <button
            onClick={() => navigate('/my-contests')}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-[rgba(0,0,0,0.4)] backdrop-blur-sm text-white/80 font-medium text-sm border border-white/20 hover:bg-[rgba(0,0,0,0.5)] hover:text-white active:scale-[0.98] transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na Moje hry
          </button>

          {/* Contest Header */}
          <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-2xl text-primary">{contest.title}</CardTitle>
                <Badge className={`${getStatusColor(contest.status)} text-white`}>
                  {getStatusText(contest.status)}
                </Badge>
              </div>
              {contest.description && (
                <p className="text-muted-foreground mt-2">{contest.description}</p>
              )}
            </CardHeader>
          </Card>

          {/* Main Prize */}
          <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <OneMilTrophyIcon size={20} className="h-5 w-5" />
                Hlavní cena / Prémiová hlavní výhra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium">{contest.main_prize}</p>
            </CardContent>
          </Card>

          {/* My Wins */}
          <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-neon-purple">
                <OneMilTrophyIcon size={20} className="h-5 w-5" />
                Moje výhry
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingWins ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : userWins.length === 0 ? (
                <p className="text-muted-foreground">Žádné výhry</p>
              ) : (
                <div className="space-y-3">
                  {userWins.map((win) => (
                    <div key={win.id} className="flex justify-between items-center p-3 bg-secondary/20 rounded-lg">
                      <div>
                        <p className="font-medium">
                          {win.type === 'main' ? 'Hlavní cena' : 'Bonusová cena'}
                        </p>
                        <p className="text-sm text-muted-foreground">{win.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(win.created_at).toLocaleDateString('cs-CZ')}
                        </p>
                      </div>
                      <Badge variant={win.delivered ? 'default' : 'secondary'}>
                        {win.delivered ? 'Předáno' : win.status || 'Čeká na potvrzení'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default MyContestDetail;
