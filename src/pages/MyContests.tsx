import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Gamepad2 } from 'lucide-react';
import { OneMilTicketIcon } from '@/components/icons/OneMilIcons';
import { NavigateToLogin } from '@/components/NavigateToLogin';

interface UserTicket {
  id: string;
  number: number;
  created_at: string;
  contest_id: string;
  contest_title: string;
}

const MyContests: React.FC = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchMyTickets();
    }
  }, [user]);

  const fetchMyTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          number,
          created_at,
          contest_id,
          contests!inner (
            title
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching tickets:', error);
        return;
      }

      const userTickets: UserTicket[] = (data ?? []).map((row: any) => {
        const contest = Array.isArray(row.contests) ? row.contests[0] : row.contests;
        return {
          id: row.id,
          number: row.number,
          created_at: row.created_at,
          contest_id: row.contest_id,
          contest_title: contest?.title ?? '',
        };
      });

      setTickets(userTickets);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (!session) {
    return <NavigateToLogin />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám tickety...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Gamepad2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-primary">Moje hry</h1>
          </div>

          {tickets.length === 0 ? (
            <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <OneMilTicketIcon size={64} className="h-16 w-16 text-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Zatím nemáš žádné tickety.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <Card
                  key={ticket.id}
                  className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm transition-all duration-300 shadow-lg cursor-pointer hover:border-primary/40 hover:shadow-primary/20"
                  onClick={() => navigate(`/contest/${ticket.contest_id}`)}
                >
                  <CardContent className="pt-6 pb-6">
                    <p className="text-sm font-semibold text-primary mb-1">
                      Soutěž: {ticket.contest_title}
                    </p>
                    <p className="text-sm text-foreground mb-1">
                      Tiket: #{ticket.number.toLocaleString('cs-CZ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Zakoupeno: {formatDate(ticket.created_at)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyContests;