import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Gamepad2, Trophy, Ticket } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';

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
  const { isAdmin } = useUserRole();
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
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-black text-transparent bg-gradient-to-r from-neon-purple via-purple-400 to-neon-purple bg-clip-text animate-pulse mb-4">
              ⚡ MOJE SOUTĚŽE ⚡
            </h1>
            <p className="text-neon-purple/80 font-medium text-lg">Vaše účast v soutěžích</p>
          </div>
          
          {contests.length === 0 ? (
            <div className="neon-ticket ticket-contest ticket-perforations">
              {/* Ticket perforations */}
              <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-purple/50" />
                ))}
              </div>
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-purple/50" />
                ))}
              </div>
              
              <div className="relative z-10 p-8 text-center">
                <Ticket className="w-16 h-16 mx-auto mb-4 text-neon-purple animate-pulse" />
                <h4 className="text-2xl font-black text-neon-purple mb-4">🏆 ŽÁDNÉ SOUTĚŽE</h4>
                <p className="text-neon-purple/80 font-medium">
                  Nemáte zatím žádné lístky v soutěžích. Přejděte na hlavní stránku a začněte hrát!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {contests.map((contest) => (
                <div 
                  key={contest.id} 
                  className="neon-ticket ticket-contest ticket-perforations cursor-pointer hover:scale-[1.02] transition-all duration-300"
                  onClick={() => navigate(`/contest/${contest.id}`)}
                >
                  {/* Ticket perforations */}
                  <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                    {Array.from({length: 6}).map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-purple/50" />
                    ))}
                  </div>
                  <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                    {Array.from({length: 6}).map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-purple/50" />
                    ))}
                  </div>
                  
                  <div className="relative z-10 p-8">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-2xl font-black text-neon-purple">{contest.title}</h3>
                      <div className={`px-4 py-2 rounded-xl font-bold text-sm ${
                        contest.status === 'active' 
                          ? 'bg-green-400/20 text-green-400 border border-green-400/30' 
                          : contest.status === 'closed'
                            ? 'bg-gray-400/20 text-gray-400 border border-gray-400/30'
                            : 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                      }`}>
                        {getStatusText(contest.status)}
                      </div>
                    </div>
                    
                    <p className="text-neon-purple/80 mb-6 text-lg">{contest.description}</p>
                    
                    <div className="flex justify-between items-center">
                      <div className="space-y-2">
                        <p className="text-neon-purple/60 font-bold">🏆 HLAVNÍ CENA:</p>
                        <p className="font-black text-2xl text-neon-purple">{contest.main_prize}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-neon-purple/60 font-bold">🎫 MOJE LÍSTKY:</p>
                        <div className="flex items-center gap-3 justify-end">
                          <Ticket className="h-8 w-8 text-neon-purple animate-pulse" />
                          <span className="font-black text-3xl text-neon-purple">{contest.user_tickets}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default MyContests;