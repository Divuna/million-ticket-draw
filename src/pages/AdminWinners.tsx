import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';
import { AdminMenu } from '@/components/AdminMenu';
import { ImageOff, X, ChevronDown, ChevronUp, MapPin, History, Download, Check, Coins, Trophy, Gift } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const SUPABASE_URL = 'https://xkzhjldrojjlrkezorey.supabase.co';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/contest-images/${path}`;
};

interface UserAddress {
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
}

interface WinnerData {
  id: string;
  user_id: string;
  contest_id: string;
  prize_id: string | null;
  type: 'main' | 'bonus';
  status: string | null;
  created_at: string;
  updated_at: string | null;
  user_email: string;
  user_avatar: string | null;
  contest_title: string;
  prize_description: string;
  prize_image: string | null;
  user_address: UserAddress;
}

interface StatusHistoryEntry {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  created_at: string;
  admin_email?: string;
}

const AdminWinners: React.FC = () => {
  const { user, session } = useAuth();
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [filteredWinners, setFilteredWinners] = useState<WinnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<Record<string, StatusHistoryEntry[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [expandedPrizeDescription, setExpandedPrizeDescription] = useState<string | null>(null);
  const [selectedWinners, setSelectedWinners] = useState<Set<string>>(new Set());
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState<string>('');
  const [exportDateTo, setExportDateTo] = useState<string>('');
  const [exportPreviewCount, setExportPreviewCount] = useState<number | null>(null);

  const statusOptions = [
    { value: 'all', label: 'Všechny stavy' },
    { value: 'auto_credited', label: 'Automaticky připsáno' },
    { value: 'čeká na potvrzení', label: 'Čeká na potvrzení' },
    { value: 'připraveno k odeslání', label: 'Připraveno k odeslání' },
    { value: 'odesláno', label: 'Odesláno' },
    { value: 'vyplaceno', label: 'Vyplaceno' }
  ];

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'čeká na potvrzení':
        return { badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', trigger: 'border-yellow-500/50 text-yellow-400' };
      case 'připraveno k odeslání':
        return { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', trigger: 'border-blue-500/50 text-blue-400' };
      case 'odesláno':
        return { badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30', trigger: 'border-purple-500/50 text-purple-400' };
      case 'vyplaceno':
        return { badge: 'bg-green-500/20 text-green-400 border-green-500/30', trigger: 'border-green-500/50 text-green-400' };
      default:
        return { badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', trigger: 'border-yellow-500/50 text-yellow-400' };
    }
  };

  // Helper to determine if a winner is an auto-credited MioCoin bonus (no admin actions needed)
  const isAutoCreditBonus = (winner: WinnerData): boolean => {
    if (winner.type !== 'bonus') return false;
    const desc = (winner.prize_description || '').toLowerCase();
    // Check for MioCoin/credit indicators in prize description
    return desc.includes('miocoin') || 
           desc.includes('mio coin') || 
           desc.includes('kredit') ||
           desc.includes('credit') ||
           /^\d+\s*(mio|mc|coin)/i.test(desc);
  };

  // Check admin access
  const isAdmin = user?.email === 'divispavel2@gmail.com';

  useEffect(() => {
    if (isAdmin) {
      fetchWinners();
    }
  }, [isAdmin]);

  // Pre-fetch last status change for all winners
  useEffect(() => {
    const fetchLastStatusChanges = async () => {
      if (winners.length === 0) return;
      
      const winnerIds = winners.map(w => w.id);
      
      try {
        // Fetch all history entries for these winners
        const { data, error } = await supabase
          .from('winner_status_history')
          .select('id, winner_id, old_status, new_status, changed_by, created_at')
          .in('winner_id', winnerIds)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by winner_id and get only the most recent entry for each
        const groupedHistory: Record<string, StatusHistoryEntry[]> = {};
        
        // Fetch admin emails
        const adminIds = [...new Set((data || []).map(h => h.changed_by).filter(Boolean))];
        let adminEmails: Record<string, string> = {};
        
        if (adminIds.length > 0) {
          const { data: admins } = await supabase
            .from('users')
            .select('id, email')
            .in('id', adminIds);
          
          adminEmails = (admins || []).reduce((acc, a) => {
            acc[a.id] = a.email;
            return acc;
          }, {} as Record<string, string>);
        }

        (data || []).forEach(entry => {
          const historyEntry: StatusHistoryEntry = {
            ...entry,
            admin_email: entry.changed_by ? adminEmails[entry.changed_by] : undefined
          };
          
          if (!groupedHistory[entry.winner_id]) {
            groupedHistory[entry.winner_id] = [];
          }
          groupedHistory[entry.winner_id].push(historyEntry);
        });

        setHistoryData(prev => ({ ...prev, ...groupedHistory }));
      } catch (error) {
        console.error('Error fetching status history:', error);
      }
    };

    fetchLastStatusChanges();
  }, [winners]);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredWinners(winners);
    } else if (statusFilter === 'auto_credited') {
      // Show only MioCoin auto-credited rewards
      const filtered = winners.filter(winner => isAutoCreditBonus(winner));
      setFilteredWinners(filtered);
    } else {
      // Physical status filters - exclude MioCoin auto-credited rewards
      const filtered = winners.filter(winner => {
        // Skip auto-credited MioCoin bonuses from physical status filters
        if (isAutoCreditBonus(winner)) return false;
        return (winner.status || 'čeká na potvrzení') === statusFilter;
      });
      setFilteredWinners(filtered);
    }
  }, [winners, statusFilter]);

  // Fetch export preview count when date filters change
  useEffect(() => {
    const fetchExportCount = async () => {
      try {
        let query = supabase
          .from('winner_status_history')
          .select('id', { count: 'exact', head: true });

        if (exportDateFrom) {
          query = query.gte('created_at', `${exportDateFrom}T00:00:00`);
        }
        if (exportDateTo) {
          query = query.lte('created_at', `${exportDateTo}T23:59:59`);
        }

        const { count } = await query;
        setExportPreviewCount(count);
      } catch (error) {
        console.error('Error fetching export count:', error);
      }
    };

    fetchExportCount();
  }, [exportDateFrom, exportDateTo]);

  const fetchWinners = async () => {
    try {
      setLoading(true);
      
      // Fetch winners with user email and contest title
      const { data, error } = await supabase
        .from('winners')
        .select(`
          id,
          user_id,
          contest_id,
          prize_id,
          type,
          status,
          created_at,
          users!inner(email, first_name, last_name, address, phone),
          contests!inner(title, main_prize, main_prize_secondary_image, main_image)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch all user avatars from profiles table
      const userIds = [...new Set((data || []).map(w => w.user_id))];
      let userAvatars: Record<string, string | null> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);
        
        userAvatars = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.avatar_url;
          return acc;
        }, {} as Record<string, string | null>);
      }

      // Process the data and fetch bonus prize descriptions
      const processedWinners: WinnerData[] = [];
      
      for (const winner of data || []) {
        let prizeDescription = '';
        let prizeImage: string | null = null;
        
        if (winner.type === 'main') {
          prizeDescription = (winner.contests as any)?.main_prize || 'Hlavní cena';
          prizeImage = (winner.contests as any)?.main_prize_secondary_image || (winner.contests as any)?.main_image || null;
        } else if (winner.type === 'bonus' && winner.prize_id) {
          const { data: bonusData } = await supabase
            .from('bonus_prizes')
            .select('description, image_url')
            .eq('id', winner.prize_id)
            .single();
          
          prizeDescription = bonusData?.description || 'Bonusová cena';
          prizeImage = getStorageUrl(bonusData?.image_url);
        }

        const userData = winner.users as any;

        processedWinners.push({
          id: winner.id,
          user_id: winner.user_id,
          contest_id: winner.contest_id,
          prize_id: winner.prize_id,
          type: winner.type as 'main' | 'bonus',
          status: winner.status || 'čeká na potvrzení',
          created_at: winner.created_at,
          updated_at: null,
          user_email: userData?.email || 'Neznámý uživatel',
          user_avatar: userAvatars[winner.user_id] || null,
          contest_title: (winner.contests as any)?.title || 'Neznámá soutěž',
          prize_description: prizeDescription,
          prize_image: prizeImage,
          user_address: {
            first_name: userData?.first_name || null,
            last_name: userData?.last_name || null,
            address: userData?.address || null,
            phone: userData?.phone || null
          }
        });
      }

      setWinners(processedWinners);
    } catch (error) {
      console.error('Error fetching winners:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst výhry.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusMessage = (status: string, prizeName: string): string => {
    switch (status) {
      case 'čeká na potvrzení':
        return `Vaše výhra "${prizeName}" čeká na potvrzení.`;
      case 'připraveno k odeslání':
        return `Vaše výhra "${prizeName}" je připravena k odeslání.`;
      case 'odesláno':
        return `Vaše výhra "${prizeName}" byla odeslána.`;
      case 'vyplaceno':
        return `Vaše výhra "${prizeName}" byla vyplacena.`;
      default:
        return `Stav vaší výhry "${prizeName}" byl aktualizován na: ${status}.`;
    }
  };

  const fetchHistory = async (winnerId: string) => {
    if (historyData[winnerId]) {
      // Toggle expand if already loaded
      setExpandedHistory(expandedHistory === winnerId ? null : winnerId);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('winner_status_history')
        .select('id, old_status, new_status, changed_by, created_at')
        .eq('winner_id', winnerId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch admin emails for changed_by
      const adminIds = [...new Set((data || []).map(h => h.changed_by).filter(Boolean))];
      let adminEmails: Record<string, string> = {};
      
      if (adminIds.length > 0) {
        const { data: admins } = await supabase
          .from('users')
          .select('id, email')
          .in('id', adminIds);
        
        adminEmails = (admins || []).reduce((acc, a) => {
          acc[a.id] = a.email;
          return acc;
        }, {} as Record<string, string>);
      }

      const historyWithEmails = (data || []).map(h => ({
        ...h,
        admin_email: h.changed_by ? adminEmails[h.changed_by] : undefined
      }));

      setHistoryData(prev => ({ ...prev, [winnerId]: historyWithEmails }));
      setExpandedHistory(winnerId);
    } catch (error) {
      console.error('Error fetching history:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst historii změn.",
        variant: "destructive"
      });
    }
  };

  const exportHistoryToCsv = async () => {
    setExportingCsv(true);
    try {
      let query = supabase
        .from('winner_status_history')
        .select('id, winner_id, old_status, new_status, changed_by, created_at')
        .order('created_at', { ascending: false });

      if (exportDateFrom) {
        query = query.gte('created_at', `${exportDateFrom}T00:00:00`);
      }
      if (exportDateTo) {
        query = query.lte('created_at', `${exportDateTo}T23:59:59`);
      }

      const { data: historyEntries, error: historyError } = await query;

      if (historyError) throw historyError;

      if (!historyEntries || historyEntries.length === 0) {
        toast({ title: "Info", description: "Žádné záznamy historie k exportu." });
        setExportingCsv(false);
        return;
      }

      const adminIds = [...new Set(historyEntries.map(h => h.changed_by).filter(Boolean))];
      let adminEmails: Record<string, string> = {};
      
      if (adminIds.length > 0) {
        const { data: admins } = await supabase.from('users').select('id, email').in('id', adminIds);
        adminEmails = (admins || []).reduce((acc, a) => { acc[a.id] = a.email; return acc; }, {} as Record<string, string>);
      }

      const winnerInfo: Record<string, { user_email: string; contest_title: string; prize_description: string }> = {};
      for (const winnerId of [...new Set(historyEntries.map(h => h.winner_id))]) {
        const winner = winners.find(w => w.id === winnerId);
        if (winner) {
          winnerInfo[winnerId] = { user_email: winner.user_email, contest_title: winner.contest_title, prize_description: winner.prize_description };
        }
      }

      const headers = ['Datum', 'Uživatel', 'Soutěž', 'Cena', 'Starý stav', 'Nový stav', 'Změnil admin'];
      const rows = historyEntries.map(entry => {
        const info = winnerInfo[entry.winner_id] || { user_email: 'Neznámý', contest_title: 'Neznámá', prize_description: 'Neznámá' };
        return [
          new Date(entry.created_at).toLocaleString('cs-CZ'),
          info.user_email, info.contest_title, info.prize_description,
          entry.old_status || '(nový)', entry.new_status,
          entry.changed_by ? (adminEmails[entry.changed_by] || entry.changed_by) : ''
        ];
      });

      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `historie-stavu-vyher-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: "Export dokončen", description: `Exportováno ${historyEntries.length} záznamů.` });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast({ title: "Chyba", description: "Nepodařilo se exportovat historii.", variant: "destructive" });
    } finally {
      setExportingCsv(false);
    }
  };

  // Helper to derive ui_status for CSV export
  const deriveUiStatusForExport = (winner: WinnerData): string => {
    // Check if delivered (status vyplaceno means delivered)
    if (winner.status === 'vyplaceno') return 'doručeno';
    // Check if notes contain 'odesláno' or status is 'odesláno'
    if (winner.status === 'odesláno' || winner.status === 'připraveno k odeslání') return 'odesláno';
    // Default
    return 'čeká';
  };

  const exportWinnersToCsv = () => {
    if (filteredWinners.length === 0) {
      toast({ title: "Info", description: "Žádné výhry k exportu." });
      return;
    }

    // Reordered columns: Email, First name, Last name, Phone, Address, Contest name, Prize type, Prize description, Status, Win date
    const headers = ['Email', 'Jméno', 'Příjmení', 'Telefon', 'Adresa', 'Soutěž', 'Typ výhry', 'Popis ceny', 'Stav', 'Datum výhry'];
    const rows = filteredWinners.map(winner => [
      winner.user_email,
      winner.user_address.first_name || '',
      winner.user_address.last_name || '',
      winner.user_address.phone || '',
      winner.user_address.address || '',
      winner.contest_title,
      winner.type === 'main' ? 'Hlavní výhra' : 'Bonus',
      winner.prize_description,
      deriveUiStatusForExport(winner),
      new Date(winner.created_at).toLocaleString('cs-CZ')
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `onemil-admin-vyhry-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: "Export dokončen", description: `Exportováno ${filteredWinners.length} výher.` });
  };

  const updateWinnerStatus = async (winnerId: string, newStatus: string) => {
    try {
      // Find the winner to get user_id and prize info
      const winner = winners.find(w => w.id === winnerId);
      if (!winner) {
        throw new Error('Winner not found');
      }

      const oldStatus = winner.status || 'čeká na potvrzení';

      // First, update the status in the database
      const { error: updateError } = await supabase
        .from('winners')
        .update({ status: newStatus })
        .eq('id', winnerId);

      if (updateError) {
        console.error('Error updating winner status in database:', updateError);
        toast({
          title: "Chyba",
          description: "Nepodařilo se aktualizovat stav výhry v databázi.",
          variant: "destructive"
        });
        return;
      }

      // Log status change to history table
      const { error: historyError } = await supabase
        .from('winner_status_history')
        .insert({
          winner_id: winnerId,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: user?.id || null
        });

      if (historyError) {
        console.error('Error logging status history:', historyError);
        // Continue anyway - main update succeeded
      }

      // Only after successful DB update, send message to user
      const messageContent = getStatusMessage(newStatus, winner.prize_description);
      
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          user_id: winner.user_id,
          sender: 'admin',
          content: messageContent,
          read: false,
          topic: 'prize_status',
          event: 'prize_status_change',
          payload: {
            winner_id: winnerId,
            prize_description: winner.prize_description,
            new_status: newStatus,
            contest_title: winner.contest_title
          }
        });

      if (messageError) {
        console.error('Error sending message:', messageError);
        // Message failed but DB update succeeded - still update UI
      }
      
      // Update local state
      setWinners(prev => prev.map(w => 
        w.id === winnerId 
          ? { ...w, status: newStatus, updated_at: new Date().toISOString() }
          : w
      ));

      // Clear history cache for this winner so it refreshes on next view
      setHistoryData(prev => {
        const newData = { ...prev };
        delete newData[winnerId];
        return newData;
      });

      toast({
        title: "Stav výhry aktualizován",
        description: "Stav výhry byl úspěšně změněn a uživatel byl informován.",
      });

    } catch (error) {
      console.error('Error updating winner status:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat stav výhry.",
        variant: "destructive"
      });
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám výhry...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Správa výher</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={exportDateFrom}
                      onChange={(e) => setExportDateFrom(e.target.value)}
                      className="w-36 h-9"
                      placeholder="Od"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="date"
                      value={exportDateTo}
                      onChange={(e) => setExportDateTo(e.target.value)}
                      className="w-36 h-9"
                      placeholder="Do"
                    />
                    {(exportDateFrom || exportDateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setExportDateFrom(''); setExportDateTo(''); }}
                        className="h-9 px-2"
                        title="Resetovat filtry"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {exportPreviewCount !== null && (
                      <Badge variant="secondary" className="text-xs">
                        {exportPreviewCount} záznamů
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportHistoryToCsv}
                      disabled={exportingCsv || exportPreviewCount === 0}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      {exportingCsv ? 'Exportuji...' : 'Export historie (CSV)'}
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Celkem výher: {winners.length}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                  <label htmlFor="status-filter" className="text-sm font-medium">
                    Filtr podle stavu:
                  </label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary" className="text-xs">
                    {filteredWinners.length} výher
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportWinnersToCsv}
                  disabled={filteredWinners.length === 0}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export výher (CSV)
                </Button>
              </div>
            </CardHeader>
            
            <CardContent>
              {filteredWinners.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Žádné výhry k zobrazení.</p>
                </div>
              ) : (
                <div className="rounded-md border max-h-[450px] overflow-auto relative">
                  <div className="min-w-max">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="w-20">Obrázek</TableHead>
                        <TableHead>Email uživatele</TableHead>
                        <TableHead>Adresa</TableHead>
                        <TableHead>Název soutěže</TableHead>
                        <TableHead>Popis ceny</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Stav</TableHead>
                        <TableHead>Historie</TableHead>
                        <TableHead>Akce</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWinners.map((winner) => {
                        const isAutoCredit = isAutoCreditBonus(winner);
                        return (
                        <TableRow 
                          key={winner.id}
                          className={`${selectedWinners.has(winner.id) ? 'bg-primary/10 ring-1 ring-primary/30' : ''} ${isAutoCredit ? 'bg-amber-500/5' : ''}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedWinners.has(winner.id)}
                              onCheckedChange={(checked) => {
                                setSelectedWinners(prev => {
                                  const next = new Set(prev);
                                  if (checked) {
                                    next.add(winner.id);
                                  } else {
                                    next.delete(winner.id);
                                  }
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {winner.prize_image ? (
                              <img 
                                src={winner.prize_image} 
                                alt="Obrázek ceny"
                                className="w-16 h-16 object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setPreviewImage(winner.prize_image)}
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div 
                              className={`w-16 h-16 bg-muted rounded-md items-center justify-center ${winner.prize_image ? 'hidden' : 'flex'}`}
                            >
                              <ImageOff className="w-6 h-6 text-muted-foreground" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={winner.user_avatar || undefined} alt={winner.user_email} />
                                <AvatarFallback className="bg-muted text-xs">
                                  {winner.user_email?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{winner.user_email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                                  <MapPin className="h-3 w-3" />
                                  Zobrazit adresu
                                  <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-1 text-xs">
                                <div className="grid gap-1 rounded-md bg-muted/50 p-2">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Jméno:</span>
                                    <span className="font-medium">
                                      {winner.user_address.first_name && winner.user_address.last_name 
                                        ? `${winner.user_address.first_name} ${winner.user_address.last_name}`
                                        : winner.user_address.first_name || winner.user_address.last_name || 'Nezadáno'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Adresa:</span>
                                    <span className="font-medium text-right max-w-[150px]">
                                      {winner.user_address.address || 'Nezadáno'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Telefon:</span>
                                    <span className="font-medium">
                                      {winner.user_address.phone || 'Nezadáno'}
                                    </span>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </TableCell>
                          <TableCell>{winner.contest_title}</TableCell>
                          <TableCell>
                            {winner.prize_description && winner.prize_description.length > 20 ? (
                              <div className="relative">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-auto py-1 px-2 gap-1 text-xs max-w-[180px]"
                                  onClick={() => setExpandedPrizeDescription(
                                    expandedPrizeDescription === winner.id ? null : winner.id
                                  )}
                                >
                                  <span className="truncate text-left">
                                    {winner.prize_description.substring(0, 20)}…
                                  </span>
                                  {expandedPrizeDescription === winner.id ? (
                                    <ChevronUp className="h-3 w-3 flex-shrink-0" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 flex-shrink-0" />
                                  )}
                                </Button>
                                {expandedPrizeDescription === winner.id && (
                                  <div className="absolute z-10 top-full left-0 mt-1 w-64 bg-popover border rounded-md shadow-lg p-3 text-xs">
                                    <div className="font-medium mb-1 text-foreground">Popis ceny</div>
                                    <p className="text-muted-foreground whitespace-pre-wrap">
                                      {winner.prize_description}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm">{winner.prize_description || '—'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isAutoCreditBonus(winner) ? (
                              <Badge variant="secondary" className="gap-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                                <Coins className="h-3 w-3" />
                                MioCoin
                              </Badge>
                            ) : winner.type === 'main' ? (
                              <Badge variant="secondary" className="gap-1.5 bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                <Trophy className="h-3 w-3" />
                                Hlavní cena
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1.5 bg-purple-500/20 text-purple-400 border-purple-500/30">
                                <Gift className="h-3 w-3" />
                                Bonusová cena
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isAutoCreditBonus(winner) ? (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 border">
                                Připsáno
                              </Badge>
                            ) : (
                              <Badge className={`${getStatusColor(winner.status).badge} border`}>
                                {winner.status || 'Čeká na potvrzení'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {/* Win date for all rewards */}
                              <span className="text-xs text-orange-400 block">
                                Vyhráno: {new Date(winner.created_at).toLocaleString('cs-CZ', { 
                                  day: '2-digit', 
                                  month: '2-digit', 
                                  year: 'numeric', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </span>
                              
                              {isAutoCreditBonus(winner) ? (
                                <span className="text-xs text-green-400 block">
                                  Připsáno: {new Date(winner.created_at).toLocaleString('cs-CZ', { 
                                    day: '2-digit', 
                                    month: '2-digit', 
                                    year: 'numeric', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </span>
                              ) : (
                                <div className="relative">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-auto py-1 px-2 gap-1 text-xs max-w-[180px]"
                                    onClick={() => fetchHistory(winner.id)}
                                  >
                                    {historyData[winner.id] && historyData[winner.id].length > 0 ? (
                                      <span className="truncate text-left">
                                        {historyData[winner.id][0].new_status} · {new Date(historyData[winner.id][0].created_at).toLocaleString('cs-CZ')}
                                      </span>
                                    ) : (
                                      <>
                                        <History className="h-3 w-3 flex-shrink-0" />
                                        <span>Žádná historie</span>
                                      </>
                                    )}
                                    {expandedHistory === winner.id ? (
                                      <ChevronUp className="h-3 w-3 flex-shrink-0" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3 flex-shrink-0" />
                                    )}
                                  </Button>
                                  {expandedHistory === winner.id && historyData[winner.id] && (
                                    <div className="absolute z-10 top-full left-0 mt-1 w-72 bg-popover border rounded-md shadow-lg p-2 text-xs">
                                      <div className="font-medium mb-2 text-foreground">Historie změn stavu</div>
                                      {historyData[winner.id].length === 0 ? (
                                        <p className="text-muted-foreground">Žádné změny</p>
                                      ) : (
                                        <div className="max-h-48 overflow-y-auto space-y-2">
                                          {historyData[winner.id].map((entry) => (
                                            <div key={entry.id} className="border-b border-border/50 pb-2 last:border-0">
                                              <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">{entry.old_status || '(nový)'}</span>
                                                <span className="mx-1">→</span>
                                                <span className="font-medium text-foreground">{entry.new_status}</span>
                                              </div>
                                              <div className="text-muted-foreground mt-1">
                                                {new Date(entry.created_at).toLocaleString('cs-CZ')}
                                                {entry.admin_email && (
                                                  <span className="ml-1">({entry.admin_email})</span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {isAutoCreditBonus(winner) ? (
                              <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
                                Automaticky připsáno
                              </Badge>
                            ) : (
                              <Select
                                value={winner.status || 'čeká na potvrzení'}
                                onValueChange={(value) => updateWinnerStatus(winner.id, value)}
                              >
                                <SelectTrigger className={`w-48 ${getStatusColor(winner.status).trigger}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="čeká na potvrzení">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                      Čeká na potvrzení
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="připraveno k odeslání">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                      Připraveno k odeslání
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="odesláno">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                                      Odesláno
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="vyplaceno">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                      Vyplaceno
                                    </span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AdminMenu />
      
      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-background/95 backdrop-blur">
          <button 
            onClick={() => setPreviewImage(null)}
            className="absolute top-2 right-2 z-10 p-1 rounded-full bg-background/80 hover:bg-background transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          {previewImage && (
            <img 
              src={previewImage} 
              alt="Náhled obrázku ceny"
              className="w-full h-auto max-h-[80vh] object-contain rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWinners;