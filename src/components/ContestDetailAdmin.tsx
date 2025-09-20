import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { ArrowLeft, Loader2, Save, Trophy, Gift, Ticket } from 'lucide-react';

interface ContestDetail {
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
  description: string;
  ticket_position: number;
  status: string;
  amount?: number;
}

interface Ticket {
  id: string;
  number: number;
  user_id: string;
  created_at: string;
}

const ContestDetailAdmin: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    if (contestId) {
      fetchContestDetail();
      fetchBonusPrizes();
      fetchTickets();
    }
  }, [contestId]);

  const fetchContestDetail = async () => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .select(`
          id, title, description, main_prize, main_image, status, 
          ticket_count, ticket_price, created_at
        `);
      
      if (error) throw error;
      
      const contestData = data?.find((c: any) => c.id === contestId);
      if (contestData) {
        // Fetch tickets played count
        const { count: ticketsPlayed } = await supabase
          .from('tickets')
          .select('*', { count: 'exact', head: true })
          .eq('contest_id', contestId);
        
        // Fetch bonus tickets positions
        const { data: bonusPrizes } = await supabase
          .from('bonus_prizes')
          .select('ticket_position')
          .eq('contest_id', contestId)
          .order('ticket_position', { ascending: true });
        
        const contestWithExtras = {
          ...contestData,
          tickets_played: ticketsPlayed || 0,
          total_tickets: contestData.ticket_count,
          main_prize_ticket: contestData.ticket_count, // Assuming last ticket wins
          bonus_tickets: (bonusPrizes || []).map(bp => bp.ticket_position).slice(0, 50)
        };
        
        setContest(contestWithExtras);
        setNotes(contestWithExtras.description || '');
      }
    } catch (error) {
      console.error('Error fetching contest detail:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst detail soutěže.",
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
        .select('*')
        .eq('contest_id', contestId)
        .order('ticket_position', { ascending: true });

      if (error) throw error;
      setBonusPrizes(data || []);
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
    }
  };

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('contest_id', contestId)
        .order('number', { ascending: true });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const saveNotes = async () => {
    try {
      setSavingNotes(true);
      
      // For now, we'll store notes in contest description field
      // In a real implementation, you might want a separate notes field
      const { error } = await supabase
        .from('contests')
        .update({ description: notes })
        .eq('id', contestId);

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
    } finally {
      setSavingNotes(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'closed': return 'secondary';
      case 'pending': return 'outline';
      default: return 'outline';
    }
  };

  const getBonusStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'won': return 'default';
      case 'pending': return 'outline';
      case 'delivered': return 'secondary';
      default: return 'outline';
    }
  };

  // Pagination for tickets
  const paginatedTickets = tickets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(tickets.length / itemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pb-20">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span className="text-lg">Načítání detailu soutěže...</span>
          </div>
        </main>
        <AdminMenu />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pb-20">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Soutěž nenalezena</h2>
            <Button onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zpět na dashboard
            </Button>
          </div>
        </main>
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 pb-20">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{contest.title}</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={getStatusBadgeVariant(contest.status)}>
                  {contest.status}
                </Badge>
                <span className="text-muted-foreground">
                  Cena tiketu: {contest.ticket_price} Miocoin
                </span>
              </div>
            </div>
          </div>

          {/* Contest Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Prodané tikety</p>
                    <p className="text-2xl font-bold">
                      {contest.tickets_played.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Celkem tiketů</p>
                    <p className="text-2xl font-bold">
                      {contest.total_tickets.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Hlavní cena</p>
                    <p className="text-lg font-semibold">
                      #{contest.main_prize_ticket || 'TBD'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Bonusové ceny</p>
                    <p className="text-2xl font-bold">{contest.bonus_tickets.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Prize Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Hlavní cena
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Popis ceny</h3>
                  <p className="text-muted-foreground">{contest.main_prize}</p>
                  
                  <h3 className="font-semibold mt-4 mb-2">Popis soutěže</h3>
                  <p className="text-muted-foreground">{contest.description}</p>
                </div>
                {contest.main_image && (
                  <div>
                    <h3 className="font-semibold mb-2">Obrázek</h3>
                    <img 
                      src={contest.main_image} 
                      alt={contest.title}
                      className="w-full max-w-md rounded-lg border"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bonus Prizes */}
          {bonusPrizes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Bonusové ceny
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pozice tiketu</TableHead>
                      <TableHead>Popis</TableHead>
                      <TableHead>Množství</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bonusPrizes.map((bonus) => (
                      <TableRow key={bonus.id}>
                        <TableCell className="font-mono">
                          #{bonus.ticket_position}
                        </TableCell>
                        <TableCell>{bonus.description}</TableCell>
                        <TableCell>
                          {bonus.amount ? `${bonus.amount} Miocoin` : 'Fyzická cena'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getBonusStatusBadgeVariant(bonus.status)}>
                            {bonus.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Tickets List */}
          <Card>
            <CardHeader>
              <CardTitle>Seznam tiketů</CardTitle>
              <CardDescription>
                Celkem {tickets.length} prodaných tiketů
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Číslo tiketu</TableHead>
                    <TableHead>ID uživatele</TableHead>
                    <TableHead>Datum nákupu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-mono">#{ticket.number}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {ticket.user_id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {new Date(ticket.created_at).toLocaleString('cs-CZ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Předchozí
                  </Button>
                  <span className="flex items-center px-3 text-sm">
                    Strana {currentPage} z {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Další
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Poznámky administrátora</CardTitle>
              <CardDescription>
                Interní poznámky k této soutěži
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notes">Poznámky</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Zde můžete přidat poznámky k této soutěži..."
                  rows={4}
                />
              </div>
              <Button 
                onClick={saveNotes} 
                disabled={savingNotes}
                className="flex items-center gap-2"
              >
                {savingNotes ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Uložit poznámky
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <AdminMenu />
    </div>
  );
};

export default ContestDetailAdmin;