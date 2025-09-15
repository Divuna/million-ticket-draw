import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { TicketResultModal } from '@/components/TicketResultModal';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
}

interface BonusPrize {
  id: string;
  description: string;
  ticket_position: number;
  status: string;
}

interface UserWallet {
  balance_coins: number;
}

interface TicketResult {
  ticket_number: number;
  distance_to_next_bonus: number | null;
  next_bonus_position: number | null;
  won_prize?: string;
}

const ContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [currentTickets, setCurrentTickets] = useState(0);
  const [userWallet, setUserWallet] = useState<UserWallet>({ balance_coins: 0 });
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [ticketResult, setTicketResult] = useState<TicketResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    if (id) {
      fetchContestData();
    }
  }, [id]);

  useEffect(() => {
    if (user) {
      fetchUserWallet();
    }
  }, [user]);

  const fetchContestData = async () => {
    try {
      if (!id) return;

      // Fetch contest data
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
        .order('ticket_position', { ascending: true });

      if (bonusError) throw bonusError;
      setBonusPrizes(bonusData || []);

      // Fetch current tickets count
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('contest_id', id);

      setCurrentTickets(count || 0);
    } catch (error) {
      console.error('Error fetching contest data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserWallet = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('wallets')
        .select('balance_coins')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setUserWallet({ balance_coins: data?.balance_coins || 0 });
    } catch (error) {
      console.error('Error fetching wallet:', error);
      setUserWallet({ balance_coins: 0 });
    }
  };

  const buyTicket = async () => {
    if (!user || !contest) return;

    if (userWallet.balance_coins < 1) {
      toast({
        title: "Nedostatek mincí",
        description: "Pro nákup tiketu potřebujete alespoň 1 minci.",
        variant: "destructive"
      });
      return;
    }

    setPurchasing(true);

    try {
      // Call the unlock_ticket function using the generic rpc call
      const { data, error } = await supabase.rpc('unlock_ticket' as any, {
        contest_id: contest.id,
        user_id: user.id
      }) as { data: any; error: any };

      if (error || !data) throw error || new Error('No data returned');

      // Development logging
      if (import.meta.env.DEV) {
        console.log('🎫 Ticket purchase result:', {
          current_ticket: data.ticket_number,
          next_bonus_position: data.next_bonus_position,
          distance_to_next_bonus: data.distance_to_next_bonus,
          won_prize: data.won_prize,
          remaining_tickets: data.remaining_tickets
        });
        
        if (data.won_prize) {
          console.log('🎉 Winner record should be created for user:', user.id);
        }
      }

      // Prepare result for modal
      const result: TicketResult = {
        ticket_number: data.ticket_number || 0,
        distance_to_next_bonus: data.distance_to_next_bonus || null,
        next_bonus_position: data.next_bonus_position || null,
        won_prize: data.won_prize,
      };

      // Add remaining tickets to result
      if (data.remaining_tickets !== undefined) {
        (result as any).remaining_tickets = data.remaining_tickets;
      }

      setTicketResult(result);
      setShowResultModal(true);

      // Refresh data
      await fetchUserWallet();

    } catch (error) {
      console.error('Error purchasing ticket:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se uplatnit miocoiny. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setPurchasing(false);
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
            <p className="text-muted-foreground">Načítám soutěž...</p>
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
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Soutěž nenalezena</h1>
            <p className="text-muted-foreground">Požadovaná soutěž neexistuje nebo byla odstraněna.</p>
          </div>
        </div>
      </div>
    );
  }

  const progressPercentage = (currentTickets / contest.ticket_count) * 100;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Contest Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-3xl">{contest.title}</CardTitle>
                  <CardDescription className="mt-2 text-lg">
                    {contest.description}
                  </CardDescription>
                </div>
                <Badge 
                  variant={contest.status === 'active' ? 'default' : 'secondary'}
                  className="text-sm"
                >
                  {contest.status === 'active' ? 'Aktivní' : 
                   contest.status === 'draft' ? 'Koncept' : 'Uzavřena'}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Main Prize */}
          <Card>
            <CardHeader>
              <CardTitle>Hlavní cena</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center p-6 bg-primary/5 rounded-lg">
                <h3 className="text-2xl font-bold text-primary mb-2">
                  {contest.main_prize}
                </h3>
                <p className="text-muted-foreground">
                  Tiket #{contest.ticket_count.toLocaleString('cs-CZ')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Ticket Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Pokrok prodeje tiketů</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Prodáno: {currentTickets.toLocaleString('cs-CZ')}</span>
                  <span>Celkem: {contest.ticket_count.toLocaleString('cs-CZ')}</span>
                </div>
                <Progress value={progressPercentage} className="h-3" />
                <p className="text-center text-lg font-semibold">
                  {progressPercentage.toFixed(1)}% dokončeno
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bonus Prizes */}
          {bonusPrizes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bonusové ceny</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {bonusPrizes.map((prize) => (
                    <div key={prize.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold">{prize.description}</h4>
                        <Badge variant="outline">
                          #{prize.ticket_position.toLocaleString('cs-CZ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Tiket #{prize.ticket_position.toLocaleString('cs-CZ')}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Purchase Section */}
          {contest.status === 'active' && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Uplatnit miocoiny</h3>
                    <p className="text-muted-foreground">
                      Cena: 1 miocoin | Váš zůstatek: {userWallet.balance_coins.toLocaleString('cs-CZ')} miocoinů
                    </p>
                  </div>
                  <Button 
                    onClick={buyTicket}
                    disabled={purchasing || userWallet.balance_coins < 1}
                    size="lg"
                  >
                    {purchasing ? 'Uplatňuji...' : `Uplatnit ${userWallet.balance_coins >= 1 ? '1' : '0'} miocoinů`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Ticket Result Modal */}
      <TicketResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        contestId={contest?.id || ''}
        result={ticketResult}
      />
    </div>
  );
};

export default ContestDetail;