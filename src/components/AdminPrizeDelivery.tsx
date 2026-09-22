import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Truck, Package, CheckCircle, Clock, AlertTriangle, Users, UserCheck, Download, Mail, MapPin } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Contest {
  id: string;
  title: string;
  status: string;
}

/**
 * One row from the admin_physical_winners view — already scoped to
 * physical prizes only (main is always physical; bonus is physical when
 * bonus_prizes.amount is null/0). MioCoin bonus winners never appear here.
 * `delivered` (from `winners`, the single authoritative source) is what
 * this page filters on — never copied, never a second status.
 */
interface PhysicalWinner {
  winner_id: string;
  contest_id: string;
  contest_title: string;
  type: 'main' | 'bonus';
  status: string | null;
  delivered: boolean;
  admin_notes: string | null;
  created_at: string;
  user_id: string;
  ticket_id: string | null;
  prize_id: string | null;
  description: string;
  image_url: string | null;
  ticket_position: number | null;
  amount: number | null;
  guardian_required: boolean | null;
  winner_email?: string;
  winner_address?: string;
}

interface DeliverySummary {
  contest_id: string;
  contest_name: string;
  total_winners: number;
  delivered: number;
  pending: number;
}

type GuardianFilter = 'all' | 'required' | 'not_required';

/**
 * Předání výher = historie dokončených fyzických výher (hlavní i bonusové).
 * Toto je čistě READ-ONLY přehled nad `winners` (jediný autoritativní zdroj
 * stavu výhry) přes view `admin_physical_winners` — žádná výhra se sem
 * nekopíruje ani nepřesouvá, stránka jen zobrazuje řádky s `delivered = true`.
 * Stav "Předáno" se nastavuje výhradně ve "Správa výher" (AdminWinners.tsx)
 * přes `admin_update_winner_status` — jakmile tam admin výhru označí jako
 * předanou, objeví se tady automaticky při dalším načtení, bez ručního kroku.
 */
