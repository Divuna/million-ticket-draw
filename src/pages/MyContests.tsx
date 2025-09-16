import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Gamepad2, Trophy, Ticket } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  status: string;
  ticket_count: number;
  created_at: string;
  user_tickets: number;
}

const MyContests: React.FC = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchMyContests();
    }
  }, [user]);

  const fetchMyContests = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('tickets')
        .select(`
          contest_id,
          contests!inner (
            id,
            title,
            description,
            main_prize,
            status,
            ticket_count,
            created_at
          )
        `)
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error fetching contests:', error);
        return;
      }

      // Group tickets by contest and count them
      const contestMap = new Map<string, Contest>();
      
      data?.forEach(ticket => {
        const contest = ticket.contests;
        const contestId = contest.id;
        
        if (contestMap.has(contestId)) {
          contestMap.get(contestId)!.user_tickets += 1;
        } else {
          contestMap.set(contestId, {
            id: contest.id,
            title: contest.title,
            description: contest.description,
            main_prize: contest.main_prize,
            status: contest.status,
            ticket_count: contest.ticket_count,
            created_at: contest.created_at,
            user_tickets: 1
          });
        }
      });

      setContests(Array.from(contestMap.values()));
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'closed':
        return 'bg-gray-500';
      case 'draft':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Aktivní';
      case 'closed':
        return 'Ukončená';
      case 'draft':
        return 'Příprava';
      default:
        return status;
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
            <p className="text-muted-foreground">Načítám soutěže...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Gamepad2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Moje hry</h1>
          </div>
          
          {contests.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Žádné soutěže</h3>
                  <p className="text-muted-foreground">
                    Nemáte zatím žádné lístky v soutěžích. Přejděte na hlavní stránku a začněte hrát!
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {contests.map((contest) => (
                <Card 
                  key={contest.id} 
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/contest/${contest.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg line-clamp-2">{contest.title}</CardTitle>
                      <Badge className={`${getStatusColor(contest.status)} text-white`}>
                        {getStatusText(contest.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Hlavní cena:</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 ml-6">
                        {contest.main_prize}
                      </p>
                      
                      <div className="flex items-center gap-2 pt-2">
                        <Ticket className="h-4 w-4 text-primary" />
                        <span className="text-sm">
                          Moje lístky: <span className="font-semibold">{contest.user_tickets}</span>
                        </span>
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        Celkem lístků: {contest.ticket_count?.toLocaleString('cs-CZ')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default MyContests;