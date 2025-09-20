import React, { useEffect, useState } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { useTestAuth } from '@/hooks/useTestAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminMenu } from '@/components/AdminMenu';
import { TicketMapAdmin } from '@/components/TicketMapAdmin';
import { TestTube, AlertTriangle } from 'lucide-react';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  main_image: string;
  status: string;
  ticket_count: number;
  ticket_price: number;
  created_at: string;
  total_positions?: number;
  total_miocoins?: number;
  pending_count?: number;
  physical_items?: number;
  won_count?: number;
  min_position?: number;
  max_position?: number;
  first_20_positions?: string;
}

interface BonusPrize {
  id: string;
  contest_id: string;
  description: string;
  ticket_position: number;
  status: string;
  amount?: number;
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
  const { testUser, isTestMode, testSignOut } = useTestAuth();
  const [searchParams] = useSearchParams();
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
    ticket_price: 1,
    status: 'pending'
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [bonusForm, setBonusForm] = useState({
    description: '',
    ticket_position: ''
  });

  // Bonus distribution form state
  const [distributionForm, setDistributionForm] = useState({
    bonus_type: 'miocoin',
    total_value: '',
    amount_per_unit: '',
    distribution_rule: 'random'
  });

  useEffect(() => {
    // Support both regular auth and test auth
    if (user || (isTestMode && testUser)) {
      checkAdminRole();
      fetchContests();
    }
  }, [user, isTestMode, testUser]);

  // Enhanced authentication check to support test mode
  useEffect(() => {
    // If in test mode, check admin role based on test user
    if (isTestMode && testUser) {
      checkAdminRole();
      fetchContests();
    }
  }, [isTestMode, testUser]);

  // Realtime subscription for bonus prizes updates on contests table
  useEffect(() => {
    const channel = supabase
      .channel('contests-bonus-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bonus_prizes'
      }, () => {
        console.log('Bonus prizes changed, refreshing contests...');
        fetchContests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedContest) {
      fetchBonusPrizes();
    }
  }, [selectedContest]);

  // Realtime subscription for bonus prizes
  useEffect(() => {
    if (!selectedContest) return;

    const channel = supabase
      .channel('bonus-prizes-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bonus_prizes',
        filter: `contest_id=eq.${selectedContest}`
      }, () => {
        console.log('Bonus prizes changed, refetching...');
        fetchBonusPrizes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      // First get all contests
      const { data: contestsData, error: contestsError } = await supabase
        .from('contests')
        .select('id, title, description, main_prize, main_image, status, ticket_count, ticket_price, created_at')
        .order('created_at', { ascending: false });

      if (contestsError) throw contestsError;

      // Then get aggregated bonus statistics for each contest
      const contestsWithStats = await Promise.all(
        (contestsData || []).map(async (contest) => {
          const { data: bonusStats, error: bonusError } = await supabase
            .rpc('get_contest_bonus_stats_enhanced' as any, { contest_id: contest.id });

          if (bonusError) {
            console.error('Error fetching bonus stats for contest:', contest.id, bonusError);
            // Return contest with zero stats if query fails
            return {
              ...contest,
              total_positions: 0,
              total_miocoins: 0,
              physical_items: 0,
              pending_count: 0,
              won_count: 0,
              min_position: null,
              max_position: null,
              first_20_positions: 'No bonuses'
            };
          }

          const stats = bonusStats?.[0] || {
            total_positions: 0,
            total_miocoins: 0,
            physical_items: 0,
            pending_count: 0,
            won_count: 0,
            min_position: null,
            max_position: null,
            first_20_positions: 'No bonuses'
          };

          return {
            ...contest,
            ...stats
          };
        })
      );

      setContests(contestsWithStats);
    } catch (error) {
      console.error('Error fetching contests:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst soutěže.",
        variant: "destructive"
      });
    }
  };

