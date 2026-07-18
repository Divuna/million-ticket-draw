console.log('ContestDetailAdmin module loading');
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Gift, Trophy, Plus, Loader2, X, BarChart2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { TicketProgressBar } from '@/components/TicketProgressBar';


interface ContestData {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  main_image: string;
  status: string;
  tickets_played: number;
  total_tickets: number;
  main_prize_ticket: number | null;
  bonus_tickets: number[];
  created_at: string;
  ticket_price: number;
}

interface BonusPrize {
  id: string;
  contest_id: string;
  description: string;
  ticket_position: number;
  status: string;
  amount?: number;
  guardian_required?: boolean;
}

interface Ticket {
  id: string;
  number: number;
  user_id: string;
  created_at: string;
}

interface NewBonusPrizeForm {
  description: string;
  ticket_position: number;
  amount: number;
}

interface ProgressStats {
  tickets_total: number;
  tickets_sold: number;
  tickets_remaining: number;
  sold_percent: number;
  tickets_last_24h: number;
  estimated_revenue: number;
}

interface ContestProgressAdminRow {
  tickets_total: number | null;
  tickets_sold: number | null;
  tickets_remaining: number | null;
  sold_percent: number | null;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Koncept" },
  { value: "pending", label: "Čeká na start" },
  { value: "active", label: "Aktivní" },
  { value: "paused", label: "Pozastaveno" },
];

const STATUS_OPTIONS_WITH_CLOSED = [
  ...STATUS_OPTIONS,
  { value: "closed", label: "Ukončeno" },
];

