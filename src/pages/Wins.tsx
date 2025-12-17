import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminMenu } from '@/components/AdminMenu';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Gift, Package, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { MIOCOIN_IMAGE_URL } from '@/components/MioCoin';

const SUPABASE_URL = 'https://xkzhjldrojjlrkezorey.supabase.co';

// Build full storage URL for bonus prize images stored in contest-images bucket
const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  // If already a full URL, return as-is
  if (path.startsWith('http')) return path;
  // Build full public URL for contest-images bucket
  return `${SUPABASE_URL}/storage/v1/object/public/contest-images/${path}`;
};

interface Win {
  id: string;
  type: string;
  status: string | null;
  delivered: boolean;
  notes: string | null;
  created_at: string;
  contest_id: string;
  prize_id: string | null;
  contest: {
    id: string;
    title: string;
    main_prize: string;
    main_image: string | null;
    main_prize_secondary_image: string | null;
  } | null;
  bonus_prize: {
    id: string;
    title: string | null;
    image_url: string | null;
  } | null;
}

const Wins: React.FC = () => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wins, setWins] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchWins();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchWins = async () => {
    if (!user) return;

    try {
      // Step 1: Fetch winners without embedded JOINs (no FK constraints)
      const { data: winsData, error: winsError } = await supabase
        .from('winners')
        .select('id, type, status, delivered, notes, created_at, contest_id, prize_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (winsError) throw winsError;
      if (!winsData || winsData.length === 0) {
        setWins([]);
        return;
      }

      // Step 2: Get unique contest_ids and prize_ids
      const contestIds = [...new Set(winsData.map(w => w.contest_id).filter(Boolean))] as string[];
      const prizeIds = [...new Set(winsData.map(w => w.prize_id).filter(Boolean))] as string[];

      // Step 3: Fetch contests separately
      let contestsMap = new Map<string, any>();
      if (contestIds.length > 0) {
        const { data: contestsData } = await supabase
          .from('contests')
          .select('id, title, main_prize, main_image, main_prize_secondary_image')
          .in('id', contestIds);
        
        if (contestsData) {
          contestsMap = new Map(contestsData.map(c => [c.id, c]));
        }
      }

      // Step 4: Fetch bonus_prizes separately
      let prizesMap = new Map<string, any>();
      if (prizeIds.length > 0) {
        const { data: prizesData } = await supabase
          .from('bonus_prizes')
          .select('id, title, image_url')
          .in('id', prizeIds);
        
        if (prizesData) {
          prizesMap = new Map(prizesData.map(p => [p.id, p]));
        }
      }

      // Step 5: Join data on frontend
      const transformedWins: Win[] = winsData.map(win => ({
        ...win,
        contest: contestsMap.get(win.contest_id) || null,
        bonus_prize: win.prize_id ? prizesMap.get(win.prize_id) || null : null
      }));

      setWins(transformedWins);
    } catch (error) {
      console.error('Error fetching wins:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string | null, delivered: boolean) => {
    if (delivered) {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Doručeno</Badge>;
    }
    switch (status) {
      case 'čeká na potvrzení':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení</Badge>;
      case 'potvrzeno':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Package className="w-3 h-3 mr-1" /> Potvrzeno</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> {status || 'Zpracovává se'}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'main':
        return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 'bonus':
        return <Gift className="h-6 w-6 text-purple-500" />;
      default:
        return <Gift className="h-6 w-6 text-blue-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'main':
        return 'Hlavní výhra';
      case 'bonus':
        return 'Bonusová výhra';
      default:
        return 'Výhra';
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <p className="text-muted-foreground text-center">Pro zobrazení výher se musíte přihlásit.</p>
        </main>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="h-8 w-8 text-yellow-500" />
          <h1 className="text-2xl font-bold text-foreground">Moje výhry</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card/50">
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : wins.length === 0 ? (
          <Card className="bg-card/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Trophy className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-center">
                Zatím nemáte žádné výhry.
              </p>
              <p className="text-muted-foreground/70 text-sm text-center mt-1">
                Kupte si tikety v soutěžích a vyhrajte skvělé ceny!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {wins.map((win) => (
              <Card 
                key={win.id} 
                className="bg-card/50 hover:bg-card/70 transition-colors cursor-pointer"
                onClick={() => navigate(`/contest/${win.contest_id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getTypeIcon(win.type)}
                      <div>
                        <CardTitle className="text-lg">
                          {win.contest?.title || 'Soutěž'}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {getTypeLabel(win.type)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(win.status, win.delivered)}
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const imageUrl = win.type === 'main'
                      ? (win.contest?.main_prize_secondary_image || win.contest?.main_image)
                      : (getStorageUrl(win.bonus_prize?.image_url) || MIOCOIN_IMAGE_URL);
                    
                    return imageUrl ? (
                      <div className="mb-3 rounded-lg overflow-hidden">
                        <img 
                          src={imageUrl} 
                          alt={win.contest?.title || 'Výhra'}
                          className="w-full h-32 object-cover"
                          onError={(e) => {
                            // Fallback to MioCoin if image fails to load
                            if (win.type === 'bonus' && e.currentTarget.src !== MIOCOIN_IMAGE_URL) {
                              e.currentTarget.src = MIOCOIN_IMAGE_URL;
                            }
                          }}
                        />
                      </div>
                    ) : null;
                  })()}
                  <div className="flex items-center gap-2 text-sm">
                    <Gift className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground font-medium">
                      {win.type === 'main' ? win.contest?.main_prize : win.notes || 'Bonusová cena'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Wins;
