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
import { ImageOff, X, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

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
  contest_title: string;
  prize_description: string;
  prize_image: string | null;
  user_address: UserAddress;
}

const AdminWinners: React.FC = () => {
  const { user, session } = useAuth();
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [filteredWinners, setFilteredWinners] = useState<WinnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
          users!inner(email, first_name, last_name, address, phone),
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

        const userData = winner.users as any;

        processedWinners.push({
          id: winner.id,
          user_id: winner.user_id,
          contest_id: winner.contest_id,
          prize_id: winner.prize_id,
          type: winner.type as 'main' | 'bonus',
          status: null,
          created_at: winner.created_at,
          updated_at: null,
          user_email: userData?.email || 'Neznámý uživatel',
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

  const updateWinnerStatus = async (winnerId: string, newStatus: string) => {
    try {
      // Find the winner to get user_id and prize info
      const winner = winners.find(w => w.id === winnerId);
      if (!winner) {
        throw new Error('Winner not found');
      }

      // Send message to user about status change
      const messageContent = getStatusMessage(newStatus, winner.prize_description);
      
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          user_id: winner.user_id,
          sender: 'Admin',
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
      }
      
      // Update local state
      setWinners(prev => prev.map(w => 
        w.id === winnerId 
          ? { ...w, status: newStatus, updated_at: new Date().toISOString() }
          : w
      ));

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
                        <TableHead>Adresa</TableHead>
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
                          <TableCell className="font-medium">
                            {winner.user_email}
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