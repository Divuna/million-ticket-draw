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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Truck, Package, Clock, CheckCircle, AlertCircle, UserCheck, Users, Download, AlertTriangle, Mail, MapPin, Calendar, User, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  winner_age?: number | null; // null = unknown, number = computed age
  winner_address?: string;
  contest?: {
    title: string;
  }[] | { title: string };
}

// Helper to compute age from date of birth
const computeAge = (dateOfBirth: string | null): number | null => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [guardianFilter, setGuardianFilter] = useState<GuardianFilter>('all');
  const [selectedPrizeIds, setSelectedPrizeIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryModalPrize, setSummaryModalPrize] = useState<BonusPrize | null>(null);
  const [summaryModalLoading, setSummaryModalLoading] = useState(false);

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
        .from('public_contests')
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
      // Only fetch actual wins (won or delivered status), not pending bonus positions
      const { data: prizesData, error: prizesError } = await supabase
        .from('bonus_prizes')
        .select(`
          id, contest_id, description, ticket_position, status, amount, admin_notes, created_at, guardian_required,
          contest:contests(title)
        `)
        .eq('contest_id', contestId)
        .in('status', ['won', 'delivered'])
        .order('ticket_position', { ascending: true });

      if (prizesError) throw prizesError;

      // Get tickets with user emails, user_id and address for won prizes
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('tickets')
        .select('number, user_id, user:users(email, address)')
        .eq('contest_id', contestId);

      if (ticketsError) throw ticketsError;

      // Map ticket positions to user emails, user_ids and addresses
      const ticketEmailMap = new Map<number, string>();
      const ticketUserIdMap = new Map<number, string>();
      const ticketAddressMap = new Map<number, string>();
      ticketsData?.forEach((ticket: any) => {
        const email = Array.isArray(ticket.user) ? ticket.user[0]?.email : ticket.user?.email;
        const address = Array.isArray(ticket.user) ? ticket.user[0]?.address : ticket.user?.address;
        if (email) {
          ticketEmailMap.set(ticket.number, email);
        }
        if (address) {
          ticketAddressMap.set(ticket.number, address);
        }
        if (ticket.user_id) {
          ticketUserIdMap.set(ticket.number, ticket.user_id);
        }
      });

      // Find guardian-required prizes with winners to fetch their ages
      const guardianPrizesWithWinners = (prizesData || []).filter(
        prize => prize.guardian_required && ticketUserIdMap.has(prize.ticket_position)
      );
      
      // Fetch profiles for these users
      const userIdsToFetch = [...new Set(guardianPrizesWithWinners.map(p => ticketUserIdMap.get(p.ticket_position)!))];
      const userAgeMap = new Map<string, number | null>();
      
      if (userIdsToFetch.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, date_of_birth')
          .in('id', userIdsToFetch);
        
        if (!profilesError && profilesData) {
          profilesData.forEach(profile => {
            userAgeMap.set(profile.id, computeAge(profile.date_of_birth));
          });
        }
      }

      // Enrich prizes with winner emails, ages and addresses
      const enrichedPrizes = (prizesData || []).map(prize => {
        const userId = ticketUserIdMap.get(prize.ticket_position);
        return {
          ...prize,
          winner_email: ticketEmailMap.get(prize.ticket_position) || '',
          winner_age: userId && prize.guardian_required ? (userAgeMap.get(userId) ?? null) : null,
          winner_address: ticketAddressMap.get(prize.ticket_position) || ''
        };
      });

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
      let successCount = 0;
      let errorCount = 0;

      // Use existing RPC for each prize to ensure server-side admin validation and audit logging
      for (const prizeId of Array.from(selectedPrizeIds)) {
        const { error } = await supabase.rpc('update_bonus_prize_delivery_status', {
          p_prize_id: prizeId,
          p_status: bulkStatus,
          p_admin_notes: null
        });

        if (error) {
          console.error('Error updating prize:', prizeId, error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (errorCount > 0) {
        toast({
          title: "Částečný úspěch",
          description: `Aktualizováno ${successCount} výher, ${errorCount} selhalo.`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Úspěch",
          description: `Stav ${successCount} výher byl hromadně aktualizován.`,
        });
      }

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
        .from('admin_winner_delivery_stats')
        .select('*');

      if (error) {
        console.error(error);
        setDeliverySummary([]);
        return [];
      }

      if (!data || data.length === 0) {
        setDeliverySummary([]);
        return [];
      }

      setDeliverySummary(data);
      return data;
    } catch (error) {
      console.error('Error fetching delivery summary:', error);
      setDeliverySummary([]);
      return [];
    }
  };

  const handleEditPrize = (prize: BonusPrize) => {
    setEditingPrize(prize);
    setNewStatus(prize.status);
    setNewNotes(prize.admin_notes || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPrize(null);
    setSummaryModalPrize(null);
    setNewStatus('');
    setNewNotes('');
  };

  const handleSavePrizeUpdate = async () => {
    // Use either editingPrize (from bonus prizes table) or summaryModalPrize (from summary badges)
    const prizeToUpdate = editingPrize || summaryModalPrize;
    if (!prizeToUpdate) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .rpc('update_bonus_prize_delivery_status', {
          p_prize_id: prizeToUpdate.id,
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
      
      // Close modal
      handleCloseModal();

    } catch (error) {
      console.error('Error updating prize delivery status:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat stav předání výhry.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Get contest title helper
  const getContestTitle = (prize: BonusPrize): string => {
    if (!prize.contest) return 'Neznámá soutěž';
    if (Array.isArray(prize.contest)) {
      return prize.contest[0]?.title || 'Neznámá soutěž';
    }
    return prize.contest.title || 'Neznámá soutěž';
  };

  // Check if prize is physical
  const isPrizePhysical = (prize: BonusPrize): boolean => {
    return !prize.amount || prize.amount === 0;
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

  // Handle click on prize position badge from summary table - modal only, no navigation
  const handlePrizePositionClick = async (contestTitle: string, ticketPosition: number, status: string) => {
    // Find the contest by title
    const contest = contests.find(c => c.title === contestTitle);
    if (!contest) {
      toast({
        title: "Soutěž nenalezena",
        description: `Soutěž "${contestTitle}" nebyla nalezena.`,
        variant: "destructive"
      });
      return;
    }

    setSummaryModalLoading(true);
    try {
      // Fetch the specific prize directly without changing selectedContestId
      const { data: prizeData, error: prizeError } = await supabase
        .from('bonus_prizes')
        .select(`
          id, contest_id, description, ticket_position, status, amount, admin_notes, created_at, guardian_required,
          contest:contests(title)
        `)
        .eq('contest_id', contest.id)
        .eq('ticket_position', ticketPosition)
        .in('status', ['won', 'delivered'])
        .single();

      if (prizeError || !prizeData) {
        toast({
          title: "Výhra nenalezena",
          description: `Výhra na pozici ${ticketPosition} nebyla nalezena.`,
          variant: "destructive"
        });
        return;
      }

      // Fetch winner email and address
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('number, user_id, user:users(email, address)')
        .eq('contest_id', contest.id)
        .eq('number', ticketPosition)
        .single();

      let winnerEmail: string | undefined;
      let winnerAddress: string | undefined;
      let winnerAge: number | null = null;

      if (ticketData) {
        const user = Array.isArray(ticketData.user) ? ticketData.user[0] : ticketData.user;
        winnerEmail = user?.email;
        winnerAddress = user?.address;

        // Fetch age if guardian required
        if (prizeData.guardian_required && ticketData.user_id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('date_of_birth')
            .eq('id', ticketData.user_id)
            .single();
          
          if (profileData?.date_of_birth) {
            winnerAge = computeAge(profileData.date_of_birth);
          }
        }
      }

      const enrichedPrize: BonusPrize = {
        ...prizeData,
        winner_email: winnerEmail,
        winner_address: winnerAddress,
        winner_age: winnerAge,
      };

      // Open modal with this prize (using local state, no navigation)
      setSummaryModalPrize(enrichedPrize);
      setNewStatus(enrichedPrize.status);
      setNewNotes(enrichedPrize.admin_notes || '');
      setIsModalOpen(true);

    } catch (error) {
      console.error('Error fetching prize for modal:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst detail výhry.",
        variant: "destructive"
      });
    } finally {
      setSummaryModalLoading(false);
    }
  };


  // Parse prize_positions string into clickable badges
  const renderPrizePositionBadges = (summary: DeliverySummary) => {
    if (!summary.prize_positions) {
      return <span className="text-muted-foreground">Žádné výhry</span>;
    }

    // Parse format: "5:won, 1:delivered(note), 10:won"
    const positions = summary.prize_positions.split(', ').filter(Boolean);
    
    return (
      <div className="flex flex-wrap gap-1">
        {positions.map((pos, idx) => {
          // Parse "5:won" or "5:delivered(note)"
          const match = pos.match(/^(\d+):(\w+)/);
          if (!match) return null;
          
          const ticketPosition = parseInt(match[1], 10);
          const status = match[2];
          
          const getBadgeVariant = (s: string) => {
            switch (s) {
              case 'delivered': return 'default';
              case 'won': return 'outline';
              default: return 'secondary';
            }
          };
          
          const getBadgeClass = (s: string) => {
            switch (s) {
              case 'delivered': return 'bg-green-500 hover:bg-green-600 cursor-pointer';
              case 'won': return 'hover:bg-muted cursor-pointer';
              default: return 'cursor-pointer';
            }
          };

          return (
            <Badge
              key={idx}
              variant={getBadgeVariant(status)}
              className={getBadgeClass(status)}
              onClick={() => handlePrizePositionClick(summary.contest_title, ticketPosition, status)}
            >
              #{ticketPosition}:{status === 'delivered' ? 'předáno' : status === 'won' ? 'vyhráno' : status}
            </Badge>
          );
        })}
      </div>
    );
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
              {deliverySummary.reduce((sum, item) => sum + item.won_count, 0)}
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
                  <TooltipProvider>
                    {filteredPrizes.map((prize) => {
                      const isPhysical = !prize.amount || prize.amount === 0;
                      const isUnder18Guardian = prize.guardian_required && prize.winner_age !== null && prize.winner_age < 18;
                      return (
                        <TableRow 
                          key={prize.id}
                          className={`cursor-pointer hover:bg-muted/50 ${isUnder18Guardian ? 'bg-yellow-500/10 border-l-4 border-l-yellow-500/60' : ''}`}
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
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              #{prize.ticket_position}
                              {isUnder18Guardian && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">
                                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Uživatel mladší 18 let – nutný kontakt zákonného zástupce</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{prize.description}</TableCell>
                          <TableCell>
                            {prize.amount && prize.amount > 0 ? `${prize.amount} MioCoins` : 'Fyzická výhra'}
                          </TableCell>
                          <TableCell>
                            {prize.amount && prize.amount > 0 ? null : (
                              prize.guardian_required ? (
                                <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/40">
                                  <Users className="w-3 h-3 mr-1" />
                                  ⚠️ Vyžaduje zákonného zástupce
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/40">
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
                  </TooltipProvider>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Prize Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Detail výhry #{(editingPrize || summaryModalPrize)?.ticket_position}
            </DialogTitle>
            <DialogDescription>
              Zobrazení a úprava detailů předání výhry
            </DialogDescription>
          </DialogHeader>

          {(editingPrize || summaryModalPrize) && (() => {
            const currentPrize = editingPrize || summaryModalPrize;
            return (
              <div className="space-y-6">
                {/* Prize Information Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Informace o výhře
                  </h4>
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30 border">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Soutěž</Label>
                      <p className="text-sm font-medium">{getContestTitle(currentPrize!)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Pozice tiketu</Label>
                      <p className="text-sm font-medium">#{currentPrize!.ticket_position}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Popis výhry</Label>
                      <p className="text-sm font-medium">{currentPrize!.description}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Typ výhry</Label>
                      <p className="text-sm font-medium">
                        {isPrizePhysical(currentPrize!) ? 'Fyzická výhra' : `${currentPrize!.amount} MioCoins`}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Vytvořeno</Label>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(currentPrize!.created_at).toLocaleDateString('cs-CZ')}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Winner Information Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Informace o výherci
                  </h4>
                  <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {currentPrize!.winner_email || <span className="text-muted-foreground italic">Zatím nepřiřazeno</span>}
                      </span>
                    </div>
                    
                    {currentPrize!.winner_age !== null && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">Věk: {currentPrize!.winner_age} let</span>
                      </div>
                    )}

                    {/* Guardian Required Indicator */}
                    {isPrizePhysical(currentPrize!) && (
                      <div className="pt-2">
                        {currentPrize!.guardian_required ? (
                          <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/40">
                            <Users className="w-3 h-3 mr-1" />
                            ⚠️ Vyžaduje zákonného zástupce
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/40">
                            <UserCheck className="w-3 h-3 mr-1" />
                            ✓ Převzetí možné od 15+ bez doprovodu
                          </Badge>
                        )}
                        
                        {currentPrize!.guardian_required && currentPrize!.winner_age !== null && currentPrize!.winner_age < 18 && (
                          <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30">
                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                              <AlertTriangle className="w-4 h-4" />
                              <span>Uživatel mladší 18 let – nutný kontakt zákonného zástupce</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Address - Only for Physical Prizes */}
                {isPrizePhysical(currentPrize!) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Doručovací adresa
                      </h4>
                      <div className="p-4 rounded-lg bg-muted/30 border">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <span className="text-sm">
                            {currentPrize!.winner_address || <span className="text-muted-foreground italic">Adresa není vyplněna</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Editable Fields Section */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Stav předání
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status-select">Stav</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger id="status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Čeká na předání</SelectItem>
                        <SelectItem value="won">Vyhráno</SelectItem>
                        <SelectItem value="delivered">Předáno</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes-input">Poznámky admina</Label>
                    <Textarea
                      id="notes-input"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Volitelné poznámky k předání výhry..."
                      className="min-h-[100px]"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCloseModal} disabled={saving}>
              Zrušit
            </Button>
            <Button onClick={handleSavePrizeUpdate} disabled={saving}>
              {saving ? (
                <>Ukládám...</>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Uložit změny
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    <TableCell className="max-w-md text-sm">
                      {renderPrizePositionBadges(summary)}
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
