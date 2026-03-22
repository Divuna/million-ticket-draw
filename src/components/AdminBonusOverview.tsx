import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface BonusOverviewData {
  contest_name: string;
  total_bonus_count: number;
  assigned_bonus_count: number;
  unassigned_bonus_count: number;
  bonus_positions: string | null;
}

export const AdminBonusOverview: React.FC = () => {
  const [bonusData, setBonusData] = useState<BonusOverviewData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBonusOverview();
  }, []);

  // Real-time subscription for bonus_prizes table changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-bonus-overview-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bonus_prizes'
      }, (payload) => {
        console.log('Bonus prizes changed, refreshing bonus overview...', payload);
        fetchBonusOverview();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBonusOverview = async () => {
    try {
      setLoading(true);
      
      // Get all contests
      const { data: contests, error: contestsError } = await supabase
        .from('contests')
        .select('id, title');

      if (contestsError) throw contestsError;

      // Get bonus overview data for each contest
      const bonusOverviewData: BonusOverviewData[] = [];

      for (const contest of contests || []) {
        const { data: bonuses, error: bonusError } = await supabase
          .from('bonus_prizes')
          .select('id, ticket_position')
          .eq('contest_id', contest.id);

        if (bonusError) {
          console.error('Error fetching bonuses for contest:', contest.id, bonusError);
          continue;
        }

        const bonusIds = (bonuses || []).map((b) => b.id);
        let winnersForContest: { prize_id: string | null }[] = [];

        if (bonusIds.length > 0) {
          const { data: winnersData, error: winnersError } = await supabase
            .from('winners')
            .select('prize_id')
            .eq('contest_id', contest.id)
            .eq('type', 'bonus')
            .in('prize_id', bonusIds);

          if (winnersError) {
            console.error('Error fetching winners for contest:', contest.id, winnersError);
          } else {
            winnersForContest = winnersData || [];
          }
        }

        const totalBonusCount = bonuses?.length || 0;
        const assignedPrizeIds = new Set(
          winnersForContest
            .map((w) => w.prize_id)
            .filter((id): id is string => !!id)
        );
        const assignedBonusCount = assignedPrizeIds.size;
        const unassignedBonusCount = totalBonusCount - assignedBonusCount;
        const bonusPositions = bonuses?.map(b => b.ticket_position).sort((a, b) => a - b).join(', ') || null;

        bonusOverviewData.push({
          contest_name: contest.title,
          total_bonus_count: totalBonusCount,
          assigned_bonus_count: assignedBonusCount,
          unassigned_bonus_count: unassignedBonusCount,
          bonus_positions: bonusPositions
        });
      }

      setBonusData(bonusOverviewData);
    } catch (error) {
      console.error('Error fetching bonus overview:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst přehled bonusů.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatBonusPositions = (positions: string | null): string => {
    if (!positions) return 'Žádné bonusy';
    
    const positionsArray = positions.split(', ');
    if (positionsArray.length <= 10) {
      return positions;
    }
    
    return `${positionsArray.slice(0, 10).join(', ')}... (+${positionsArray.length - 10} dalších)`;
  };

  const getBonusStatusBadge = (assigned: number, total: number) => {
    if (total === 0) return <Badge variant="secondary">Žádné bonusy</Badge>;
    if (assigned === total) return <Badge variant="default">Kompletní</Badge>;
    if (assigned === 0) return <Badge variant="destructive">Nepřiřazené</Badge>;
    return <Badge variant="outline">Částečné</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Přehled bonusů</CardTitle>
          <CardDescription>Načítání přehledu bonusových cen...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Přehled bonusů</CardTitle>
        <CardDescription>
          Real-time přehled bonusových cen ve všech soutěžích
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bonusData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Žádná data k zobrazení
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název soutěže</TableHead>
                  <TableHead className="text-center">Celkem bonusů</TableHead>
                  <TableHead className="text-center">Přiřazené</TableHead>
                  <TableHead className="text-center">Nepřiřazené</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Pozice bonusů</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonusData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {row.contest_name}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">
                        {row.total_bonus_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="default">
                        {row.assigned_bonus_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {row.unassigned_bonus_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {getBonusStatusBadge(row.assigned_bonus_count, row.total_bonus_count)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm text-muted-foreground break-all">
                        {formatBonusPositions(row.bonus_positions)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};