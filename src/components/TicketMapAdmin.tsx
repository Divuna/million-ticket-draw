import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TicketProgressBar } from '@/components/TicketProgressBar';
import { useUserRole } from '@/hooks/useUserRole';
import { RefreshCw } from 'lucide-react';

interface ContestRow {
  id: string;
  title: string;
  status: string;
  /** From contest_progress view */
  tickets_total: number;
  tickets_sold: number;
  tickets_remaining: number;
  sold_percent: number;
  /** From contest_revenue view */
  estimated_revenue: number;
  /** From contest_activity_last_24h view */
  tickets_last_24h: number;
  /** From bonus_prizes (positions only — not individual ticket rows) */
  bonus_positions: number[];
}

export const TicketMapAdmin: React.FC = () => {
  // Ticket map reveals winning/bonus positions, raw ticket activity and progress —
  // strictly superadmin-only. Scoped subadmins get a fallback and no data fetch.
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const highlightRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Base contest list
      const { data: contestRows, error: contestError } = await supabase
        .from('contests')
        .select('id, title, status')
        .in('status', ['active', 'closed', 'pending', 'paused'])
        .order('created_at', { ascending: false });

      if (contestError) throw contestError;
      if (!contestRows || contestRows.length === 0) {
        setContests([]);
        return;
      }

      const ids = contestRows.map((c) => c.id);

      // 2. Aggregated progress — NO individual ticket rows
      const [
        { data: progressRows },
        { data: revenueRows },
        { data: activityRows },
        { data: bonusRows, error: bonusError },
      ] = await Promise.all([
        supabase.from('contest_progress').select('contest_id,tickets_total,tickets_sold,tickets_remaining,sold_percent').in('contest_id', ids),
        supabase.from('contest_revenue').select('contest_id,estimated_revenue').in('contest_id', ids),
        supabase.from('contest_activity_last_24h').select('contest_id,tickets_last_24h').in('contest_id', ids),
        // Bonus positions are few rows compared to 1M tickets — safe to load
        supabase.from('bonus_prizes').select('contest_id,ticket_position').in('contest_id', ids),
      ]);

      if (bonusError) console.error('Error fetching bonus prizes:', bonusError);

      // Index by contest_id for O(1) lookup
      const progressMap: Record<string, typeof progressRows[0]> = {};
      (progressRows || []).forEach((r) => { progressMap[r.contest_id] = r; });

      const revenueMap: Record<string, number> = {};
      (revenueRows || []).forEach((r) => { revenueMap[r.contest_id] = r.estimated_revenue ?? 0; });

      const activityMap: Record<string, number> = {};
      (activityRows || []).forEach((r) => { activityMap[r.contest_id] = r.tickets_last_24h ?? 0; });

      const bonusMap: Record<string, number[]> = {};
      (bonusRows || []).forEach((b) => {
        if (!bonusMap[b.contest_id]) bonusMap[b.contest_id] = [];
        bonusMap[b.contest_id].push(b.ticket_position);
      });

      const mapped: ContestRow[] = contestRows.map((c) => {
        const p = progressMap[c.id];
        return {
          id:                c.id,
          title:             c.title,
          status:            c.status,
          tickets_total:     p?.tickets_total     ?? 1_000_000,
          tickets_sold:      p?.tickets_sold      ?? 0,
          tickets_remaining: p?.tickets_remaining ?? (p ? p.tickets_total - p.tickets_sold : 1_000_000),
          sold_percent:      p?.sold_percent      ?? 0,
          estimated_revenue: revenueMap[c.id]    ?? 0,
          tickets_last_24h:  activityMap[c.id]   ?? 0,
          bonus_positions:   bonusMap[c.id]       ?? [],
        };
      });

      setContests(mapped);
    } catch (err) {
      console.error('Error fetching ticket map data:', err);
      toast({ title: 'Chyba', description: 'Nepodařilo se načíst data tiketů.', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchData();

    // Realtime: bonus_prizes changes
    const bonusChannel = supabase
      .channel('ticket-map-bonus')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_prizes' }, (payload) => {
        fetchData(true);
        const pos =
          (payload.new && 'ticket_position' in payload.new && payload.new.ticket_position) ||
          (payload.old && 'ticket_position' in payload.old && payload.old.ticket_position);
        if (pos) {
          const msg =
            payload.eventType === 'INSERT' ? `Bonus přidán na pozici #${pos}` :
            payload.eventType === 'DELETE' ? `Bonus odstraněn z pozice #${pos}` :
            `Bonus upraven na pozici #${pos}`;
          toast({ title: 'Bonusová cena', description: msg });
        }
      })
      .subscribe();

    // Realtime: new ticket sold — refresh progress counts
    const ticketsChannel = supabase
      .channel('ticket-map-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (payload) => {
        fetchData(true);
        if (payload.new && 'number' in payload.new) {
          toast({ title: 'Nový tiket', description: `Tiket #${payload.new.number} byl zakoupen` });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(bonusChannel);
      supabase.removeChannel(ticketsChannel);
      Object.values(highlightRef.current).forEach(clearTimeout);
    };
  }, [isSuperAdmin]);

  // Non-superadmin: never render the ticket map (winning positions / raw tickets).
  if (!roleLoading && !isSuperAdmin) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center text-muted-foreground">
          Tato část je dostupná pouze superadminovi.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mapa tiketů</CardTitle>
            <CardDescription>
              Vizualizace průběhu prodeje a pozic cen — data jsou agregovaná, neprochází se individuální tikety
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Obnovit
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Načítání…</div>
        ) : contests.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">Žádná soutěž k zobrazení</div>
        ) : (
          contests.map((contest, idx) => (
            <div key={contest.id} className="space-y-3">
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-base">{contest.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    contest.status === 'active'  ? 'border-green-500/40 text-green-400 bg-green-500/10' :
                    contest.status === 'closed'  ? 'border-red-500/40   text-red-400   bg-red-500/10'   :
                    contest.status === 'paused'  ? 'border-orange-500/40 text-orange-400 bg-orange-500/10' :
                    'border-white/20 text-muted-foreground'
                  }`}>
                    {contest.status === 'active' ? 'Aktivní' :
                     contest.status === 'closed' ? 'Ukončeno' :
                     contest.status === 'paused' ? 'Pozastaveno' : 'Čeká'}
                  </span>
                </div>
                <Link to={`/admin/contest/${contest.id}`}>
                  <Button variant="outline" size="sm">Detail soutěže</Button>
                </Link>
              </div>

              {/* Progress bar — uses only aggregated data */}
              <TicketProgressBar
                ticketsTotal={contest.tickets_total}
                ticketsSold={contest.tickets_sold}
                soldPercent={contest.sold_percent}
                bonusPositions={contest.bonus_positions}
                ticketsLast24h={contest.tickets_last_24h}
                estimatedRevenue={contest.estimated_revenue}
              />

              {idx < contests.length - 1 && (
                <div className="border-b border-white/5 pt-2" />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