  const fetchBonusPrizes = async () => {
    if (!selectedContest) {
      setBonusPrizes([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bonus_prizes')
        .select('id, contest_id, description, ticket_position, amount, status')
        .eq('contest_id', selectedContest)
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

  const fetchTicketMapData = async () => {
    // This function is no longer needed as TicketMapAdmin now fetches its own data
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

    if (contestForm.ticket_price < 0.01) {
      toast({
        title: "Chyba",
        description: "Cena tiketu musí být alespoň 0,01 Miocoin.",
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
        ticket_price: 1,
        status: 'pending' 
      });
      setSelectedFile(null);
      setImagePreview(null);
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

  // Automatic bonus distribution function with safety rules
  const addBonusDistribution = async () => {
    if (!selectedContest || !distributionForm.total_value || !distributionForm.amount_per_unit) {
      toast({
        title: "Chyba",
        description: "Vyberte soutěž a vyplňte všechna pole.",
        variant: "destructive"
      });
      return;
    }

    const totalValue = parseFloat(distributionForm.total_value);
    const amountPerUnit = parseFloat(distributionForm.amount_per_unit);

    if (totalValue <= 0 || amountPerUnit <= 0) {
      toast({
        title: "Chyba",
        description: "Hodnoty musí být kladné čísla.",
        variant: "destructive"
      });
      return;
    }

    if (amountPerUnit > totalValue) {
      toast({
        title: "Chyba",
        description: "Množství na jednotku nemůže být větší než celková hodnota.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Call the edge function to handle bonus distribution
      const { data, error } = await supabase.functions.invoke('distribute-bonus-prizes', {
        body: {
          contest_id: selectedContest,
          bonus_type: distributionForm.bonus_type === 'miocoin' ? 'MioCoin' : 'Physical Item',
          total_value: totalValue,
          amount_per_unit: amountPerUnit,
          distribution_rule: distributionForm.distribution_rule,
          step_min: 3,
          step_max: 5
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to distribute bonuses');
      }

      // Show success message
      toast({
        title: "Úspěch",
        description: `Úspěšně vytvořeno ${data.created_bonuses} bonusových cen.`
      });

      // Reset form and refresh data
      setDistributionForm({
        bonus_type: 'miocoin',
        total_value: '',
        amount_per_unit: '',
        distribution_rule: 'random'
      });

      // Refresh contest detail to show new bonuses immediately
      fetchBonusPrizes();

    } catch (error) {
      console.error('Error in bonus distribution:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se distribuovat bonusové ceny.",
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

  // Enhanced authentication check for both regular and test mode
  if (!session && !(isTestMode && testUser)) {
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
      
      {/* Test Mode Banner */}
      {isTestMode && testUser && (
        <Alert className="mx-4 mt-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <TestTube className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-yellow-800 dark:text-yellow-200">
              <strong>🧪 TEST REŽIM AKTIVNÍ</strong> - Přihlášen jako: {testUser.email} 
              (Toto není produkční přihlášení!)
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testSignOut}
              className="ml-4 border-yellow-600 text-yellow-700 hover:bg-yellow-100"
            >
              Ukončit test
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
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
              <TabsTrigger value="ticketmap">Mapa tiketů</TabsTrigger>
              <TabsTrigger value="create">Vytvořit soutěž</TabsTrigger>
            <TabsTrigger value="prizes">Bonusové ceny</TabsTrigger>
            <TabsTrigger value="distribution">Automatické bonusy</TabsTrigger>
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
                  {contests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Žádné soutěže nebyly nalezeny.
                    </p>
                  ) : (
                      <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>Obrázek</TableHead>
                             <TableHead>Název soutěže</TableHead>
                             <TableHead>Hlavní cena</TableHead>
                             <TableHead>Status</TableHead>
                             <TableHead>Počet tiketů</TableHead>
                             <TableHead 
                               className="text-center cursor-help" 
                               title="Celkový počet bonusových pozic (unikátní)"
                             >
                               Pozice
                             </TableHead>
                             <TableHead 
                               className="text-center cursor-help" 
                               title="Celkový součet MioCoins bonusů"
                             >
                               MioCoins
                             </TableHead>
                             <TableHead 
                               className="text-center cursor-help" 
                               title="Počet čekajících / vyhraných bonusů"
                             >
                               Čekající / Vyhrané
                             </TableHead>
                             <TableHead 
                               className="text-center cursor-help" 
                               title="Min-Max pozice bonusů"
                             >
                               Rozsah
                             </TableHead>
                             <TableHead 
                               className="cursor-help" 
                               title="Prvních 20 bonusových pozic pro rychlou vizuální kontrolu (copyable)"
                             >
                               První 20 pozic
                             </TableHead>
                             <TableHead>Vytvořeno</TableHead>
                             <TableHead>Akce</TableHead>
                           </TableRow>
                         </TableHeader>
                      <TableBody>
                        {contests.map((contest) => (
                          <TableRow key={contest.id}>
                             <TableCell>
                               {contest.main_image ? (
                                 <img 
                                   src={contest.main_image.startsWith('http') ? contest.main_image : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`} 
                                   alt={contest.title}
                                   className="w-12 h-12 object-cover rounded-md"
                                   onError={(e) => {
                                     console.log('Image loading error:', contest.main_image);
                                     e.currentTarget.style.display = 'none';
                                   }}
                                 />
                               ) : (
                                 <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                                   <span className="text-xs text-muted-foreground">Bez obrázku</span>
                                 </div>
                               )}
                             </TableCell>
                            <TableCell className="font-medium">{contest.title}</TableCell>
                            <TableCell>{contest.main_prize}</TableCell>
                            <TableCell>
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
                                 contest.status === 'draft' ? 'Koncept' :
                                 contest.status === 'pending' ? 'Čeká' :
                                 contest.status === 'won' ? 'Vyhráno' :
                                 contest.status === 'delivered' ? 'Doručeno' : 'Neznámý'}
                              </Badge>
                            </TableCell>
                              <TableCell>{contest.ticket_count.toLocaleString('cs-CZ')}</TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono">
                                  {(contest.total_positions || 0).toLocaleString('cs-CZ')}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono">
                                  {(contest.total_miocoins || 0).toLocaleString('cs-CZ')}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono text-orange-600">
                                  {(contest.pending_count || 0).toLocaleString('cs-CZ')}
                                </span>
                                <span className="mx-1">/</span>
                                <span className="font-mono text-green-600">
                                  {(contest.won_count || 0).toLocaleString('cs-CZ')}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono text-sm">
                                  {contest.min_position && contest.max_position ? 
                                    `${contest.min_position.toLocaleString('cs-CZ')}-${contest.max_position.toLocaleString('cs-CZ')}` : 
                                    'N/A'
                                  }
                                </span>
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <div 
                                  className="text-xs font-mono bg-muted p-2 rounded cursor-copy hover:bg-muted/80 transition-colors truncate"
                                  title={`Klikněte pro zkopírování: ${contest.first_20_positions || 'No bonuses'}`}
                                  onClick={(e) => {
                                    navigator.clipboard.writeText(contest.first_20_positions || 'No bonuses');
                                    toast({
                                      title: "Zkopírováno",
                                      description: "Pozice byly zkopírovány do schránky."
                                    });
                                  }}
                                >
                                  {contest.first_20_positions || 'No bonuses'}
                                </div>
                              </TableCell>
                              <TableCell>{new Date(contest.created_at).toLocaleDateString('cs-CZ')}</TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => pauseResumeContest(
                                    contest.id, 
                                    'paused'
                                  )}
                                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                >
                                  Pozastavit
                                </Button>
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => closeContest(contest.id)}
                                  className="border-red-500 text-red-600 hover:bg-red-50"
                                >
                                  Uzavřít
                                </Button>
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    toast({
                                      title: "Editace soutěže",
                                      description: "Funkce editace bude implementována později."
                                    });
                                  }}
                                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                >
                                  Editovat
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Ticket Map */}
            <TabsContent value="ticketmap">
              <TicketMapAdmin />
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
                          
                          // Check file size (5MB max)
                          const maxSize = 5 * 1024 * 1024 // 5MB in bytes
                          if (file.size > maxSize) {
                            toast({
                              title: "Chyba",
                              description: "Maximální velikost souboru je 5 MB",
                              variant: "destructive"
                            })
                            e.target.value = ''
                            return
                          }
                          
                          setSelectedFile(file)
                          
                          // Create preview
                          const reader = new FileReader()
                          reader.onload = (e) => {
                            setImagePreview(e.target?.result as string)
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                      className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {selectedFile && (
                      <p className="text-sm text-muted-foreground">
                        Vybraný soubor: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                    {imagePreview && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-2">Náhled:</p>
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="max-w-xs max-h-48 rounded-md border object-cover"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <label className="text-sm font-medium">Cena tiketu (Miocoin) *</label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="1"
                        value={contestForm.ticket_price}
                        onChange={(e) => setContestForm({...contestForm, ticket_price: parseFloat(e.target.value) || 1})}
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

                {selectedContest && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Bonusové ceny vybrané soutěže</CardTitle>
                      <CardDescription>
                        {bonusPrizes.length > 0 ? (
                          <div className="flex flex-wrap gap-4 mt-2 text-sm">
                            <span>Celkem: <strong>{bonusPrizes.length}</strong> bonusů</span>
                            <span>MioCoins: <strong>{bonusPrizes.filter(p => p.description.includes('MioCoin') || p.amount).reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString('cs-CZ')}</strong></span>
                            <span>Fyzické předměty: <strong>{bonusPrizes.filter(p => !p.description.includes('MioCoin') && !p.amount).length}</strong></span>
                            <span>Čekající: <strong>{bonusPrizes.filter(p => p.status === 'pending').length}</strong></span>
                            <span>Vyhrané: <strong>{bonusPrizes.filter(p => p.status === 'won').length}</strong></span>
                          </div>
                        ) : (
                          'Žádné bonusové ceny pro tuto soutěž'
                        )}
                      </CardDescription>
                    </CardHeader>
                    {bonusPrizes.length > 0 && (
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Popis</TableHead>
                              <TableHead>Pozice tiketu</TableHead>
                              <TableHead>Množství</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bonusPrizes.map((prize) => (
                              <TableRow key={prize.id}>
                                <TableCell className="font-medium">{prize.description}</TableCell>
                                <TableCell>#{prize.ticket_position.toLocaleString('cs-CZ')}</TableCell>
                                <TableCell>
                                  {prize.amount ? `${prize.amount.toLocaleString('cs-CZ')} MioCoins` : '1 kus'}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      prize.status === 'pending' ? 'outline' :
                                      prize.status === 'won' ? 'default' :
                                      prize.status === 'delivered' ? 'secondary' : 'outline'
                                    }
                                  >
                                    {prize.status === 'pending' ? 'Čeká' :
                                     prize.status === 'won' ? 'Vyhráno' :
                                     prize.status === 'delivered' ? 'Doručeno' : prize.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    )}
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Automatic Bonus Distribution */}
            <TabsContent value="distribution">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Automatická distribuce bonusů</CardTitle>
                    <CardDescription>Automaticky rozdělte bonusové ceny podle pravidel distribuce</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Vyberte soutěž *</label>
                      <Select value={selectedContest} onValueChange={setSelectedContest}>
                        <SelectTrigger>
                          <SelectValue placeholder="Vyberte soutěž..." />
                        </SelectTrigger>
                        <SelectContent>
                          {contests.filter(c => c.status !== 'closed').map((contest) => (
                            <SelectItem key={contest.id} value={contest.id}>
                              {contest.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Typ bonusu *</label>
                        <Select 
                          value={distributionForm.bonus_type} 
                          onValueChange={(value) => setDistributionForm({...distributionForm, bonus_type: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="miocoin">MioCoin</SelectItem>
                            <SelectItem value="physical">Fyzická věc</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Pravidlo distribuce *</label>
                        <Select 
                          value={distributionForm.distribution_rule} 
                          onValueChange={(value) => setDistributionForm({...distributionForm, distribution_rule: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="random">Náhodně</SelectItem>
                            <SelectItem value="interval">Interval 3-5 tiketů</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {distributionForm.bonus_type === 'miocoin' ? 'Celková hodnota MioCoins *' : 'Celkové množství *'}
                        </label>
                        <Input
                          type="number"
                          placeholder={distributionForm.bonus_type === 'miocoin' ? "Např. 100000" : "Např. 100"}
                          min="1"
                          step={distributionForm.bonus_type === 'miocoin' ? "0.01" : "1"}
                          value={distributionForm.total_value}
                          onChange={(e) => setDistributionForm({...distributionForm, total_value: e.target.value})}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {distributionForm.bonus_type === 'miocoin' ? 'MioCoins na jednotku *' : 'Kusů na jednotku *'}
                        </label>
                        <Input
                          type="number"
                          placeholder={distributionForm.bonus_type === 'miocoin' ? "Např. 5000" : "Např. 1"}
                          min="1"
                          step={distributionForm.bonus_type === 'miocoin' ? "0.01" : "1"}
                          value={distributionForm.amount_per_unit}
                          onChange={(e) => setDistributionForm({...distributionForm, amount_per_unit: e.target.value})}
                        />
                      </div>
                    </div>
                    
                    {distributionForm.total_value && distributionForm.amount_per_unit && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm text-muted-foreground">
                          <strong>Výsledek:</strong> {Math.floor(parseFloat(distributionForm.total_value) / parseFloat(distributionForm.amount_per_unit))} bonusových cen
                          × {distributionForm.amount_per_unit} {distributionForm.bonus_type === 'miocoin' ? 'MioCoins' : 'kusů'}
                        </div>
                      </div>
                    )}
                    
                    <Button 
                      onClick={addBonusDistribution} 
                      disabled={!selectedContest || !distributionForm.total_value || !distributionForm.amount_per_unit}
                      className="w-full md:w-auto"
                    >
                      Distribuovat bonusy
                    </Button>
                  </CardContent>
                </Card>

                {selectedContest && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Bonusové ceny vybrané soutěže</CardTitle>
                      <CardDescription>
                        {bonusPrizes.length > 0 ? (
                          <div className="flex flex-wrap gap-4 mt-2 text-sm">
                            <span>Celkem: <strong>{bonusPrizes.length}</strong> bonusů</span>
                            <span>MioCoins: <strong>{bonusPrizes.filter(p => p.description.includes('MioCoin') || p.amount).reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString('cs-CZ')}</strong></span>
                            <span>Fyzické předměty: <strong>{bonusPrizes.filter(p => !p.description.includes('MioCoin') && !p.amount).length}</strong></span>
                            <span>Čekající: <strong>{bonusPrizes.filter(p => p.status === 'pending').length}</strong></span>
                            <span>Vyhrané: <strong>{bonusPrizes.filter(p => p.status === 'won').length}</strong></span>
                          </div>
                        ) : (
                          'Po spuštění distribuce se zde zobrazí bonusové ceny'
                        )}
                      </CardDescription>
                    </CardHeader>
                    {bonusPrizes.length > 0 && (
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Popis</TableHead>
                              <TableHead>Pozice tiketu</TableHead>
                              <TableHead>Množství</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bonusPrizes.map((prize) => (
                              <TableRow key={prize.id}>
                                <TableCell className="font-medium">{prize.description}</TableCell>
                                <TableCell>#{prize.ticket_position.toLocaleString('cs-CZ')}</TableCell>
                                <TableCell>
                                  {prize.amount ? `${prize.amount.toLocaleString('cs-CZ')} MioCoins` : '1 kus'}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      prize.status === 'pending' ? 'outline' :
                                      prize.status === 'won' ? 'default' :
                                      prize.status === 'delivered' ? 'secondary' : 'outline'
                                    }
                                  >
                                    {prize.status === 'pending' ? 'Čeká' :
                                     prize.status === 'won' ? 'Vyhráno' :
                                     prize.status === 'delivered' ? 'Doručeno' : prize.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    )}
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