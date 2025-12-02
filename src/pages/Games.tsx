import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketResultModal } from '@/components/TicketResultModal';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';

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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
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
    if (user) {
      fetchFavorites();
    }
  }, [user]);

  const fetchFavorites = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_contest_favorites')
        .select('contest_id')
        .eq('user_id', user.id);

      if (error) throw error;
      
      setFavorites(new Set(data.map(f => f.contest_id)));
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const toggleFavorite = async (contestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Pro uložení oblíbených se musíte přihlásit');
      return;
    }

    const isFavorite = favorites.has(contestId);

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('user_contest_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('contest_id', contestId);

        if (error) throw error;

        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(contestId);
          return newSet;
        });
        toast.success('Odebráno z oblíbených');
      } else {
        const { error } = await supabase
          .from('user_contest_favorites')
          .insert({ user_id: user.id, contest_id: contestId });

        if (error) throw error;

        setFavorites(prev => new Set(prev).add(contestId));
        toast.success('Přidáno do oblíbených');
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error('Chyba při ukládání oblíbené');
    }
  };

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
      // Call atomic RPC for ticket purchase
      const { data, error } = await supabase.rpc('buy_ticket_atomic', {
        p_contest_id: contestId,
        p_user_id: user.id
      });

      if (error) {
        console.error('RPC error:', error);
        if (error.message?.includes('closed') || error.message?.includes('uzavřena')) {
          toast.error('Soutěž je uzavřena');
        } else if (error.message?.includes('coins') || error.message?.includes('mincí') || error.message?.includes('balance')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (error.message?.includes('full') || error.message?.includes('plná')) {
          toast.error('Soutěž je plná');
        } else {
          toast.error('Chyba při koupi tiketu');
        }
        return;
      }

      // Normalize result - handle both array and object responses
      const rpcResult = Array.isArray(data) ? data[0] : data;
      
      if (!rpcResult) {
        toast.error('Chyba při koupi tiketu');
        return;
      }

      if (!rpcResult.success) {
        const errorMsg = String(rpcResult.error || 'Chyba při koupi tiketu');
        if (errorMsg.includes('closed') || errorMsg.includes('uzavřena')) {
          toast.error('Soutěž je uzavřena');
        } else if (errorMsg.includes('coins') || errorMsg.includes('mincí') || errorMsg.includes('balance')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (errorMsg.includes('full') || errorMsg.includes('plná')) {
          toast.error('Soutěž je plná');
        } else {
          toast.error(errorMsg);
        }
        return;
      }

      const result: UnlockTicketResult = {
        ticket_number: rpcResult.ticket_number,
        ticket_price: rpcResult.ticket_price || 1,
        next_bonus_position: rpcResult.next_bonus_position || null,
        distance_to_next_bonus: rpcResult.distance_to_next_bonus || null,
        won_prize: rpcResult.won_prize || null,
        won_type: rpcResult.won_type || null,
        bonus_prize_id: rpcResult.bonus_prize_id || null,
        remaining_tickets: rpcResult.remaining_tickets || 0
      };

      // Send event to Sofinity
      try {
        await supabase.functions.invoke('send_event_to_sofinity', {
          body: {
            event_name: 'coin_redeemed',
            user_id: user.id,
            contest_id: contestId,
            metadata: {
              ticket_number: result.ticket_number,
              ticket_price: result.ticket_price
            }
          }
        });
      } catch (sofinityError) {
        console.error('Sofinity event error:', sofinityError);
      }

      setModalResult(result);
      setModalContestId(contestId);
      
      // Refresh contests
      fetchContests();
      
      if (result.won_prize) {
        toast.success(`Gratulujeme! Vyhrál jsi ${result.won_prize}!`);
      } else {
        toast.success(`Tiket #${result.ticket_number.toLocaleString('cs-CZ')} zakoupen!`);
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
        <div className="flex items-center justify-between mb-8">
          <div className="text-center flex-1">
            <h1 className="mb-4 text-4xl font-bold text-neon-green">OneMil</h1>
            <p className="text-xl text-muted-foreground">Vyberte si soutěž a zkuste štěstí!</p>
          </div>
          
          <Button 
            className="bg-[#FF4D4D] hover:bg-[#FF3333] text-white font-bold px-8 py-6 rounded-full text-lg"
            onClick={() => navigate('/favorite-games')}
          >
            OBLÍBENÉ
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contests.map((contest) => (
            <div
              key={contest.id}
              className="contest-card rounded-2xl overflow-hidden relative"
            >
              {/* Full-width banner image */}
              {contest.main_image ? (
                <img
                  src={
                    contest.main_image.startsWith("http")
                      ? contest.main_image
                      : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`
                  }
                  alt={contest.title}
                  className="w-full h-64 object-cover"
                  onError={(e) => {
                    console.log('Contest image failed to load:', contest.main_image);
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-64 bg-muted/40 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <span className="text-6xl">🎯</span>
                  </div>
                </div>
              )}
              
              {/* Bottom dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
              
              {/* Status badge */}
              <div className="absolute top-3 right-3">
                {contest.status === 'closed' ? (
                  <Badge className="bg-destructive text-destructive-foreground">
                    Hra ukončena
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-primary/90 text-primary-foreground border-0">
                    {contest.status === 'active' ? 'Aktivní' : 'Připravuje se'}
                  </Badge>
                )}
              </div>
              
              {/* Favorite button */}
              {user && !isAdmin && (
                <button
                  onClick={(e) => toggleFavorite(contest.id, e)}
                  className="absolute top-3 left-3 z-10 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
                  aria-label="Toggle favorite"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      favorites.has(contest.id)
                        ? 'fill-red-500 text-red-500'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              )}
              
              {/* Overlay content */}
              <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
                <h3 className="font-bold text-lg text-white line-clamp-2 mb-1">
                  {contest.title}
                </h3>
                <p className="text-sm text-white/80 line-clamp-1">
                  {contest.main_prize}
                </p>
                
                {/* Show interactive buttons only for logged-in non-admin users */}
                {user && !isAdmin && (
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 py-2 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleUnlockTicket(contest.id)}
                      disabled={contest.status !== 'active' || processingContestId === contest.id}
                    >
                      {processingContestId === contest.id 
                        ? 'Zpracování...' 
                        : contest.status === 'pending'
                          ? 'Připravuje se...'
                          : contest.status === 'closed'
                          ? 'Ukončena'
                          : `Uplatnit ${contest.ticket_price} MioCoinů`
                      }
                    </button>
                    <button
                      className="py-2 px-4 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-lg border border-white/30 hover:bg-white/30 transition-colors"
                      onClick={() => navigate(`/contest/${contest.id}`, { state: { from: 'games' } })}
                    >
                      Detail
                    </button>
                  </div>
                )}
                
                {/* Show login prompt for non-logged-in users */}
                {!user && (
                  <button
                    className="w-full py-2 px-4 mt-2 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-lg border border-white/30 hover:bg-white/30 transition-colors"
                    onClick={() => navigate('/login')}
                  >
                    Přihlásit se pro koupi tiketu
                  </button>
                )}
                
                {/* Show read-only message for admin users */}
                {user && isAdmin && (
                  <div className="text-xs text-white/70 text-center mt-2">
                    Admin zobrazení - pouze pro čtení
                  </div>
                )}
              </div>
            </div>
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
