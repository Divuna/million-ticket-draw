import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketResultModal } from '@/components/TicketResultModal';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
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

interface UnlockTicketResult {
  ticket_number: number;
  ticket_price: number;
  next_bonus_position?: number | null;
  distance_to_next_bonus?: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: 'bonus' | 'main' | null;
  bonus_prize_id?: string | null;
}

const Index = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  // Removed automatic admin redirect to allow admins to view customer page

  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .select(`
          id, title, description, main_prize, main_image, ticket_price, ticket_count, status, created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setContests(data as Contest[]);
    } catch (error) {
      console.error('Error fetching contests:', error);
      toast.error('Chyba při načítání soutěží');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, []);

  // Real-time updates: refresh when contests table changes
  useEffect(() => {
    const channel = supabase
      .channel('contests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contests' }, () => {
        fetchContests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUnlockTicket = async (contestId: string) => {
    if (!user) {
      toast.error('Pro koupi tiketu se musíte přihlásit');
      return;
    }

    setProcessingContestId(contestId);
    
    try {
      const { data, error } = await supabase.rpc('unlock_ticket' as any, {
        contest_id: contestId,
        user_id: user.id
      });

      if (error) {
        console.error('Error unlocking ticket:', error);
        
        // Handle specific error cases with Czech messages
        if (error.message?.includes('insufficient') || error.message?.includes('nedostatek')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (error.message?.includes('closed') || error.message?.includes('ukončen')) {
          toast.error('Tato hra již byla ukončena');
        } else {
          toast.error(error.message || 'Chyba při koupi tiketu');
        }
        return;
      }

      if (data) {
        // Development logging - Raw RPC unlock_ticket data
        if (import.meta.env.DEV) {
          console.log('🎫 Raw RPC unlock_ticket data:', JSON.stringify(data, null, 2));
          console.log('🎫 Enhanced data fields:', {
            won_prize: data.won_prize,
            won_type: data.won_type,
            bonus_prize_id: data.bonus_prize_id
          });
        }

        // Send event to Sofinity
        try {
          await supabase.functions.invoke('send_event_to_sofinity', {
            body: {
              event_name: 'coin_redeemed',
              user_id: user.id,
              contest_id: contestId,
              metadata: {
                ticket_number: data.ticket_number,
                ticket_price: data.ticket_price
              }
            }
          });
          
          toast.success('Event byl odeslán do Sofinity');
        } catch (sofinityError) {
          console.error('Sofinity event error:', sofinityError);
          // Don't block the main flow for Sofinity errors
        }

        setModalResult(data);
        setModalContestId(contestId);
        
        // Refresh contests to update remaining tickets display
        fetchContests();
        
        if (data.won_prize) {
          toast.success(`Gratulujeme! Vyhrál jsi ${data.won_prize}!`);
        } else {
          toast.success(`Tiket #${data.ticket_number.toLocaleString('cs-CZ')} zakoupen!`);
        }
      }
    } catch (error: any) {
      console.error('Error unlocking ticket:', error);
      toast.error('Chyba při koupi tiketu');
    } finally {
      setProcessingContestId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Načítání soutěží...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="mb-4 text-4xl font-bold text-neon-green">OneMil</h1>
          <p className="text-xl text-muted-foreground">Vyberte si soutěž a zkuste štěstí!</p>
        </div>
        
        <div className="flex justify-end mb-4">
          <Button 
            variant="outline"
            onClick={() => navigate('/favorite-games')}
          >
            Oblíbené soutěže
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contests.map((contest) => (
            <Card key={contest.id} className="ticket-game ticket-perforations relative">
              {contest.status === 'closed' && (
                <Badge className="absolute top-4 right-4 bg-destructive text-destructive-foreground">
                  Hra ukončena – hlavní výhra padla
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
                        console.log('Contest image failed to load:', contest.main_image);
                        toast.error('Obrázek soutěže se nepodařilo načíst');
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
                    <span className="text-sm text-muted-foreground">Celkem tiketů:</span>
                    <span className="text-sm font-medium">
                      {contest.ticket_count.toLocaleString('cs-CZ')}
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
                {/* Show interactive button only for logged-in non-admin users */}
                {user && !isAdmin && (
                  <Button 
                    className="w-full bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 text-white border-0 glow-cyan"
                    onClick={() => handleUnlockTicket(contest.id)}
                    disabled={contest.status !== 'active' || processingContestId === contest.id}
                  >
                    {processingContestId === contest.id 
                      ? 'Zpracování...' 
                      : contest.status === 'pending'
                        ? 'Připravuje se...'
                        : contest.status === 'closed'
                        ? 'Ukončena'
                        : `Uplatnit ${contest.ticket_price} miocoinů`
                    }
                  </Button>
                )}
                
                {/* Show login prompt for non-logged-in users */}
                {!user && (
                  <Button 
                    className="w-full bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 text-white border-0 glow-cyan"
                    onClick={() => navigate('/login')}
                  >
                    Přihlásit se pro koupi tiketu
                  </Button>
                )}
                
                {/* Show read-only message for admin users */}
                {user && isAdmin && (
                  <div className="w-full text-center text-sm text-muted-foreground py-3">
                    Admin zobrazení - pouze pro čtení
                  </div>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {contests.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Žádné soutěže</h3>
            <p className="text-muted-foreground">Momentálně nejsou dostupné žádné soutěže.</p>
          </div>
        )}
      </div>

      <TicketResultModal
        result={modalResult ? {
          ticket_number: modalResult.ticket_number,
          distance_to_next_bonus: modalResult.distance_to_next_bonus,
          next_bonus_position: modalResult.next_bonus_position,
          won_prize: modalResult.won_prize,
          won_type: modalResult.won_type,
          bonus_prize_id: modalResult.bonus_prize_id,
          remaining_tickets: modalResult.remaining_tickets
        } : null}
        contestId={modalContestId}
        isOpen={!!modalResult}
        onClose={() => {
          setModalResult(null);
          setModalContestId(null);
        }}
      />

      {/* Show bottom navigation only for non-admin users */}
      {!isAdmin && <BottomNavigation />}
    </div>
  );
};

export default Index;