const ContestDetailAdmin: React.FC = () => {
  console.log('ContestDetailAdmin component is loading');
  const { contestId } = useParams<{ contestId: string }>();
  const { user, loading: authLoading } = useAuth();
  // Admin contest detail (raw tickets, bonus positions, progress, winner setup,
  // close) is superadmin-only sensitive contest internals.
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [contest, setContest] = useState<ContestData | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketCount, setTicketCount] = useState(0);
  const [progressStats, setProgressStats] = useState<ProgressStats | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 50;

  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Close contest state
  const [closingContest, setClosingContest] = useState(false);

  // Bonus prize form state
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusForm, setBonusForm] = useState<NewBonusPrizeForm>({
    description: '',
    ticket_position: 1,
    amount: 0,
  });
  const [savingBonus, setSavingBonus] = useState(false);

  // Fetch aggregated progress — never loads individual ticket rows
  const fetchProgressStats = useCallback(async () => {
    if (!contestId) return;
    try {
      const [{ data: prog }, { data: rev }, { data: act }] = await Promise.all([
        supabase
          .rpc('get_contest_progress_admin', { p_contest_ids: [contestId] }),
        supabase
          .from('contest_revenue')
          .select('estimated_revenue')
          .eq('contest_id', contestId)
          .maybeSingle(),
        supabase
          .from('contest_activity_last_24h')
          .select('tickets_last_24h')
          .eq('contest_id', contestId)
          .maybeSingle(),
      ]);
      const progressRow = ((prog || []) as ContestProgressAdminRow[])[0];
      setProgressStats({
        tickets_total:     progressRow?.tickets_total     ?? 1_000_000,
        tickets_sold:      progressRow?.tickets_sold      ?? 0,
        tickets_remaining: progressRow?.tickets_remaining ?? 1_000_000,
        sold_percent:      progressRow?.sold_percent      ?? 0,
        tickets_last_24h:  act?.tickets_last_24h   ?? 0,
        estimated_revenue: rev?.estimated_revenue  ?? 0,
      });
    } catch (err) {
      console.error('Error fetching progress stats:', err);
    }
  }, [contestId]);

  useEffect(() => {
    if (!contestId || authLoading || roleLoading || !user || !isSuperAdmin) {
      return;
    }

    fetchContestData();
    fetchBonusPrizes();
    fetchProgressStats();
    fetchTickets(1);

    // Setup realtime subscriptions for this specific contest
    const bonusChannel = supabase
      .channel(`contest-detail-bonus-${contestId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bonus_prizes',
        filter: `contest_id=eq.${contestId}`
      }, (payload) => {
        console.log('Contest detail bonus change:', payload);
        fetchBonusPrizes();

        let message = '';
        if (payload.eventType === 'INSERT' && payload.new && 'ticket_position' in payload.new) {
          message = `Nová bonusová cena přidána na pozici #${payload.new.ticket_position}`;
        } else if (payload.eventType === 'UPDATE' && payload.new && 'ticket_position' in payload.new) {
          message = `Bonusová cena aktualizována na pozici #${payload.new.ticket_position}`;
        } else if (payload.eventType === 'DELETE' && payload.old && 'ticket_position' in payload.old) {
          message = `Bonusová cena odstraněna z pozice #${payload.old.ticket_position}`;
        }

        if (message) {
          toast({
            title: "Změna bonusové ceny",
            description: message,
          });
        }
      })
      .subscribe();

    const ticketsChannel = supabase
      .channel(`contest-detail-tickets-${contestId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `contest_id=eq.${contestId}`
      }, (payload) => {
        console.log('Contest detail ticket change:', payload);
        fetchTickets(currentPage);
        fetchContestData();
        fetchProgressStats();

        if (payload.eventType === 'INSERT' && payload.new && 'number' in payload.new) {
          toast({
            title: "Nový tiket",
            description: `Tiket #${payload.new.number} byl zakoupen`,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(bonusChannel);
      supabase.removeChannel(ticketsChannel);
    };
  }, [contestId, user, isSuperAdmin, authLoading, roleLoading]);

  const fetchContestData = async () => {
    try {
      const { data, error } = await supabase.rpc('get_contests_json');
      
      if (error) throw error;
      
      const contestsData = Array.isArray(data) ? data : [];
      const foundContest = contestsData.find((c: any) => c.id === contestId);
      
      if (foundContest) {
        setContest(foundContest as unknown as ContestData);
        setNotes((foundContest as any).description || '');
      }
    } catch (error) {
      console.error('Error fetching contest:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst data soutěže.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBonusPrizes = async () => {
    try {
      const { data, error } = await supabase
        .from('bonus_prizes')
        .select('id, contest_id, description, ticket_position, amount, status, guardian_required')
        .eq('contest_id', contestId)
        .order('ticket_position', { ascending: true });

      if (error) throw error;
      setBonusPrizes(data || []);
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst bonusové ceny.",
        variant: "destructive"
      });
    }
  };

  /**
   * Server-side paginated ticket fetch.
   * Only a single page of rows (≤ 50) is ever loaded to the client.
   * The total count is obtained via a separate aggregated count query.
   */
  const fetchTickets = async (page: number) => {
    if (!contestId) return;
    try {
      const from = (page - 1) * ticketsPerPage;
      const to = from + ticketsPerPage - 1;

      const [{ count }, { data, error }] = await Promise.all([
        supabase
          .from('tickets')
          .select('*', { count: 'exact', head: true })
          .eq('contest_id', contestId),
        supabase
          .from('tickets')
          .select('id, number, user_id, created_at')
          .eq('contest_id', contestId)
          .order('number', { ascending: true })
          .range(from, to),
      ]);

      if (error) throw error;
      setTickets(data || []);
      setTicketCount(count ?? 0);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst tikety.",
        variant: "destructive"
      });
    }
  };

  const saveNotes = async () => {
    if (!contestId) return;

    try {
      const { error } = await supabase.rpc('admin_manage_contest', {
        p_operation: 'update',
        p_contest_id: contestId,
        p_description: notes,
      });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Poznámky byly uloženy."
      });
    } catch (error) {
      console.error('Error saving notes:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se uložit poznámky.",
        variant: "destructive"
      });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!contestId) return;

    if (newStatus === "closed") {
      toast({
        title: "Akce zamítnuta",
        description: "Soutěž lze uzavřít pouze automaticky systémem.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingStatus(true);

    try {
      const { error } = await supabase.rpc("admin_manage_contest", {
        p_operation: "update",
        p_contest_id: contestId,
        p_status: newStatus,
      });

      if (error) throw error;

      toast({
        title: "Status aktualizován",
        description: `Status soutěže byl změněn na "${newStatus}".`,
      });

      // Update local state
      setContest((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch (err: any) {
      console.error("Error updating contest status:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se změnit status soutěže.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCloseContest = async () => {
    if (!contestId) return;

    if (!confirm("Opravdu chcete uzavřít tuto soutěž? Tato akce nelze vrátit.")) {
      return;
    }

    setClosingContest(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error("Nejste přihlášeni.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/close-contest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ contest_id: contestId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se uzavřít soutěž.");
      }

      toast({
        title: "Soutěž uzavřena",
        description: result.message || "Soutěž byla úspěšně uzavřena a vítěz byl určen.",
      });

      // Update local state
      setContest((prev) => prev ? { ...prev, status: 'closed' } : prev);
    } catch (err: any) {
      console.error("Error closing contest:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se uzavřít soutěž.",
        variant: "destructive",
      });
    } finally {
      setClosingContest(false);
    }
  };

  const handleAddBonusPrize = async () => {
    if (!contestId) return;

    if (!bonusForm.description || bonusForm.ticket_position < 1) {
      toast({
        title: "Chyba",
        description: "Vyplň popis a platnou pozici tiketu.",
        variant: "destructive",
      });
      return;
    }

    setSavingBonus(true);

    try {
      const { error } = await supabase.rpc("admin_manage_bonus_prize", {
        p_operation: "create",
        p_contest_id: contestId,
        p_description: bonusForm.description,
        p_ticket_position: bonusForm.ticket_position,
        p_amount: bonusForm.amount > 0 ? bonusForm.amount : null,
      });

      if (error) throw error;

      toast({
        title: "Bonusová cena přidána",
        description: `Bonusová cena byla přidána na pozici #${bonusForm.ticket_position}.`,
      });

      // Reset form
      setBonusForm({
        description: '',
        ticket_position: 1,
        amount: 0,
      });
      setShowBonusForm(false);

      // Refresh bonus prizes
      await fetchBonusPrizes();
    } catch (err: any) {
      console.error("Error adding bonus prize:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se přidat bonusovou cenu.",
        variant: "destructive",
      });
    } finally {
      setSavingBonus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      'pending': { label: 'Čeká', variant: 'secondary' },
      'won': { label: 'Vyhrál', variant: 'default' },
      'delivered': { label: 'Doručeno', variant: 'outline' }
    };

    return statusMap[status] || { label: status, variant: 'outline' };
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (authLoading) {
    return null;
  }

  if (!user || !isAdmin) {
    return <NavigateToLogin />;
  }

  // Scoped subadmins are valid admins but must not see sensitive contest internals.
  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-muted-foreground">
        Tato část je dostupná pouze superadminovi.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg">
        <div className="text-center py-8">Načítání...</div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="container mx-auto px-4 py-8 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg">
        <div className="text-center py-8">Soutěž nebyla nalezena.</div>
      </div>
    );
  }

  // Server-side pagination: `tickets` already holds exactly the current page
  const paginatedTickets = tickets;
  const totalPages = Math.ceil(ticketCount / ticketsPerPage);

  return (
    <div className="container mx-auto px-4 py-8 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg">
        <div className="mb-6">
          <Link to="/admin">
            <Button variant="outline" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zpět na dashboard
            </Button>
          </Link>
        </div>

        {/* Status Control Bar */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Label className="font-medium">Status soutěže:</Label>
                <Select
                  value={contest.status}
                  onValueChange={handleStatusChange}
                  disabled={updatingStatus}
                >
                  <SelectTrigger className="w-32 bg-background">
                    {updatingStatus ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700 z-50">
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem 
                        key={option.value} 
                        value={option.value}
                        className="text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:text-white cursor-pointer"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {contest.status === "active" && (
                <Button
                  variant="destructive"
                  onClick={handleCloseContest}
                  disabled={closingContest}
                >
                  {closingContest ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <X className="h-4 w-4 mr-2" />
                  )}
                  Uzavřít soutěž
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Contest Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Detail soutěže
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold mb-2">{contest.title}</h2>
                <Badge variant={contest.status === 'active' ? 'default' : 'secondary'}>
                  {contest.status}
                </Badge>
              </div>
              
              {contest.main_image && (
                <div className="aspect-video rounded-lg overflow-hidden">
                  <img 
                    src={contest.main_image} 
                    alt={contest.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Hlavní cena:</span>
                  <p className="text-muted-foreground">{contest.main_prize}</p>
                </div>
                <div>
                  <span className="font-medium">Cena tiketu:</span>
                  <p className="text-muted-foreground">{contest.ticket_price} Miocoin</p>
                </div>
                <div>
                  <span className="font-medium">Celkem tiketů:</span>
                  <p className="text-muted-foreground">{contest.total_tickets.toLocaleString()}</p>
                </div>
                <div>
                  <span className="font-medium">Prodáno:</span>
                  <p className="text-muted-foreground">{contest.tickets_played.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle>Poznámky (editovatelné)</CardTitle>
              <CardDescription>
                Poznámky k soutěži - pouze pro adminy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Přidejte poznámky k této soutěži..."
                rows={6}
              />
              <Button onClick={saveNotes} className="w-full">
                Uložit poznámky
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Ticket Progress Visualisation */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Průběh prodeje tiketů
            </CardTitle>
            <CardDescription>
              Agregovaný přehled — tikety 1 → 1 000 000, pozice bonusů, aktivita za posledních 24 h
            </CardDescription>
          </CardHeader>
          <CardContent>
            {progressStats ? (
              <TicketProgressBar
                ticketsTotal={progressStats.tickets_total}
                ticketsSold={progressStats.tickets_sold}
                soldPercent={progressStats.sold_percent}
                bonusPositions={bonusPrizes.map((b) => b.ticket_position)}
                ticketsLast24h={progressStats.tickets_last_24h}
                estimatedRevenue={progressStats.estimated_revenue}
              />
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">Načítání statistik…</div>
            )}
          </CardContent>
        </Card>

        {/* Bonus Prizes */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Bonusové ceny ({bonusPrizes.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBonusForm(!showBonusForm)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Přidat bonusovou výhru
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Add Bonus Prize Form */}
            {showBonusForm && (
              <Card className="mb-4 bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label>Popis</Label>
                      <Input
                        value={bonusForm.description}
                        onChange={(e) => setBonusForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Např. 100 MioCoinů"
                      />
                    </div>
                    <div>
                      <Label>Pozice tiketu</Label>
                      <Input
                        type="number"
                        min={1}
                        value={bonusForm.ticket_position}
                        onChange={(e) => setBonusForm(prev => ({ ...prev, ticket_position: Number(e.target.value) || 1 }))}
                      />
                    </div>
                    <div>
                      <Label>Hodnota MioCoinů (0 = fyzická cena)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={bonusForm.amount}
                        onChange={(e) => setBonusForm(prev => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        onClick={handleAddBonusPrize}
                        disabled={savingBonus}
                        className="flex-1"
                      >
                        {savingBonus ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Přidat"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowBonusForm(false)}
                      >
                        Zrušit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {bonusPrizes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Žádné bonusové ceny nebyly zatím přidány.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pozice tiketu</TableHead>
                    <TableHead>Popis</TableHead>
                    <TableHead>Hodnota</TableHead>
                    <TableHead>Převzetí</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bonusPrizes.map((prize) => (
                    <TableRow key={prize.id}>
                      <TableCell className="font-medium">#{prize.ticket_position}</TableCell>
                      <TableCell>{prize.description}</TableCell>
                      <TableCell>
                        {prize.amount ? `${prize.amount} Miocoin` : 'Fyzická cena'}
                      </TableCell>
                      <TableCell>
                        {!prize.amount && prize.guardian_required ? (
                          <span className="text-amber-500 text-sm">⚠ Zákonný zástupce</span>
                        ) : !prize.amount ? (
                          <span className="text-green-500 text-sm">✓ 15+ bez doprovodu</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(prize.status).variant}>
                          {getStatusBadge(prize.status).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Tickets List — server-side paginated, never loads all rows */}
        <Card>
          <CardHeader>
            <CardTitle>Seznam tiketů ({ticketCount.toLocaleString('cs-CZ')})</CardTitle>
            <CardDescription>
              Prodané tikety — stránkování na serveru, zobrazuje se {ticketsPerPage} záznamů najednou
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ticketCount === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Žádné tikety nebyly zatím prodány.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Číslo tiketu</TableHead>
                      <TableHead>Uživatel ID</TableHead>
                      <TableHead>Datum nákupu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">#{ticket.number}</TableCell>
                        <TableCell className="font-mono text-sm">{ticket.user_id}</TableCell>
                        <TableCell>
                          {new Date(ticket.created_at).toLocaleString('cs-CZ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Server-side pagination controls */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchTickets(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Předchozí
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Stránka {currentPage} z {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchTickets(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Další
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
    </div>
  );
};

console.log('Exporting ContestDetailAdmin component');
export default ContestDetailAdmin;
