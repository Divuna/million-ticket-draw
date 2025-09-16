import React, { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  status: string;
  ticket_count: number;
  created_at: string;
}

interface BonusPrize {
  id: string;
  contest_id: string;
  description: string;
  ticket_position: number;
  status: string;
}

const AdminDashboard: React.FC = () => {
  const { user, session } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<string>('');
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Form states
  const [contestForm, setContestForm] = useState({
    title: '',
    description: '',
    main_prize: ''
  });
  const [bonusForm, setBonusForm] = useState({
    description: '',
    ticket_position: ''
  });

  useEffect(() => {
    if (user) {
      checkAdminRole();
      fetchContests();
    }
  }, [user]);

  useEffect(() => {
    if (selectedContest) {
      fetchBonusPrizes();
    }
  }, [selectedContest]);

  const checkAdminRole = async () => {
    try {
      // Temporary admin check - in production this would query the users table
      // For now, assume first user is admin for demo purposes
      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking admin role:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContests = async () => {
    try {
      // Temporary placeholder data until database schema is fully configured
      setContests([
        {
          id: '1',
          title: 'iPhone 15 Pro Giveaway',
          description: 'Win the latest iPhone 15 Pro!',
          main_prize: 'iPhone 15 Pro 256GB',
          status: 'active',
          ticket_count: 1000000,
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          title: 'MacBook Air Contest',
          description: 'Professional laptop for creative work.',
          main_prize: 'MacBook Air M2',
          status: 'draft',
          ticket_count: 1000000,
          created_at: new Date().toISOString()
        }
      ]);
    } catch (error) {
      console.error('Error fetching contests:', error);
    }
  };

  const fetchBonusPrizes = async () => {
    try {
      // Temporary placeholder data until database schema is fully configured
      if (selectedContest === '1') {
        setBonusPrizes([
          {
            id: '1',
            contest_id: '1',
            description: 'AirPods Pro',
            ticket_position: 50000,
            status: 'pending'
          },
          {
            id: '2',
            contest_id: '1',
            description: 'iPad Air',
            ticket_position: 250000,
            status: 'pending'
          }
        ]);
      } else {
        setBonusPrizes([]);
      }
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
    }
  };

  const createContest = async () => {
    if (!contestForm.title || !contestForm.main_prize) {
      toast({
        title: "Chyba",
        description: "Vyplňte povinná pole (název a hlavní cena).",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-contest', {
        body: contestForm
      });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Soutěž byla úspěšně vytvořena."
      });

      setContestForm({ title: '', description: '', main_prize: '' });
      fetchContests();

    } catch (error) {
      console.error('Error creating contest:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se vytvořit soutěž.",
        variant: "destructive"
      });
    }
  };

  const addBonusPrize = async () => {
    if (!selectedContest || !bonusForm.description || !bonusForm.ticket_position) {
      toast({
        title: "Chyba",
        description: "Vyberte soutěž a vyplňte všechna pole.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('add-bonus-prize', {
        body: {
          contest_id: selectedContest,
          description: bonusForm.description,
          ticket_position: parseInt(bonusForm.ticket_position)
        }
      });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Bonusová cena byla úspěšně přidána."
      });

      setBonusForm({ description: '', ticket_position: '' });
      fetchBonusPrizes();

    } catch (error) {
      console.error('Error adding bonus prize:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se přidat bonusovou cenu.",
        variant: "destructive"
      });
    }
  };

  const pauseResumeContest = async (contestId: string, newStatus: 'active' | 'paused') => {
    try {
      const { error } = await supabase
        .from('contests')
        .update({ status: newStatus })
        .eq('id', contestId);

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: newStatus === 'active' ? "Soutěž byla obnovena." : "Soutěž byla pozastavena."
      });

      fetchContests();

    } catch (error) {
      console.error('Error updating contest status:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se změnit stav soutěže.",
        variant: "destructive"
      });
    }
  };

  const closeContest = async (contestId: string) => {
    const pin = prompt("Zadejte PIN pro uzavření soutěže:");
    if (pin !== "1978") {
      toast({
        title: "Chyba",
        description: "Nesprávný PIN kód.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('contests')
        .update({ status: 'closed' })
        .eq('id', contestId);

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Soutěž byla uzavřena."
      });

      fetchContests();

    } catch (error) {
      console.error('Error closing contest:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se uzavřít soutěž.",
        variant: "destructive"
      });
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Přístup odepřen</h1>
            <p className="text-muted-foreground">Pro přístup k admin panelu potřebujete oprávnění administrátora.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">Administrátorský panel</h1>
            <Button asChild variant="outline">
              <Link to="/admin/winners">Správa výher</Link>
            </Button>
          </div>
          
          <Tabs defaultValue="contests" className="space-y-6">
            <TabsList>
              <TabsTrigger value="contests">Soutěže</TabsTrigger>
              <TabsTrigger value="create">Vytvořit soutěž</TabsTrigger>
              <TabsTrigger value="prizes">Bonusové ceny</TabsTrigger>
            </TabsList>

            {/* Contest List */}
            <TabsContent value="contests">
              <Card>
                <CardHeader>
                  <CardTitle>Seznam soutěží</CardTitle>
                  <CardDescription>Přehled všech soutěží a jejich správa</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {contests.map((contest) => (
                      <div key={contest.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-3">
                              <h3 className="font-semibold text-lg">{contest.title}</h3>
                              <Badge 
                                variant={
                                  contest.status === 'active' ? 'default' : 
                                  contest.status === 'paused' ? 'secondary' :
                                  contest.status === 'closed' ? 'destructive' :
                                  'outline'
                                }
                                className={
                                  contest.status === 'paused' ? 'bg-orange-500 text-white hover:bg-orange-600' : ''
                                }
                              >
                                {contest.status === 'active' ? 'Aktivní' : 
                                 contest.status === 'paused' ? 'Pozastavená' :
                                 contest.status === 'closed' ? 'Uzavřená' :
                                 contest.status === 'draft' ? 'Koncept' : 'Neznámý'}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground">{contest.description}</p>
                            <p className="text-sm">
                              <strong>Hlavní cena:</strong> {contest.main_prize}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Vytvořeno: {new Date(contest.created_at).toLocaleDateString('cs-CZ')}
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            {contest.status !== 'closed' && (
                              <>
                                {(contest.status === 'active' || contest.status === 'paused') && (
                                  <Button 
                                    variant="outline"
                                    onClick={() => pauseResumeContest(
                                      contest.id, 
                                      contest.status === 'active' ? 'paused' : 'active'
                                    )}
                                    className={contest.status === 'active' ? 'border-orange-500 text-orange-600 hover:bg-orange-50' : 'border-green-500 text-green-600 hover:bg-green-50'}
                                  >
                                    {contest.status === 'active' ? 'Pozastavit' : 'Obnovit'}
                                  </Button>
                                )}
                                <Button 
                                  variant="outline"
                                  onClick={() => closeContest(contest.id)}
                                  className="border-red-500 text-red-600 hover:bg-red-50"
                                >
                                  Uzavřít
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {contests.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        Žádné soutěže nebyly nalezeny.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Create Contest */}
            <TabsContent value="create">
              <Card>
                <CardHeader>
                  <CardTitle>Vytvořit novou soutěž</CardTitle>
                  <CardDescription>Vyplňte základní informace o soutěži</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Název soutěže *</label>
                      <Input
                        placeholder="Zadejte název soutěže"
                        value={contestForm.title}
                        onChange={(e) => setContestForm({...contestForm, title: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Hlavní cena *</label>
                      <Input
                        placeholder="Např. iPhone 15 Pro"
                        value={contestForm.main_prize}
                        onChange={(e) => setContestForm({...contestForm, main_prize: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Popis soutěže</label>
                    <Textarea
                      placeholder="Volitelný popis soutěže"
                      rows={3}
                      value={contestForm.description}
                      onChange={(e) => setContestForm({...contestForm, description: e.target.value})}
                    />
                  </div>
                  
                  <Button onClick={createContest} className="w-full md:w-auto">
                    Vytvořit soutěž
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bonus Prizes */}
            <TabsContent value="prizes">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Přidat bonusovou cenu</CardTitle>
                    <CardDescription>Přidejte bonusovou cenu k existující soutěži</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Vyberte soutěž *</label>
                      <select 
                        className="w-full p-2 border rounded-md"
                        value={selectedContest}
                        onChange={(e) => setSelectedContest(e.target.value)}
                      >
                        <option value="">Vyberte soutěž...</option>
                        {contests.filter(c => c.status !== 'closed').map((contest) => (
                          <option key={contest.id} value={contest.id}>
                            {contest.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Popis bonusové ceny *</label>
                        <Input
                          placeholder="Např. AirPods Pro"
                          value={bonusForm.description}
                          onChange={(e) => setBonusForm({...bonusForm, description: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Pozice tiketu *</label>
                        <Input
                          type="number"
                          placeholder="Např. 50000"
                          min="1"
                          max="999999"
                          value={bonusForm.ticket_position}
                          onChange={(e) => setBonusForm({...bonusForm, ticket_position: e.target.value})}
                        />
                      </div>
                    </div>
                    
                    <Button 
                      onClick={addBonusPrize} 
                      disabled={!selectedContest}
                      className="w-full md:w-auto"
                    >
                      Přidat bonusovou cenu
                    </Button>
                  </CardContent>
                </Card>

                {selectedContest && bonusPrizes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Bonusové ceny vybrané soutěže</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3">
                        {bonusPrizes.map((prize) => (
                          <div key={prize.id} className="flex justify-between items-center p-3 border rounded-lg">
                            <div>
                              <h4 className="font-medium">{prize.description}</h4>
                              <p className="text-sm text-muted-foreground">
                                Tiket #{prize.ticket_position.toLocaleString('cs-CZ')}
                              </p>
                            </div>
                            <Badge variant="outline">{prize.status}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;