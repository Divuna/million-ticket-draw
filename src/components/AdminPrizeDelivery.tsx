import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Truck, Package, Clock, CheckCircle, AlertCircle, UserCheck, Users, Download } from 'lucide-react';

interface Contest {
  id: string;
  title: string;
  status: string;
}

interface BonusPrize {
  id: string;
  contest_id: string;
  description: string;
  ticket_position: number;
  status: string;
  amount?: number;
  admin_notes?: string;
  created_at: string;
  guardian_required?: boolean;
  winner_email?: string;
  contest?: {
    title: string;
  }[] | { title: string };
}

interface DeliverySummary {
  contest_title: string;
  total_prizes: number;
  delivered_count: number;
  pending_count: number;
  won_count: number;
  prize_positions: string;
  summary_text: string;
}

type GuardianFilter = 'all' | 'required' | 'not_required';

export const AdminPrizeDelivery: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>('');
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPrize, setEditingPrize] = useState<BonusPrize | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [guardianFilter, setGuardianFilter] = useState<GuardianFilter>('all');
  const [selectedPrizeIds, setSelectedPrizeIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Fetch contests on component mount
  useEffect(() => {
    fetchContests();
    fetchDeliverySummary();
  }, []);

  // Fetch prizes when contest is selected
  useEffect(() => {
    if (selectedContestId) {
      fetchBonusPrizes(selectedContestId);
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

  const fetchBonusPrizes = async (contestId: string) => {
    setLoading(true);
    try {
      // First get bonus prizes
      const { data: prizesData, error: prizesError } = await supabase
        .from('bonus_prizes')
        .select(`
          id, contest_id, description, ticket_position, status, amount, admin_notes, created_at, guardian_required,
          contest:contests(title)
        `)
        .eq('contest_id', contestId)
        .order('ticket_position', { ascending: true });

      if (prizesError) throw prizesError;

      // Get tickets with user emails for won prizes
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('tickets')
        .select('number, user:users(email)')
        .eq('contest_id', contestId);

      if (ticketsError) throw ticketsError;

      // Map ticket positions to user emails
      const ticketEmailMap = new Map<number, string>();
      ticketsData?.forEach((ticket: any) => {
        const email = Array.isArray(ticket.user) ? ticket.user[0]?.email : ticket.user?.email;
        if (email) {
          ticketEmailMap.set(ticket.number, email);
        }
      });

      // Enrich prizes with winner emails
      const enrichedPrizes = (prizesData || []).map(prize => ({
        ...prize,
        winner_email: ticketEmailMap.get(prize.ticket_position) || ''
      }));

      setBonusPrizes(enrichedPrizes);
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst bonusové výhry.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if there are any physical prizes
  const hasPhysicalPrizes = useMemo(() => {
    return bonusPrizes.some(p => !p.amount || p.amount === 0);
  }, [bonusPrizes]);

  // Filter prizes based on guardian filter
  const filteredPrizes = useMemo(() => {
    if (guardianFilter === 'all') return bonusPrizes;
    
    return bonusPrizes.filter(prize => {
      // Only filter physical prizes
      if (prize.amount && prize.amount > 0) return true;
      
      if (guardianFilter === 'required') {
        return prize.guardian_required === true;
      } else if (guardianFilter === 'not_required') {
        return prize.guardian_required === false;
      }
      return true;
    });
  }, [bonusPrizes, guardianFilter]);

  // Get only physical prizes from filtered list
  const physicalPrizes = useMemo(() => {
    return filteredPrizes.filter(p => !p.amount || p.amount === 0);
  }, [filteredPrizes]);

  // Handle checkbox selection
  const handleSelectPrize = (prizeId: string, checked: boolean) => {
    const newSelected = new Set(selectedPrizeIds);
    if (checked) {
      newSelected.add(prizeId);
    } else {
      newSelected.delete(prizeId);
    }
    setSelectedPrizeIds(newSelected);
  };

  // Handle select all for physical prizes
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allPhysicalIds = new Set(physicalPrizes.map(p => p.id));
      setSelectedPrizeIds(allPhysicalIds);
    } else {
      setSelectedPrizeIds(new Set());
    }
  };

  // Check if all physical prizes are selected
  const allPhysicalSelected = physicalPrizes.length > 0 && physicalPrizes.every(p => selectedPrizeIds.has(p.id));
  const somePhysicalSelected = physicalPrizes.some(p => selectedPrizeIds.has(p.id));

  // Handle bulk status update
  const handleBulkUpdate = async () => {
    if (selectedPrizeIds.size === 0 || !bulkStatus) return;

    setBulkUpdating(true);
    try {
      const { error } = await supabase
        .from('bonus_prizes')
        .update({ status: bulkStatus })
        .in('id', Array.from(selectedPrizeIds));

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: `Stav ${selectedPrizeIds.size} výher byl hromadně aktualizován.`,
      });

      // Refresh data and clear selection
      if (selectedContestId) {
        fetchBonusPrizes(selectedContestId);
      }
      fetchDeliverySummary();
      setSelectedPrizeIds(new Set());
      setBulkStatus('');

    } catch (error) {
      console.error('Error bulk updating prizes:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se hromadně aktualizovat výhry.",
        variant: "destructive"
      });
    } finally {
      setBulkUpdating(false);
    }
  };

  // Export guardian-required prizes to CSV
  const handleExportGuardianCSV = () => {
    const guardianPrizes = bonusPrizes.filter(
      prize => (!prize.amount || prize.amount === 0) && prize.guardian_required === true
    );

    if (guardianPrizes.length === 0) {
      toast({
        title: "Žádné výhry",
        description: "Nejsou žádné fyzické výhry vyžadující zákonného zástupce.",
        variant: "destructive"
      });
      return;
    }

    const headers = ['Email', 'Popis', 'Pozice tiketu', 'Stav', 'Datum'];
    const rows = guardianPrizes.map(prize => [
      prize.winner_email || '',
      prize.description,
      prize.ticket_position.toString(),
      prize.status,
      new Date(prize.created_at).toLocaleDateString('cs-CZ')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vyhry-s-doprovodem-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export dokončen",
      description: `Exportováno ${guardianPrizes.length} výher.`,
    });
  };

  const fetchDeliverySummary = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_prizes_delivery_summary');

      if (error) throw error;
      setDeliverySummary(data || []);
    } catch (error) {
      console.error('Error fetching delivery summary:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst přehled předání výher.",
        variant: "destructive"
      });
    }
  };

  const handleEditPrize = (prize: BonusPrize) => {
    setEditingPrize(prize);
    setNewStatus(prize.status);
    setNewNotes(prize.admin_notes || '');
  };

  const handleSavePrizeUpdate = async () => {
    if (!editingPrize) return;

    try {
      const { data, error } = await supabase
        .rpc('update_bonus_prize_delivery_status', {
          p_prize_id: editingPrize.id,
          p_status: newStatus,
          p_admin_notes: newNotes || null
        });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Stav předání výhry byl úspěšně aktualizován.",
      });

      // Refresh data
      if (selectedContestId) {
        fetchBonusPrizes(selectedContestId);
      }
      fetchDeliverySummary();
      
      // Reset form
      setEditingPrize(null);
      setNewStatus('');
      setNewNotes('');

    } catch (error) {
      console.error('Error updating prize delivery status:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat stav předání výhry.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Předáno</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Čeká</Badge>;
      case 'won':
        return <Badge variant="outline"><Package className="w-3 h-3 mr-1" />Vyhráno</Badge>;
      default:
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'won':
        return <Package className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem výher</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {deliverySummary.reduce((sum, item) => sum + item.total_prizes, 0)}
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
              {deliverySummary.reduce((sum, item) => sum + item.delivered_count, 0)}
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
              {deliverySummary.reduce((sum, item) => sum + item.pending_count + item.won_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contest Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Správa předání výher
          </CardTitle>
          <CardDescription>
            Vyberte soutěž pro správu stavu předání bonusových výher
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

      {/* Prize Management Table */}
      {selectedContestId && (
        <Card>
          <CardHeader>
            <CardTitle>Bonusové výhry - {contests.find(c => c.id === selectedContestId)?.title}</CardTitle>
            <CardDescription>
              Klikněte na řádek pro upravení stavu předání výhry
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Guardian Filter and Export */}
            {hasPhysicalPrizes && (
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
                  Exportovat výhry s požadavkem na doprovod (CSV)
                </Button>
              </div>
            )}

            {/* Bulk Action Panel */}
            {selectedPrizeIds.size > 0 && (
              <div className="flex flex-wrap gap-4 items-center mb-4 p-4 bg-muted/50 rounded-lg border">
                <span className="text-sm font-medium">
                  Vybráno: {selectedPrizeIds.size} výher
                </span>
                <div className="min-w-[180px]">
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nový stav..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Čeká na předání</SelectItem>
                      <SelectItem value="won">Vyhráno</SelectItem>
                      <SelectItem value="delivered">Předáno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleBulkUpdate} 
                  disabled={!bulkStatus || bulkUpdating}
                >
                  {bulkUpdating ? 'Ukládám...' : 'Uložit hromadně'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSelectedPrizeIds(new Set());
                    setBulkStatus('');
                  }}
                >
                  Zrušit výběr
                </Button>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Načítám výhry...</p>
              </div>
            ) : bonusPrizes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">V této soutěži nejsou žádné bonusové výhry.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {hasPhysicalPrizes && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allPhysicalSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Vybrat všechny fyzické výhry"
                        />
                      </TableHead>
                    )}
                    <TableHead>Pozice tiketu</TableHead>
                    <TableHead>Popis výhry</TableHead>
                    <TableHead>Hodnota</TableHead>
                    <TableHead>Doprovod</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Poznámky admina</TableHead>
                    <TableHead>Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPrizes.map((prize) => {
                    const isPhysical = !prize.amount || prize.amount === 0;
                    return (
                      <TableRow 
                        key={prize.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleEditPrize(prize)}
                      >
                        {hasPhysicalPrizes && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isPhysical ? (
                              <Checkbox
                                checked={selectedPrizeIds.has(prize.id)}
                                onCheckedChange={(checked) => handleSelectPrize(prize.id, checked as boolean)}
                                aria-label={`Vybrat výhru ${prize.description}`}
                              />
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell className="font-medium">#{prize.ticket_position}</TableCell>
                        <TableCell>{prize.description}</TableCell>
                        <TableCell>
                          {prize.amount && prize.amount > 0 ? `${prize.amount} MioCoins` : 'Fyzická výhra'}
                        </TableCell>
                        <TableCell>
                          {prize.amount && prize.amount > 0 ? null : (
                            prize.guardian_required ? (
                              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                                <Users className="w-3 h-3 mr-1" />
                                ⚠️ Vyžaduje zákonného zástupce
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                <UserCheck className="w-3 h-3 mr-1" />
                                ✓ Převzetí možné od 15+ bez doprovodu
                              </Badge>
                            )
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(prize.status)}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {prize.admin_notes || '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPrize(prize);
                            }}
                          >
                            Upravit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Prize Modal/Form */}
      {editingPrize && (
        <Card>
          <CardHeader>
            <CardTitle>Upravit stav předání výhry</CardTitle>
            <CardDescription>
              Výhra #{editingPrize.ticket_position}: {editingPrize.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="status-select">Stav</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Čeká na předání</SelectItem>
                  <SelectItem value="won">Vyhráno</SelectItem>
                  <SelectItem value="delivered">Předáno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="notes-input">Poznámky admina</Label>
              <Textarea
                id="notes-input"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Volitelné poznámky k předání výhry..."
                className="min-h-[80px]"
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleSavePrizeUpdate}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Uložit
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditingPrize(null);
                  setNewStatus('');
                  setNewNotes('');
                }}
              >
                Zrušit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Přehled předání výher podle soutěží</CardTitle>
          <CardDescription>
            Souhrnné statistiky předání výher pro všechny soutěže
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
                  <TableHead className="text-center">Celkem</TableHead>
                  <TableHead className="text-center">Předáno</TableHead>
                  <TableHead className="text-center">Čeká</TableHead>
                  <TableHead className="text-center">Vyhráno</TableHead>
                  <TableHead>Pozice výher</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliverySummary.map((summary, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{summary.contest_title}</TableCell>
                    <TableCell className="text-center">{summary.total_prizes}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600 font-medium">{summary.delivered_count}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-yellow-600 font-medium">{summary.pending_count}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-blue-600 font-medium">{summary.won_count}</span>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {summary.prize_positions || 'Žádné výhry'}
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