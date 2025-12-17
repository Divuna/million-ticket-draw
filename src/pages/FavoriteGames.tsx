import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ArrowLeft } from 'lucide-react';
import { TicketResultModal } from '@/components/TicketResultModal';
import { ContestCard } from '@/components/ContestCard';
import { useUserRole } from '@/hooks/useUserRole';
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
  banner_image?: string | null;
  main_prize_secondary_image?: string | null;
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

const FavoriteGames = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);

  const handleRemoveFavorite = async (contestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    setRemovingFavoriteId(contestId);
    
    // Optimistic update
    setContests(prev => prev.filter(c => c.id !== contestId));

    try {
      const { error } = await supabase
        .from('user_contest_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('contest_id', contestId);

      if (error) {
        // Revert on error
        fetchFavoriteContests();
        toast.error('Chyba při odebírání z oblíbených');
      } else {
        toast.success('Odebráno z oblíbených');
      }
    } catch (error) {
      fetchFavoriteContests();
      toast.error('Chyba při odebírání z oblíbených');
    } finally {
      setRemovingFavoriteId(null);
    }
  };

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
      // Fetch only favorited contests using JOIN via Supabase's foreign key relationship
      const { data, error } = await supabase
        .from('user_contest_favorites')
        .select(`
          contest_id,
          contests (
            id, title, description, main_prize, main_image, banner_image, main_prize_secondary_image, ticket_price, ticket_count, status, created_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Extract contests from the joined data - contests is a single object due to foreign key relationship
      const contestData: Contest[] = [];
      data?.forEach(item => {
        const contest = item.contests as unknown as Contest | null;
        if (contest) {
          contestData.push(contest);
        }
      });
      
      setContests(contestData);
    } catch (error) {
      console.error('Error fetching favorite contests:', error);
      toast.error('Chyba při načítání oblíbených soutěží');
    } finally {
      setLoading(false);
    }
  };

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
          toast.error('Tato hra již byla ukončena');
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
          toast.error('Tato hra již byla ukončena');
        } else if (errorMsg.includes('coins') || errorMsg.includes('mincí') || errorMsg.includes('balance')) {
          toast.error('Nedostatek miocoinů pro nákup tiketu');
        } else if (errorMsg.includes('full') || errorMsg.includes('plná')) {
          toast.error('Soutěž je plná');
        } else {
          toast.error(errorMsg);
        }
        return;
      }

      console.log('🔥 RPC raw response:', JSON.stringify(rpcResult, null, 2));
      
      const result: UnlockTicketResult = {
        ticket_number: rpcResult.ticket_number,
        ticket_price: rpcResult.ticket_price ?? 1,
        next_bonus_position: rpcResult.next_bonus_position ?? null,
        distance_to_next_bonus: rpcResult.distance_to_next_bonus ?? null,
        won_prize: rpcResult.won_prize ?? null,
        won_type: rpcResult.won_type ?? null,
        bonus_prize_id: rpcResult.bonus_prize_id ?? null,
        remaining_tickets: rpcResult.remaining_tickets ?? 0
      };

      setModalResult(result);
      setModalContestId(contestId);
      
      fetchFavoriteContests();
      
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
          <div className="text-center">Načítání oblíbených soutěží...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/games')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zpět
          </Button>
          <div className="text-center flex-1">
            <h1 className="mb-4 text-4xl font-bold text-neon-green inline-flex items-center gap-3 justify-center">
              Oblíbené soutěže
              {contests.length > 0 && (
                <Badge variant="secondary" className="text-lg px-3 py-1 bg-primary/20 text-primary">
                  {contests.length}
                </Badge>
              )}
            </h1>
            <p className="text-xl text-muted-foreground">Soutěže, které máte oblíbené nebo jste již hráli</p>
          </div>
          <div className="w-[100px]" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contests.map((contest) => (
            <ContestCard
              key={contest.id}
              contest={contest}
              user={user}
              isAdmin={isAdmin}
              processingContestId={processingContestId}
              onRemoveFavorite={handleRemoveFavorite}
              onPlay={handleUnlockTicket}
              fromPage="favorites"
            />
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

      <BottomNavigation />
    </div>
  );
};

export default FavoriteGames;
