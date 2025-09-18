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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminMenu } from '@/components/AdminMenu';

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

interface EdgeFunctionLog {
  event_message: string;
  event_type: string;
  function_id: string;
  level: string;
  timestamp: number;
}

interface EventLog {
  id: string;
  event_name: string;
  event_id: string;
  user_id: string;
  contest_id: string | null;
  timestamp: string;
}

interface AIRequest {
  id: string;
  event_id: string;
  type: string;
}

const AdminDashboard: React.FC = () => {
  const { user, session } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<string>('');
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Log analyzer states
  const [edgeFunctionLogs, setEdgeFunctionLogs] = useState<EdgeFunctionLog[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [aiRequests, setAIRequests] = useState<AIRequest[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Form states
  const [contestForm, setContestForm] = useState({
    title: '',
    description: '',
    main_prize: '',
    main_image: '',
    ticket_count: 1000000,
    status: 'pending'
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    if (!contestForm.title.trim() || !contestForm.main_prize.trim() || !selectedFile) {
      toast({
        title: "Chyba",
        description: "Vyplňte všechna povinná pole a vyberte obrázek.",
        variant: "destructive"
      });
      return;
    }

    if (contestForm.ticket_count < 1) {
      toast({
        title: "Chyba",
        description: "Počet tiketů musí být alespoň 1.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Upload image to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contest-images')
        .upload(fileName, selectedFile)

      if (uploadError) {
        throw new Error('Chyba při nahrávání obrázku')
      }

      // Get public URL for the uploaded image
      const { data: { publicUrl } } = supabase.storage
        .from('contest-images')
        .getPublicUrl(fileName)

      // Create contest with uploaded image URL
      const contestData = {
        ...contestForm,
        main_image: publicUrl
      }

      const { data, error } = await supabase.functions.invoke('create-contest', {
        body: contestData
      });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Soutěž byla úspěšně vytvořena."
      });

      setContestForm({ 
        title: '', 
        description: '', 
        main_prize: '', 
        main_image: '', 
        ticket_count: 1000000, 
        status: 'pending' 
      });
      setSelectedFile(null);
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

  const fetchSofinityLogs = async () => {
    setLogsLoading(true);
    try {
      // Fetch edge function logs using the analytics query
      const { data: edgeLogs } = await supabase.functions.invoke('analytics-query', {
        body: {
          query: `
            select id, function_edge_logs.timestamp, event_message, response.status_code, 
                   request.method, m.function_id, m.execution_time_ms, m.deployment_id, m.version,
                   m.metadata
            from function_edge_logs
              cross join unnest(metadata) as m
              cross join unnest(m.response) as response
              cross join unnest(m.request) as request
            where m.function_id in (
              select id from functions 
              where name in ('send_event_to_sofinity', 'sofinity-integration-test')
            )
            order by timestamp desc
            limit 50
          `
        }
      });

      if (edgeLogs) {
        setEdgeFunctionLogs(edgeLogs.map((log: any) => ({
          event_message: log.event_message,
          event_type: log.event_type || 'Log',
          function_id: log.function_id,
          level: log.status_code >= 400 ? 'error' : 'info',
          timestamp: log.timestamp
        })));
      }

      // Fetch EventLogs from Sofinity
      const sofinityUrl = 'https://xkzhjldrojjlrkezorey.supabase.co';
      const sofinityKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U';
      
      const eventLogsResponse = await fetch(`${sofinityUrl}/rest/v1/EventLogs?select=id,event_name,event_id,user_id,contest_id,timestamp&order=timestamp.desc&limit=20`, {
        headers: {
          'apikey': sofinityKey,
          'Authorization': `Bearer ${sofinityKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (eventLogsResponse.ok) {
        const eventLogsData = await eventLogsResponse.json();
        setEventLogs(eventLogsData);

        // Fetch AIRequests for duplicate check
        const aiRequestsResponse = await fetch(`${sofinityUrl}/rest/v1/AIRequests?select=id,event_id,type&eq.type=event_forward`, {
          headers: {
            'apikey': sofinityKey,
            'Authorization': `Bearer ${sofinityKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (aiRequestsResponse.ok) {
          const aiRequestsData = await aiRequestsResponse.json();
          setAIRequests(aiRequestsData);

          // Check for duplicates
          const eventIdCounts: { [key: string]: number } = {};
          aiRequestsData.forEach((req: AIRequest) => {
            eventIdCounts[req.event_id] = (eventIdCounts[req.event_id] || 0) + 1;
          });

          const duplicates = Object.entries(eventIdCounts)
            .filter(([_, count]) => count > 1)
            .map(([eventId, count]) => `Event ID ${eventId} appears ${count} times`);
          
          setDuplicateWarnings(duplicates);
        }
      }

    } catch (error) {
      console.error('Error fetching Sofinity logs:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst Sofinity logy.",
        variant: "destructive"
      });
    } finally {
      setLogsLoading(false);
    }
  };

  const testSofinityIntegration = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sofinity-integration-test');
      
      if (error) throw error;

      toast({
        title: "Test dokončen",
        description: "Sofinity integrace byla otestována. Zkontrolujte logy.",
      });

      // Refresh logs after test
      setTimeout(() => fetchSofinityLogs(), 2000);

    } catch (error) {
      console.error('Error testing Sofinity integration:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se otestovat Sofinity integraci.",
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
              <TabsTrigger value="logs">Sofinity Logy</TabsTrigger>
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
                    <label className="text-sm font-medium">Hlavní obrázek *</label>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']
                          if (!allowedTypes.includes(file.type)) {
                            toast({
                              title: "Chyba",
                              description: "Povolené formáty: .jpg, .jpeg, .png",
                              variant: "destructive"
                            })
                            e.target.value = ''
                            return
                          }
                          setSelectedFile(file)
                        }
                      }}
                      className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {selectedFile && (
                      <p className="text-sm text-muted-foreground">
                        Vybraný soubor: {selectedFile.name}
                      </p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Počet tiketů *</label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1000000"
                        value={contestForm.ticket_count}
                        onChange={(e) => setContestForm({...contestForm, ticket_count: parseInt(e.target.value) || 1})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Stav soutěže *</label>
                      <select 
                        className="w-full p-2 border rounded-md"
                        value={contestForm.status}
                        onChange={(e) => setContestForm({...contestForm, status: e.target.value})}
                      >
                        <option value="pending">Čeká</option>
                        <option value="won">Vyhráno</option>
                        <option value="delivered">Doručeno</option>
                      </select>
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

            {/* Sofinity Logs */}
            <TabsContent value="logs">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>OneMil Log Analyzer - Sofinity Integration</CardTitle>
                    <CardDescription>Analýza edge functions a EventLogs pro Sofinity integraci</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex space-x-2">
                      <Button onClick={fetchSofinityLogs} disabled={logsLoading}>
                        {logsLoading ? 'Načítám...' : 'Aktualizovat logy'}
                      </Button>
                      <Button onClick={testSofinityIntegration} variant="outline">
                        Otestovat integraci
                      </Button>
                    </div>

                    {duplicateWarnings.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                        <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Duplicity v AIRequests:</h4>
                        <ul className="text-sm text-yellow-700 space-y-1">
                          {duplicateWarnings.map((warning, index) => (
                            <li key={index}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Edge Functions Logy (Posledních 50 volání)</CardTitle>
                    <CardDescription>send_event_to_sofinity a sofinity-integration-test</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Čas</TableHead>
                          <TableHead>Funkce</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Zpráva</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {edgeFunctionLogs.map((log, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-sm">
                              {new Date(log.timestamp / 1000).toLocaleString('cs-CZ')}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {log.function_id.substring(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <Badge variant={log.level === 'error' ? 'destructive' : 'default'}>
                                {log.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate">
                              {log.event_message}
                            </TableCell>
                          </TableRow>
                        ))}
                        {edgeFunctionLogs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                              Žádné logy nenalezeny. Klikněte na "Aktualizovat logy" pro načtení.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>EventLogs z Sofinity (Posledních 20 událostí)</CardTitle>
                    <CardDescription>Přehled událostí zapsaných do Sofinity EventLogs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Event Name</TableHead>
                          <TableHead>Event ID</TableHead>
                          <TableHead>User ID</TableHead>
                          <TableHead>Contest ID</TableHead>
                          <TableHead>Čas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eventLogs.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell className="text-sm font-mono">
                              {event.id.substring(0, 8)}...
                            </TableCell>
                            <TableCell className="text-sm">
                              {event.event_name}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {event.event_id?.substring(0, 8)}...
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {event.user_id?.substring(0, 8)}...
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {event.contest_id ? `${event.contest_id.substring(0, 8)}...` : '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(event.timestamp).toLocaleString('cs-CZ')}
                            </TableCell>
                          </TableRow>
                        ))}
                        {eventLogs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                              Žádné EventLogs nenalezeny. Klikněte na "Aktualizovat logy" pro načtení.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>AIRequests Přehled</CardTitle>
                    <CardDescription>Kontrola AIRequests záznamů typu event_forward</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground mb-4">
                      Celkem AIRequests: {aiRequests.length} | 
                      Duplicity: {duplicateWarnings.length}
                    </div>
                    {aiRequests.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Event ID</TableHead>
                            <TableHead>Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aiRequests.slice(0, 10).map((request) => (
                            <TableRow key={request.id}>
                              <TableCell className="text-sm font-mono">
                                {request.id.substring(0, 8)}...
                              </TableCell>
                              <TableCell className="text-sm font-mono">
                                {request.event_id.substring(0, 8)}...
                              </TableCell>
                              <TableCell className="text-sm">
                                {request.type}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminDashboard;