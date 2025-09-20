import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Gift, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';

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
}

interface Ticket {
  id: string;
  number: number;
  user_id: string;
  created_at: string;
}

const ContestDetailAdmin: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { user } = useAuth();
  const [contest, setContest] = useState<ContestData | null>(null);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 50;

  useEffect(() => {
    if (contestId) {
      fetchContestData();
      fetchBonusPrizes();
      fetchTickets();
    }
  }, [contestId]);

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
        .select('id, contest_id, description, ticket_position, amount, status')
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

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, number, user_id, created_at')
        .eq('contest_id', contestId)
        .order('number', { ascending: true });

      if (error) throw error;
      setTickets(data || []);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-8">Načítání...</div>
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-8">Soutěž nebyla nalezena.</div>
        </div>
      </div>
    );
  }

  const paginatedTickets = tickets.slice(
    (currentPage - 1) * ticketsPerPage,
    currentPage * ticketsPerPage
  );

  const totalPages = Math.ceil(tickets.length / ticketsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/admin">
            <Button variant="outline" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zpět na dashboard
            </Button>
          </Link>
        </div>

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

        {/* Bonus Prizes */}
        {bonusPrizes.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Bonusové ceny ({bonusPrizes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pozice tiketu</TableHead>
                    <TableHead>Popis</TableHead>
                    <TableHead>Hodnota</TableHead>
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
                        <Badge variant={getStatusBadge(prize.status).variant}>
                          {getStatusBadge(prize.status).label}
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
            <CardTitle>Seznam tiketů ({tickets.length})</CardTitle>
            <CardDescription>
              Všechny prodané tikety pro tuto soutěž
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
    </div>
  );
};

export default ContestDetailAdmin;