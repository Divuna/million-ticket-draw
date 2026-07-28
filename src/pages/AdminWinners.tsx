import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { ImageOff, X, ChevronDown, ChevronUp, MapPin, History, Download, Check, Coins, Trophy, Gift, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabaseUrl } from '@/integrations/supabase/client';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${supabaseUrl}/storage/v1/object/public/contest-images/${path}`;
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
  user_nickname: string | null;
  user_avatar: string | null;
  contest_title: string;
  prize_description: string;
  prize_image: string | null;
  internal_notes: string | null;
  user_address: UserAddress;
  ticket_number: number | null;
}

interface StatusHistoryEntry {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  created_at: string;
  admin_email?: string;
}

/**
 * Tracks admin verification state per winner.
 * Stored in audit_logs (event = 'winner_admin_verified' | 'winner_admin_unverified')
 * because the winners table has no verified_by_admin column.
 */
interface VerificationInfo {
  verified: boolean;
  admin_id: string | null;
  admin_email?: string;
  verified_at: string | null;
}

const AdminWinners: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
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
  const [verifications, setVerifications] = useState<Record<string, VerificationInfo>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const historyPopupRef = useRef<HTMLDivElement>(null);

  // Close history popup when clicking outside
  useEffect(() => {
    if (!expandedHistory) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (historyPopupRef.current && !historyPopupRef.current.contains(event.target as Node)) {
        setExpandedHistory(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedHistory]);

  const statusOptions = [
    { value: 'all', label: 'Všechny stavy' },
    { value: 'auto_credited', label: 'Automaticky připsáno' },
    { value: 'pending', label: 'Čeká' },
    { value: 'připraveno k odeslání', label: 'Připraveno k odeslání' },
    { value: 'shipped', label: 'Odesláno' },
    { value: 'delivered', label: 'Předáno' }
  ];

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Čeká';
      case 'shipped':
        return 'Odesláno';
      case 'delivered':
        return 'Předáno';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', trigger: 'border-yellow-500/50 text-yellow-400' };
      case 'připraveno k odeslání':
        return { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', trigger: 'border-blue-500/50 text-blue-400' };
      case 'shipped':
        return { badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30', trigger: 'border-purple-500/50 text-purple-400' };
      case 'delivered':
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

  // Admin access is checked via useUserRole hook

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
        return (winner.status || 'pending') === statusFilter;
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

  /**
   * Reads all winner_admin_verified / winner_admin_unverified entries from
   * audit_logs and rebuilds the per-winner verification map.
   * The latest audit entry for each winner wins.
   */
  const loadVerifications = async (winnerIds: string[]) => {
    if (winnerIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, event, metadata, created_at')
        .in('event', ['winner_admin_verified', 'winner_admin_unverified'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('audit_logs read error (verification):', error);
        return;
      }

      // Only rows whose metadata.winner_id is in our current winner set
      const winnerSet = new Set(winnerIds);
      const relevant = (data || []).filter(
        (row) => winnerSet.has(row.metadata?.winner_id)
      );

      // Fetch admin emails for involved user_ids
      const adminIds = [...new Set(relevant.map((r) => r.user_id).filter(Boolean))];
      let emailMap: Record<string, string> = {};
      if (adminIds.length > 0) {
        const { data: admins } = await supabase
          .from('users')
          .select('id, email')
          .in('id', adminIds);
        emailMap = (admins || []).reduce((acc, a) => {
          acc[a.id] = a.email;
          return acc;
        }, {} as Record<string, string>);
      }

      // Build map: winner_id → latest state
      const map: Record<string, VerificationInfo> = {};
      for (const row of relevant) {
        const wid = row.metadata?.winner_id as string | undefined;
        if (!wid || map[wid]) continue; // skip if already set (rows are DESC)
        map[wid] = {
          verified:    row.event === 'winner_admin_verified',
          admin_id:    row.user_id,
          admin_email: row.user_id ? emailMap[row.user_id] : undefined,
          verified_at: row.created_at,
        };
      }

      setVerifications((prev) => ({ ...prev, ...map }));
    } catch (err) {
      console.error('Error loading verifications:', err);
    }
  };

  /**
   * Toggles admin verification for a winner.
   * Writes a new audit_log row; never mutates the winners table.
   */
  const toggleVerification = async (winner: WinnerData) => {
    if (verifyingId) return;
    setVerifyingId(winner.id);

    const current = verifications[winner.id];
    const nowVerified = current?.verified ?? false;
    const newEvent = nowVerified ? 'winner_admin_unverified' : 'winner_admin_verified';

    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id:  user?.id ?? null,
        event:    newEvent,
        metadata: {
          winner_id:     winner.id,
          contest_id:    winner.contest_id,
          ticket_number: winner.ticket_number,
          prize:         winner.prize_description,
          action:        nowVerified ? 'unverified by admin' : 'verified by admin',
        },
      });

      if (error) throw error;

      // Optimistic update
      setVerifications((prev) => ({
        ...prev,
        [winner.id]: {
          verified:    !nowVerified,
          admin_id:    user?.id ?? null,
          admin_email: user?.email,
          verified_at: new Date().toISOString(),
        },
      }));

      toast({
        title: nowVerified ? 'Ověření odebráno' : 'Výhra ověřena',
        description: nowVerified
          ? `Ověření výhry ${winner.prize_description} bylo zrušeno.`
          : `Výhra ${winner.prize_description} byla označena jako ověřená adminem.`,
      });
    } catch (err: any) {
      console.error('Error toggling verification:', err);
      toast({
        title: 'Chyba',
        description: err?.message || 'Nepodařilo se uložit ověření.',
        variant: 'destructive',
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const fetchWinners = async () => {
    try {
      setLoading(true);
      
      // Fetch winners with user email, nickname, contest title, and ticket_id
      const { data, error } = await supabase
        .from('winners')
        .select(`
          id,
          user_id,
          contest_id,
          prize_id,
          ticket_id,
          type,
          status,
          created_at,
          users!inner(email, first_name, last_name, address, phone, nickname),
          contests!inner(title, main_prize, main_prize_secondary_image, main_image)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let internalNoteMap: Record<string, string | null> = {};
      if (isSuperAdmin && data && data.length > 0) {
        const { data: internalNotes, error: internalNotesError } = await supabase
          .rpc('get_winner_internal_notes_superadmin', {
            p_winner_ids: data.map((winner) => winner.id),
          });
        if (internalNotesError) throw internalNotesError;
        internalNoteMap = (internalNotes || []).reduce((acc, row) => {
          acc[row.id] = row.notes;
          return acc;
        }, {} as Record<string, string | null>);
      }

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

      // Fetch ticket numbers for main winners (winners.ticket_id → tickets.number)
      const mainWinnerTicketIds = (data || [])
        .filter((w: any) => w.type === 'main' && w.ticket_id)
        .map((w: any) => w.ticket_id);
      let ticketNumberMap: Record<string, number> = {};
      if (mainWinnerTicketIds.length > 0) {
        const { data: ticketsData } = await supabase
          .from('tickets')
          .select('id, number')
          .in('id', mainWinnerTicketIds);
        (ticketsData || []).forEach((t: any) => {
          ticketNumberMap[t.id] = t.number;
        });
      }

      // Process the data and fetch bonus prize descriptions
      const processedWinners: WinnerData[] = [];
      
      for (const winner of data || []) {
        let prizeDescription = '';
        let prizeImage: string | null = null;
        let ticketNumber: number | null = null;
        
        if (winner.type === 'main') {
          prizeDescription = (winner.contests as any)?.main_prize || 'Hlavní cena';
          prizeImage = (winner.contests as any)?.main_prize_secondary_image || (winner.contests as any)?.main_image || null;
          ticketNumber = (winner as any).ticket_id ? ticketNumberMap[(winner as any).ticket_id] ?? null : null;
        } else if (winner.type === 'bonus' && winner.prize_id) {
          const { data: bonusData } = await supabase
            .from('bonus_prizes')
            .select('description, image_url, ticket_position')
            .eq('id', winner.prize_id)
            .single();
          
          prizeDescription = bonusData?.description || 'Bonusová cena';
          prizeImage = getStorageUrl(bonusData?.image_url);
          ticketNumber = bonusData?.ticket_position || null;
        }

        const userData = winner.users as any;

        processedWinners.push({
          id: winner.id,
          user_id: winner.user_id,
          contest_id: winner.contest_id,
          prize_id: winner.prize_id,
          type: winner.type as 'main' | 'bonus',
          status: winner.status || 'pending',
          created_at: winner.created_at,
          updated_at: null,
          user_email: userData?.email || 'Neznámý uživatel',
          user_nickname: userData?.nickname || null,
          user_avatar: userAvatars[winner.user_id] || null,
          contest_title: (winner.contests as any)?.title || 'Neznámá soutěž',
          prize_description: prizeDescription,
          prize_image: prizeImage,
          internal_notes: internalNoteMap[winner.id] ?? null,
          user_address: {
            first_name: userData?.first_name || null,
            last_name: userData?.last_name || null,
            address: userData?.address || null,
            phone: userData?.phone || null
          },
          ticket_number: ticketNumber
        });
      }

      setWinners(processedWinners);

      // Load admin verifications from audit_logs (no schema change needed)
      await loadVerifications(processedWinners.map((w) => w.id));
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
      case 'pending':
        return `Vaše výhra "${prizeName}" je ve stavu Čeká.`;
      case 'připraveno k odeslání':
        return `Vaše výhra "${prizeName}" je připravena k odeslání.`;
      case 'shipped':
        return `Vaše výhra "${prizeName}" byla odeslána.`;
      case 'delivered':
        return `Vaše výhra "${prizeName}" byla předána.`;
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

      const winnerInfo: Record<string, { user_email: string; contest_title: string; contest_id: string; ticket_number: number | null; type: string; prize_description: string }> = {};
      for (const winnerId of [...new Set(historyEntries.map(h => h.winner_id))]) {
        const winner = winners.find(w => w.id === winnerId);
        if (winner) {
          winnerInfo[winnerId] = { user_email: winner.user_email, contest_title: winner.contest_title, contest_id: winner.contest_id, ticket_number: winner.ticket_number, type: winner.type, prize_description: winner.prize_description };
        }
      }

      const headers = ['Datum', 'Uživatel', 'Soutěž', 'ID soutěže', 'Ticket #', 'Cena', 'Starý stav', 'Nový stav', 'Změnil admin'];
      const rows = historyEntries.map(entry => {
        const info = winnerInfo[entry.winner_id] || { user_email: 'Neznámý', contest_title: 'Neznámá', contest_id: '', ticket_number: null, type: '', prize_description: 'Neznámá' };
        return [
          new Date(entry.created_at).toLocaleString('cs-CZ'),
          info.user_email, info.contest_title, info.contest_id,
          info.ticket_number ? `#${info.ticket_number}` : (info.type === 'main' ? 'Hlavní' : ''),
          info.prize_description,
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
    // Check if delivered
    if (winner.status === 'delivered') return 'doručeno';
    // Check shipped
    if (winner.status === 'shipped' || winner.status === 'připraveno k odeslání') return 'odesláno';
    // Default
    return 'čeká';
  };

  const exportWinnersToCsv = () => {
    if (filteredWinners.length === 0) {
      toast({ title: "Info", description: "Žádné výhry k exportu." });
      return;
    }

    // Columns: Email, First name, Last name, Phone, Address, Contest name, Contest ID, Ticket #, Prize type, Prize description, Status, Win date
    const headers = ['Email', 'Jméno', 'Příjmení', 'Telefon', 'Adresa', 'Soutěž', 'ID soutěže', 'Ticket #', 'Typ výhry', 'Popis ceny', 'Stav', 'Datum výhry'];
    const rows = filteredWinners.map(winner => [
      winner.user_email,
      winner.user_address.first_name || '',
      winner.user_address.last_name || '',
      winner.user_address.phone || '',
      winner.user_address.address || '',
      winner.contest_title,
      winner.contest_id,
      winner.ticket_number ? `#${winner.ticket_number}` : (winner.type === 'main' ? 'Hlavní' : ''),
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

      const oldStatus = winner.status || 'pending';

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

  // Bulk status update for selected physical rewards
  const updateBulkWinnerStatus = async (newStatus: string) => {
    // Get selected physical winners only (exclude auto-credited MioCoin)
    const selectedPhysicalWinners = winners.filter(
      w => selectedWinners.has(w.id) && !isAutoCreditBonus(w)
    );

    if (selectedPhysicalWinners.length === 0) {
      toast({
        title: "Žádné fyzické výhry",
        description: "Vyberte alespoň jednu fyzickou výhru pro hromadnou změnu.",
        variant: "destructive"
      });
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const winner of selectedPhysicalWinners) {
        const oldStatus = winner.status || 'pending';

        // Update status in database
        const { error: updateError } = await supabase
          .from('winners')
          .update({ status: newStatus })
          .eq('id', winner.id);

        if (updateError) {
          console.error('Error updating winner:', winner.id, updateError);
          errorCount++;
          continue;
        }

        // Log status change to history
        await supabase
          .from('winner_status_history')
          .insert({
            winner_id: winner.id,
            old_status: oldStatus,
            new_status: newStatus,
            changed_by: user?.id || null
          });

        // Send message to user
        const messageContent = getStatusMessage(newStatus, winner.prize_description);
        await supabase
          .from('messages')
          .insert({
            user_id: winner.user_id,
            sender: 'admin',
            content: messageContent,
            read: false,
            topic: 'prize_status',
            event: 'prize_status_change',
            payload: {
              winner_id: winner.id,
              prize_description: winner.prize_description,
              new_status: newStatus,
              contest_title: winner.contest_title
            }
          });

        successCount++;
      }

      // Update local state for all successful updates
      setWinners(prev => prev.map(w => 
        selectedWinners.has(w.id) && !isAutoCreditBonus(w)
          ? { ...w, status: newStatus, updated_at: new Date().toISOString() }
          : w
      ));

      // Clear history cache for updated winners
      setHistoryData(prev => {
        const newData = { ...prev };
        selectedPhysicalWinners.forEach(w => delete newData[w.id]);
        return newData;
      });

      // Clear selection
      setSelectedWinners(new Set());

      if (errorCount > 0) {
        toast({
          title: "Částečně dokončeno",
          description: `Aktualizováno ${successCount} výher, ${errorCount} selhalo.`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Hromadná aktualizace dokončena",
          description: `Stav ${successCount} výher byl úspěšně změněn.`,
        });
      }
    } catch (error) {
      console.error('Error in bulk update:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se provést hromadnou aktualizaci.",
        variant: "destructive"
      });
    }
  };

  // Get count of selected physical rewards (not auto-credited)
  const selectedPhysicalCount = [...selectedWinners].filter(
    id => {
      const w = winners.find(win => win.id === id);
      return w && !isAutoCreditBonus(w);
    }
  ).length;

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (!session || !isAdmin) {
    return <NavigateToLogin />;
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Načítám výhry...</p>
        </div>
      </div>
    );
  }

  return (
    <>
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

              {/* Bulk action bar - shown when items are selected */}
              {selectedWinners.size > 0 && (
                <div className="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="bg-primary/20 text-primary">
                      {selectedWinners.size} vybráno
                    </Badge>
                    {selectedPhysicalCount < selectedWinners.size && (
                      <span className="text-xs text-muted-foreground">
                        ({selectedPhysicalCount} fyzických výher)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground mr-2">Hromadná změna stavu:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateBulkWinnerStatus('shipped')}
                      disabled={selectedPhysicalCount === 0}
                      className="gap-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                    >
                      <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                      Odesláno
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateBulkWinnerStatus('připraveno k odeslání')}
                      disabled={selectedPhysicalCount === 0}
                      className="gap-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      Připraveno
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateBulkWinnerStatus('delivered')}
                      disabled={selectedPhysicalCount === 0}
                      className="gap-1 border-green-500/50 text-green-400 hover:bg-green-500/10"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                      Předáno
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateBulkWinnerStatus('delivered')}
                      disabled={selectedPhysicalCount === 0}
                      className="gap-1 border-green-500/50 text-green-400 hover:bg-green-500/10"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                      Předáno
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedWinners(new Set())}
                      className="ml-2"
                    >
                      <X className="h-4 w-4" />
                      Zrušit výběr
                    </Button>
                  </div>
                </div>
              )}
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
                        <TableHead>Soutěž / Tiket</TableHead>
                        <TableHead>Cena</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Stav doručení</TableHead>
                        <TableHead>Historie</TableHead>
                        <TableHead className="w-32">Ověřeno adminem</TableHead>
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
                                <AvatarImage src={winner.user_avatar || undefined} alt={winner.user_nickname ?? winner.user_email} />
                                <AvatarFallback className="bg-muted text-xs">
                                  {(winner.user_nickname ?? winner.user_email)?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium" title={winner.user_email}>
                                Výherce: {winner.user_nickname ?? winner.user_email}
                              </span>
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
                          {/* Contest + ticket_number + contest_id */}
                          <TableCell>
                            <div className="space-y-1 min-w-[160px]">
                              <div className="font-medium text-sm leading-tight">{winner.contest_title}</div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 font-mono border-orange-500/30 text-orange-400"
                                >
                                  {winner.ticket_number ? `#${winner.ticket_number.toLocaleString('cs-CZ')}` : '—'}
                                </Badge>
                                <span
                                  className="text-[10px] font-mono text-muted-foreground/60"
                                  title={winner.contest_id}
                                >
                                  {winner.contest_id.slice(0, 8)}…
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          {/* Prize description */}
                          <TableCell>
                            <div className="space-y-1">
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
                              {isSuperAdmin && winner.internal_notes && (
                                <div className="max-w-[220px] rounded border border-border/50 bg-muted/40 p-2 text-xs">
                                  <span className="font-medium">Interní poznámka: </span>
                                  <span className="whitespace-pre-wrap text-muted-foreground">
                                    {winner.internal_notes}
                                  </span>
                                </div>
                              )}
                            </div>
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
                                    <div 
                                      ref={historyPopupRef}
                                      className="absolute z-10 top-full left-0 mt-1 w-80 bg-popover border rounded-md shadow-lg p-2 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <div className="font-medium mb-1 text-foreground">Historie změn stavu</div>
                                      <div className="text-muted-foreground mb-2 text-[10px] border-b border-border/30 pb-2">
                                        {winner.ticket_number ? `Ticket #${winner.ticket_number}` : (winner.type === 'main' ? 'Hlavní výhra' : 'Bonus')} · {winner.contest_title} <span className="opacity-60">({winner.contest_id.slice(0, 8)})</span>
                                      </div>
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
                          {/* ── verified_by_admin (stored in audit_logs) ── */}
                          <TableCell>
                            {(() => {
                              const vInfo = verifications[winner.id];
                              const isVerified = vInfo?.verified ?? false;
                              const isLoading = verifyingId === winner.id;

                              return (
                                <div className="flex flex-col gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isLoading}
                                    onClick={() => toggleVerification(winner)}
                                    className={`h-7 px-2 gap-1.5 text-xs font-medium rounded-md border transition-colors ${
                                      isVerified
                                        ? 'border-green-500/40 text-green-400 bg-green-500/10 hover:bg-green-500/20'
                                        : 'border-white/10 text-muted-foreground hover:bg-white/5'
                                    }`}
                                    title={
                                      isVerified
                                        ? `Ověřeno: ${vInfo?.admin_email ?? vInfo?.admin_id ?? 'admin'} • ${
                                            vInfo?.verified_at
                                              ? new Date(vInfo.verified_at).toLocaleString('cs-CZ')
                                              : ''
                                          }`
                                        : 'Kliknutím ověřit výhru'
                                    }
                                  >
                                    {isLoading ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : isVerified ? (
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                    ) : (
                                      <ShieldOff className="h-3.5 w-3.5" />
                                    )}
                                    {isVerified ? 'Ověřeno' : 'Neověřeno'}
                                  </Button>
                                  {isVerified && vInfo?.verified_at && (
                                    <span className="text-[9px] text-muted-foreground/60 leading-tight">
                                      {new Date(vInfo.verified_at).toLocaleString('cs-CZ', {
                                        day: '2-digit', month: '2-digit', year: '2-digit',
                                        hour: '2-digit', minute: '2-digit',
                                      })}
                                    </span>
                                  )}
                                  {isVerified && vInfo?.admin_email && (
                                    <span className="text-[9px] text-muted-foreground/60 leading-tight truncate max-w-[110px]">
                                      {vInfo.admin_email}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>

                          <TableCell>
                            {isAutoCreditBonus(winner) ? (
                              <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
                                Automaticky připsáno
                              </Badge>
                            ) : (
                              <Select
                                value={winner.status || 'pending'}
                                onValueChange={(value) => updateWinnerStatus(winner.id, value)}
                              >
                                <SelectTrigger className={`w-48 ${getStatusColor(winner.status).trigger}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                      Čeká
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="připraveno k odeslání">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                      Připraveno k odeslání
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="shipped">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                                      Odesláno
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="delivered">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                      Předáno
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
    </>
  );
};

export default AdminWinners;
