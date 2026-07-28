import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { OneMilTicketIcon } from '@/components/icons/OneMilIcons';
import { NavigateToLogin } from '@/components/NavigateToLogin';

interface UserTicket {
  id: string;
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
        .rpc('get_my_tickets_public', { p_contest_id: null });

      if (error) {
        console.error('Error fetching tickets:', error);
        return;
      }

      const userTickets: UserTicket[] = (data ?? []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        contest_id: row.contest_id,
        contest_title: row.contest_title,
      }));

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
          {/* Premium Header Card */}
          <div
            className="relative overflow-hidden rounded-2xl p-6 mb-8"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
              border: '1px solid rgba(255,138,0,0.2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.1)',
            }}
          >
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,181,71,1) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 4s ease-in-out infinite',
              }}
            />
            <div className="relative flex items-center gap-4">
              <div
                className="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)',
                  boxShadow: '0 4px 20px rgba(255,138,0,0.3)',
                }}
              >
                <OneMilTicketIcon size={36} className="w-7 h-7 md:w-9 md:h-9 text-black" />
              </div>
              <div>
                <h1 className="customer-premium-orange-heading text-2xl md:text-3xl font-bold tracking-tight">
                  Moje hry
                </h1>
                <p className="text-sm text-gray-400 mt-1">Přehled vašich tiketů a soutěží</p>
              </div>
            </div>
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
