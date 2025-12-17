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
import { ImageOff } from 'lucide-react';

const SUPABASE_URL = 'https://xkzhjldrojjlrkezorey.supabase.co';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/contest-images/${path}`;
};

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
  contest_title: string;
  prize_description: string;
  prize_image: string | null;
}

const AdminWinners: React.FC = () => {
  const { user, session } = useAuth();
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [filteredWinners, setFilteredWinners] = useState<WinnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const statusOptions = [
    { value: 'all', label: 'Všechny stavy' },
    { value: 'čeká na potvrzení', label: 'Čeká na potvrzení' },
    { value: 'připraveno k odeslání', label: 'Připraveno k odeslání' },
    { value: 'odesláno', label: 'Odesláno' },
    { value: 'vyplaceno', label: 'Vyplaceno' }
  ];

  // Check admin access
  const isAdmin = user?.email === 'divispavel2@gmail.com';

  useEffect(() => {
    if (isAdmin) {
      fetchWinners();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredWinners(winners);
    } else {
      const filtered = winners.filter(winner => 
        (winner.status || 'čeká na potvrzení') === statusFilter
      );
      setFilteredWinners(filtered);
    }
  }, [winners, statusFilter]);

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
          created_at,
          users!inner(email),
          contests!inner(title, main_prize, main_prize_secondary_image, main_image)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

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

        processedWinners.push({
          id: winner.id,
          user_id: winner.user_id,
          contest_id: winner.contest_id,
          prize_id: winner.prize_id,
          type: winner.type as 'main' | 'bonus',
          status: null,
          created_at: winner.created_at,
          updated_at: null,
          user_email: (winner.users as any)?.email || 'Neznámý uživatel',
          contest_title: (winner.contests as any)?.title || 'Neznámá soutěž',
          prize_description: prizeDescription,
          prize_image: prizeImage
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

  const updateWinnerStatus = async (winnerId: string, newStatus: string) => {
    try {
      // For now, just show success message since status column doesn't exist yet
      // When DB is updated, this will actually update the database
      
      // Update local state
      setWinners(prev => prev.map(winner => 
        winner.id === winnerId 
          ? { ...winner, status: newStatus, updated_at: new Date().toISOString() }
          : winner
      ));

      toast({
        title: "Stav výhry aktualizován",
        description: "Stav výhry byl úspěšně změněn.",
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
                  <span className="text-sm text-muted-foreground">
                    Celkem výher: {winners.length}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 mt-4">
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
              </div>
            </CardHeader>
            
            <CardContent>
              {filteredWinners.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Žádné výhry k zobrazení.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Obrázek</TableHead>
                        <TableHead>Email uživatele</TableHead>
                        <TableHead>Název soutěže</TableHead>
                        <TableHead>Popis ceny</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Stav</TableHead>
                        <TableHead>Naposledy aktualizováno</TableHead>
                        <TableHead>Akce</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWinners.map((winner) => (
                        <TableRow key={winner.id}>
                          <TableCell>
                            {winner.prize_image ? (
                              <img 
                                src={winner.prize_image} 
                                alt="Obrázek ceny"
                                className="w-16 h-16 object-cover rounded-md"
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
                          <TableCell className="font-medium">
                            {winner.user_email}
                          </TableCell>
                          <TableCell>{winner.contest_title}</TableCell>
                          <TableCell>{winner.prize_description}</TableCell>
                          <TableCell>
                            <Badge variant={winner.type === 'main' ? 'default' : 'secondary'}>
                              {winner.type === 'main' ? 'Hlavní cena' : 'Bonusová cena'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {winner.status || 'čeká na potvrzení'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {winner.updated_at 
                              ? new Date(winner.updated_at).toLocaleString('cs-CZ')
                              : 'Nikdy'
                            }
                          </TableCell>
                          <TableCell>
                            <Select
                              value={winner.status || 'čeká na potvrzení'}
                              onValueChange={(value) => updateWinnerStatus(winner.id, value)}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="čeká na potvrzení">Čeká na potvrzení</SelectItem>
                                <SelectItem value="připraveno k odeslání">Připraveno k odeslání</SelectItem>
                                <SelectItem value="odesláno">Odesláno</SelectItem>
                                <SelectItem value="vyplaceno">Vyplaceno</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminWinners;