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
import { Gamepad2 } from 'lucide-react';

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

const Games = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

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
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-gradient-to-r from-neon-green via-green-400 to-neon-green bg-clip-text animate-pulse mb-4">
            ⚡ MOJE HRY ⚡
          </h1>
          <p className="text-neon-green/80 font-medium text-lg">Vyberte si soutěž a zkuste štěstí!</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contests.map((contest) => (
            <div key={contest.id} className="neon-ticket ticket-game ticket-perforations relative">
              {/* Ticket perforations */}
              <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-green/50" />
                ))}
              </div>
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-green/50" />
                ))}
              </div>

              {contest.status === 'closed' && (
                <div className="absolute top-4 right-4 z-20 px-3 py-1 bg-red-400/20 text-red-400 border border-red-400/30 rounded-xl font-bold text-xs">
                  🔴 HRA UKONČENA
                </div>
              )}
              
              <div className="relative z-10 p-6">
                <div className="w-full h-48 rounded-xl mb-4 overflow-hidden bg-gradient-to-br from-neon-green/20 via-green-400/10 to-neon-green/5 border-2 border-neon-green/30 flex items-center justify-center">
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
                
                <h3 className="text-xl font-black text-neon-green mb-2">{contest.title}</h3>
                <p className="text-neon-green/80 mb-4 text-sm line-clamp-2">{contest.description}</p>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-sm text-neon-green/60 font-bold">🏆 HLAVNÍ VÝHRA:</span>
                    <span className="text-sm font-black text-neon-green">{contest.main_prize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-neon-green/60 font-bold">💰 CENA TIKETU:</span>
                    <span className="text-sm font-black text-neon-green">
                      {contest.ticket_price} miocoinů
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-neon-green/60 font-bold">🎫 CELKEM TIKETŮ:</span>
                    <span className="text-sm font-bold text-neon-green/80">
                      {contest.ticket_count.toLocaleString('cs-CZ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-neon-green/60 font-bold">📊 STAV:</span>
                    <span className={`text-sm font-bold ${
                      contest.status === 'active' ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {contest.status === 'active' ? '🟢 AKTIVNÍ' : '⚫ NEAKTIVNÍ'}
                    </span>
                  </div>
                </div>
                
                <div className="border-t border-dashed border-neon-green/50 pt-4">
                  {/* Show interactive button only for logged-in non-admin users */}
                  {user && !isAdmin && (
                    <Button 
                      className="w-full bg-gradient-to-r from-neon-green via-green-400 to-neon-green text-black font-black px-4 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                      style={{ 
                        boxShadow: '0 0 30px hsl(var(--neon-green) / 0.6)',
                        animation: 'neon-pulse 2s ease-in-out infinite'
                      }}
                      onClick={() => handleUnlockTicket(contest.id)}
                      disabled={contest.status === 'closed' || processingContestId === contest.id}
                    >
                      {processingContestId === contest.id 
                        ? '⚡ ZPRACOVÁNÍ...' 
                        : `⚡ UPLATNIT ${contest.ticket_price} MIOCOINŮ ⚡`
                      }
                    </Button>
                  )}
                  
                  {/* Show login prompt for non-logged-in users */}
                  {!user && (
                    <Button 
                      className="w-full bg-gradient-to-r from-neon-cyan via-cyan-400 to-neon-cyan text-black font-black px-4 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                      style={{ boxShadow: '0 0 30px hsl(var(--neon-cyan) / 0.6)' }}
                      onClick={() => navigate('/login')}
                    >
                      🔐 PŘIHLÁSIT SE PRO KOUPI TIKETU
                    </Button>
                  )}
                  
                  {/* Show read-only message for admin users */}
                  {user && isAdmin && (
                    <div className="w-full text-center text-sm text-amber-400 py-3 font-bold">
                      👁️ ADMIN ZOBRAZENÍ - POUZE PRO ČTENÍ
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {contests.length === 0 && (
          <div className="neon-ticket ticket-game ticket-perforations">
            {/* Ticket perforations */}
            <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-green/50" />
              ))}
            </div>
            <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-green/50" />
              ))}
            </div>
            
            <div className="relative z-10 p-8 text-center">
              <div className="text-6xl mb-6">🎯</div>
              <h3 className="text-2xl font-black text-neon-green mb-4">🚀 ŽÁDNÉ SOUTĚŽE</h3>
              <p className="text-neon-green/80 font-medium">Momentálně nejsou dostupné žádné soutěže.</p>
            </div>
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

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Games;