export const AdminPrizeDelivery: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>('');
  const [deliveredWinners, setDeliveredWinners] = useState<PhysicalWinner[]>([]);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardianFilter, setGuardianFilter] = useState<GuardianFilter>('all');

  useEffect(() => {
    fetchContests();
    fetchDeliverySummary();
  }, []);

  useEffect(() => {
    if (selectedContestId) {
      fetchDeliveredPhysicalWinners(selectedContestId);
    }
  }, [selectedContestId]);

  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .select('id, title, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContests(data || []);
    } catch (error) {
      console.error('Error fetching contests:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst soutěže.",
        variant: "destructive"
      });
    }
  };

  const fetchDeliveredPhysicalWinners = async (contestId: string) => {
    setLoading(true);
    try {
      const { data: winnersData, error: winnersError } = await supabase
        .from('admin_physical_winners')
        .select('*')
        .eq('contest_id', contestId)
        .eq('delivered', true)
        .order('ticket_position', { ascending: true, nullsFirst: false });

      if (winnersError) throw winnersError;

      const rows = (winnersData || []) as PhysicalWinner[];
      const userIds = [...new Set(rows.map(w => w.user_id).filter(Boolean))];
      const userMap: Record<string, { email: string | null; address: string | null }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, email, address')
          .in('id', userIds);
        (usersData as { id: string; email: string | null; address: string | null }[] | null || []).forEach(u => {
          userMap[u.id] = { email: u.email, address: u.address };
        });
      }

      const enriched: PhysicalWinner[] = rows.map(w => ({
        ...w,
        amount: w.amount != null ? Number(w.amount) : null,
        winner_email: userMap[w.user_id]?.email || '',
        winner_address: userMap[w.user_id]?.address || '',
      }));

      setDeliveredWinners(enriched);
    } catch (error) {
      console.error('Error fetching delivered physical winners:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst předané výhry.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliverySummary = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_winner_delivery_stats')
        .select('*');

      if (error) {
        console.error(error);
        setDeliverySummary([]);
        return;
      }

      const rows = (data || []) as {
        contest_id: string;
        contest_name: string;
        total_winners: number | string | null;
        delivered: number | string | null;
        pending: number | string | null;
      }[];
      setDeliverySummary(
        rows.map(row => ({
          contest_id: row.contest_id,
          contest_name: row.contest_name,
          total_winners: Number(row.total_winners ?? 0),
          delivered: Number(row.delivered ?? 0),
          pending: Number(row.pending ?? 0),
        }))
      );
    } catch (error) {
      console.error('Error fetching delivery summary:', error);
      setDeliverySummary([]);
    }
  };

  // Filter by guardian requirement (bonus physical prizes only — main prizes
  // have no guardian_required attribute today, so they always pass through).
  const filteredWinners = useMemo(() => {
    if (guardianFilter === 'all') return deliveredWinners;
    return deliveredWinners.filter(w => {
      if (w.type === 'main') return true;
      if (guardianFilter === 'required') return w.guardian_required === true;
      if (guardianFilter === 'not_required') return w.guardian_required === false;
      return true;
    });
  }, [deliveredWinners, guardianFilter]);

  const hasGuardianRelevantPrizes = useMemo(
    () => deliveredWinners.some(w => w.type === 'bonus'),
    [deliveredWinners]
  );

  const handleExportGuardianCSV = () => {
    const guardianPrizes = deliveredWinners.filter(
      w => w.type === 'bonus' && w.guardian_required === true
    );

    if (guardianPrizes.length === 0) {
      toast({
        title: "Žádné výhry",
        description: "Nejsou žádné předané fyzické výhry vyžadující zákonného zástupce.",
        variant: "destructive"
      });
      return;
    }

    const headers = ['Email', 'Popis', 'Pozice tiketu', 'Stav', 'Datum'];
    const rows = guardianPrizes.map(w => [
      w.winner_email || '',
      w.description,
      w.ticket_position != null ? w.ticket_position.toString() : '',
      'Předáno',
      new Date(w.created_at).toLocaleDateString('cs-CZ')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `predane-vyhry-s-doprovodem-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export dokončen",
      description: `Exportováno ${guardianPrizes.length} výher.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem fyzických výher</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {deliverySummary.reduce((sum, item) => sum + Number(item.total_winners), 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Předáno</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {deliverySummary.reduce((sum, item) => sum + Number(item.delivered), 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čeká na předání</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {deliverySummary.reduce((sum, item) => sum + Number(item.pending), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contest Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Předání výher
          </CardTitle>
          <CardDescription>
            Historie skutečně předaných fyzických výher (hlavní i bonusové). Stav se nastavuje ve
            „Správa výher" — tato stránka jen zobrazuje výhry, u kterých je stav již „Předáno".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="contest-select">Soutěž</Label>
              <Select value={selectedContestId} onValueChange={setSelectedContestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte soutěž..." />
                </SelectTrigger>
                <SelectContent>
                  {contests.map((contest) => (
                    <SelectItem key={contest.id} value={contest.id}>
                      {contest.title} ({contest.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivered physical winners for the selected contest */}
      {selectedContestId && (
        <Card>
          <CardHeader>
            <CardTitle>Předané výhry - {contests.find(c => c.id === selectedContestId)?.title}</CardTitle>
            <CardDescription>
              Fyzické výhry (hlavní i bonusové) s aktuálním stavem „Předáno". Řádek zde zmizí sám,
              pokud by se stav ve Správě výher někdy vrátil zpět.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasGuardianRelevantPrizes && (
              <div className="flex flex-wrap gap-4 items-end mb-4">
                <div className="min-w-[200px]">
                  <Label htmlFor="guardian-filter">Doprovod</Label>
                  <Select value={guardianFilter} onValueChange={(v) => setGuardianFilter(v as GuardianFilter)}>
                    <SelectTrigger id="guardian-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Všechny</SelectItem>
                      <SelectItem value="required">Vyžaduje zákonného zástupce</SelectItem>
                      <SelectItem value="not_required">Bez doprovodu (15+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={handleExportGuardianCSV}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportovat předané výhry s požadavkem na doprovod (CSV)
                </Button>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Načítám výhry...</p>
              </div>
            ) : filteredWinners.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">V této soutěži zatím nejsou žádné předané fyzické výhry.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Typ</TableHead>
                    <TableHead>Pozice tiketu</TableHead>
                    <TableHead>Popis výhry</TableHead>
                    <TableHead>Doprovod</TableHead>
                    <TableHead>Výherce</TableHead>
                    <TableHead>Doručovací adresa</TableHead>
                    <TableHead>Poznámky admina</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider>
                    {filteredWinners.map((w) => {
                      const isUnder18Guardian = w.type === 'bonus' && w.guardian_required === true;
                      return (
                        <TableRow
                          key={w.winner_id}
                          className={isUnder18Guardian ? 'bg-yellow-500/10 border-l-4 border-l-yellow-500/60' : ''}
                        >
                          <TableCell>
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {w.type === 'main' ? 'Hlavní' : 'Bonusová'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {w.ticket_position != null ? `#${w.ticket_position}` : '—'}
                              {isUnder18Guardian && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">
                                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Výhra vyžadovala převzetí se zákonným zástupcem</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{w.description}</TableCell>
                          <TableCell>
                            {w.type === 'bonus' && (
                              w.guardian_required ? (
                                <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/40">
                                  <Users className="w-3 h-3 mr-1" />
                                  ⚠️ Vyžadoval zákonného zástupce
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/40">
                                  <UserCheck className="w-3 h-3 mr-1" />
                                  ✓ Převzetí od 15+ bez doprovodu
                                </Badge>
                              )
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">
                                {w.winner_email || <span className="text-muted-foreground italic">Neznámý e-mail</span>}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="flex items-start gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                              <span className="text-sm">
                                {w.winner_address || <span className="text-muted-foreground italic">Adresa není vyplněna</span>}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {w.admin_notes || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TooltipProvider>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delivery Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Přehled předání výher podle soutěží</CardTitle>
          <CardDescription>
            Souhrnné statistiky fyzických výher (hlavní i bonusové) pro všechny soutěže.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliverySummary.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Žádné data k zobrazení.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Soutěž</TableHead>
                  <TableHead className="text-center">Celkem fyzických výher</TableHead>
                  <TableHead className="text-center">Předáno</TableHead>
                  <TableHead className="text-center">Čeká na předání</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliverySummary
                  .filter(summary => Number(summary.total_winners) > 0)
                  .map((summary) => (
                    <TableRow key={summary.contest_id}>
                      <TableCell className="font-medium">{summary.contest_name}</TableCell>
                      <TableCell className="text-center">{summary.total_winners}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-medium">{summary.delivered}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-yellow-600 font-medium">{summary.pending}</span>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
