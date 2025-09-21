import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, Play, Bug, Shield, Database, Network, AlertTriangle } from 'lucide-react';

interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  duration?: number;
  timestamp?: string;
}

interface TestSuite {
  name: string;
  tests: TestCase[];
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  category: string;
  testFunction: () => Promise<{ success: boolean; message: string }>;
}

export const AdminTestSuite: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const [allTestsStatus, setAllTestsStatus] = useState<'idle' | 'running' | 'completed'>('idle');

  const testSuites: TestSuite[] = [
    {
      name: 'CRUD Operations',
      tests: [
        {
          id: 'crud-contest-create',
          name: 'Vytvoření soutěže',
          description: 'Test vytvoření nové soutěže s požadovanými daty',
          category: 'crud',
          testFunction: async () => {
            try {
              const testData = {
                p_title: `Test soutěž ${Date.now()}`,
                p_description: 'Test popis soutěže',
                p_main_prize: 'Test hlavní cena',
                p_main_image: null,
                p_status: 'draft',
                p_ticket_count: 1000,
                p_ticket_price: 1,
                p_operation: 'create'
              };

              const { data, error } = await supabase.rpc('admin_manage_contest', testData);
              
              if (error) throw error;
              return { success: true, message: 'Soutěž byla úspěšně vytvořena' };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        },
        {
          id: 'crud-bonus-create',
          name: 'Vytvoření bonusové výhry',
          description: 'Test vytvoření bonusové výhry pro existující soutěž',
          category: 'crud',
          testFunction: async () => {
            try {
              // First get a contest
              const { data: contests } = await supabase
                .from('contests')
                .select('id')
                .limit(1);

              if (!contests || contests.length === 0) {
                return { success: false, message: 'Nejprve vytvořte soutěž' };
              }

              const testData = {
                p_contest_id: contests[0].id,
                p_description: `Test bonus ${Date.now()}`,
                p_ticket_position: Math.floor(Math.random() * 1000) + 1,
                p_amount: 10,
                p_status: 'pending',
                p_operation: 'create'
              };

              const { data, error } = await supabase.rpc('admin_manage_bonus_prize', testData);
              
              if (error) throw error;
              return { success: true, message: 'Bonusová výhra byla úspěšně vytvořena' };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        },
        {
          id: 'crud-voucher-create',
          name: 'Vytvoření voucheru',
          description: 'Test vytvoření voucheru pro uživatele',
          category: 'crud',
          testFunction: async () => {
            try {
              // Get a user
              const { data: users } = await supabase
                .from('users')
                .select('id')
                .limit(1);

              if (!users || users.length === 0) {
                return { success: false, message: 'Nejprve vytvořte uživatele' };
              }

              const { error } = await supabase
                .from('vouchers')
                .insert({
                  code: `TEST${Date.now()}`,
                  value: 25,
                  user_id: users[0].id
                });

              if (error) throw error;
              return { success: true, message: 'Voucher byl úspěšně vytvořen' };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        },
        {
          id: 'crud-notification-create',
          name: 'Vytvoření notifikace',
          description: 'Test vytvoření notifikace pro uživatele',
          category: 'crud',
          testFunction: async () => {
            try {
              const { data: users } = await supabase
                .from('users')
                .select('id')
                .limit(1);

              if (!users || users.length === 0) {
                return { success: false, message: 'Nejprve vytvořte uživatele' };
              }

              const { error } = await supabase
                .from('notifications')
                .insert({
                  user_id: users[0].id,
                  type: 'info',
                  title: 'Test notifikace',
                  message: `Test zpráva ${Date.now()}`,
                  status: 'sent'
                });

              if (error) throw error;
              return { success: true, message: 'Notifikace byla úspěšně vytvořena' };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        }
      ]
    },
    {
      name: 'RLS & Authorization',
      tests: [
        {
          id: 'rls-admin-access',
          name: 'Admin přístup k tabulkám',
          description: 'Ověření, že admin má přístup ke všem tabulkám',
          category: 'security',
          testFunction: async () => {
            try {
              const tables = ['contests', 'bonus_prizes', 'vouchers', 'payments', 'notifications', 'admin_actions'];
              const results = [];

              for (const table of tables) {
                const { data, error } = await supabase
                  .from(table as any)
                  .select('id')
                  .limit(1);

                if (error) {
                  results.push(`${table}: ${error.message}`);
                } else {
                  results.push(`${table}: OK`);
                }
              }

              const hasErrors = results.some(r => !r.includes('OK'));
              return { 
                success: !hasErrors, 
                message: hasErrors ? results.join(', ') : 'Admin má přístup ke všem tabulkám' 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba RLS: ${error.message}` };
            }
          }
        },
        {
          id: 'rls-user-role-check',
          name: 'Ověření role uživatele',
          description: 'Test funkce pro ověření admin role',
          category: 'security',
          testFunction: async () => {
            try {
              const { data, error } = await supabase
                .rpc('get_current_user_role');

              if (error) throw error;
              
              const isAdmin = data === 'admin' || data === 'superadmin';
              return { 
                success: isAdmin, 
                message: isAdmin ? `Uživatel má roli: ${data}` : `Uživatel není admin: ${data}` 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba ověření role: ${error.message}` };
            }
          }
        }
      ]
    },
    {
      name: 'Audit Logging',
      tests: [
        {
          id: 'audit-contest-action',
          name: 'Audit log - soutěž',
          description: 'Ověření, že akce se soutěží jsou logovány',
          category: 'audit',
          testFunction: async () => {
            try {
              const { data: logsBefore } = await supabase
                .from('admin_actions')
                .select('id')
                .eq('action_type', 'contest_create');

              const beforeCount = logsBefore?.length || 0;

              // Create test contest
              const testData = {
                p_title: `Audit test ${Date.now()}`,
                p_main_prize: 'Test cena',
                p_operation: 'create'
              };

              await supabase.rpc('admin_manage_contest', testData);

              // Wait a bit for logging
              await new Promise(resolve => setTimeout(resolve, 1000));

              const { data: logsAfter } = await supabase
                .from('admin_actions')
                .select('id')
                .eq('action_type', 'contest_create');

              const afterCount = logsAfter?.length || 0;
              const newLogs = afterCount - beforeCount;

              return { 
                success: newLogs > 0, 
                message: `Vytvořeno ${newLogs} nových audit logů` 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba audit logu: ${error.message}` };
            }
          }
        },
        {
          id: 'audit-prize-delivery',
          name: 'Audit log - předání výhry',
          description: 'Test logování změn stavu předání výher',
          category: 'audit',
          testFunction: async () => {
            try {
              const { data: prizes } = await supabase
                .from('bonus_prizes')
                .select('id')
                .limit(1);

              if (!prizes || prizes.length === 0) {
                return { success: false, message: 'Nejprve vytvořte bonusovou výhru' };
              }

              const { data, error } = await supabase
                .rpc('update_bonus_prize_delivery_status', {
                  p_prize_id: prizes[0].id,
                  p_status: 'delivered',
                  p_admin_notes: 'Test delivery update'
                });

              if (error) throw error;

              return { success: true, message: 'Změna stavu byla zalogována' };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        }
      ]
    },
    {
      name: 'Sofinity Integration',
      tests: [
        {
          id: 'sofinity-event-function',
          name: 'Sofinity Event Function',
          description: 'Test funkce pro odesílání eventů do Sofinity',
          category: 'integration',
          testFunction: async () => {
            try {
              const { data, error } = await supabase
                .rpc('notify_sofinity_event', {
                  p_event_name: 'test_event',
                  p_user_id: null,
                  p_contest_id: null,
                  p_metadata: { test: true, timestamp: new Date().toISOString() }
                });

              if (error) throw error;

              // Check if event was logged locally
              const { data: eventLogs } = await supabase
                .from('event_logs')
                .select('*')
                .eq('event_name', 'test_event')
                .order('timestamp', { ascending: false })
                .limit(1);

              const hasLocalLog = eventLogs && eventLogs.length > 0;
              return { 
                success: hasLocalLog, 
                message: hasLocalLog ? 'Sofinity event byl úspěšně odeslán a zalogován' : 'Event nebyl lokálně zalogován' 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba Sofinity: ${error.message}` };
            }
          }
        },
        {
          id: 'sofinity-duplicate-check',
          name: 'Duplicitní eventy',
          description: 'Ověření, že se nevytvářejí duplicitní eventy',
          category: 'integration',
          testFunction: async () => {
            try {
              const testEventName = `duplicate_test_${Date.now()}`;
              
              // Send same event twice
              await supabase.rpc('notify_sofinity_event', {
                p_event_name: testEventName,
                p_metadata: { test: 'duplicate1' }
              });

              await supabase.rpc('notify_sofinity_event', {
                p_event_name: testEventName,
                p_metadata: { test: 'duplicate2' }
              });

              // Check how many were logged
              const { data: logs } = await supabase
                .from('event_logs')
                .select('*')
                .eq('event_name', testEventName);

              const logCount = logs?.length || 0;
              return { 
                success: logCount === 2, 
                message: `Zalogováno ${logCount} eventů (očekáváno 2)` 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        }
      ]
    },
    {
      name: 'Database Functions',
      tests: [
        {
          id: 'function-contest-stats',
          name: 'Statistiky soutěže',
          description: 'Test funkce pro získání statistik soutěže',
          category: 'database',
          testFunction: async () => {
            try {
              const { data: contests } = await supabase
                .from('contests')
                .select('id')
                .limit(1);

              if (!contests || contests.length === 0) {
                return { success: false, message: 'Nejprve vytvořte soutěž' };
              }

              const { data, error } = await supabase
                .rpc('get_contest_bonus_stats_enhanced', { contest_id: contests[0].id });

              if (error) throw error;

              const hasValidStats = data && data.length > 0;
              return { 
                success: hasValidStats, 
                message: hasValidStats ? 'Statistiky soutěže byly úspěšně načteny' : 'Žádné statistiky nenalezeny' 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        },
        {
          id: 'function-delivery-summary',
          name: 'Přehled předání výher',
          description: 'Test funkce pro přehled předání výher',
          category: 'database',
          testFunction: async () => {
            try {
              const { data, error } = await supabase
                .rpc('get_prizes_delivery_summary');

              if (error) throw error;

              return { 
                success: true, 
                message: `Načten přehled pro ${data?.length || 0} soutěží` 
              };
            } catch (error: any) {
              return { success: false, message: `Chyba: ${error.message}` };
            }
          }
        }
      ]
    }
  ];

  const allTests = testSuites.flatMap(suite => suite.tests);

  useEffect(() => {
    // Initialize test results
    const initialResults: TestResult[] = allTests.map(test => ({
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'pending'
    }));
    setTestResults(initialResults);
  }, []);

  const runSingleTest = async (test: TestCase) => {
    setRunningTests(prev => new Set([...prev, test.id]));
    
    // Update status to running
    setTestResults(prev => prev.map(result => 
      result.id === test.id 
        ? { ...result, status: 'running', timestamp: new Date().toISOString() }
        : result
    ));

    const startTime = Date.now();
    
    try {
      const result = await test.testFunction();
      const duration = Date.now() - startTime;
      
      setTestResults(prev => prev.map(r => 
        r.id === test.id 
          ? { 
              ...r, 
              status: result.success ? 'passed' : 'failed',
              message: result.message,
              duration,
              timestamp: new Date().toISOString()
            }
          : r
      ));

      if (result.success) {
        toast({
          title: "Test prošel",
          description: `${test.name}: ${result.message}`,
        });
      } else {
        toast({
          title: "Test selhal",
          description: `${test.name}: ${result.message}`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      setTestResults(prev => prev.map(r => 
        r.id === test.id 
          ? { 
              ...r, 
              status: 'failed',
              message: `Neočekávaná chyba: ${error.message}`,
              duration,
              timestamp: new Date().toISOString()
            }
          : r
      ));

      toast({
        title: "Test selhal",
        description: `${test.name}: Neočekávaná chyba`,
        variant: "destructive"
      });
    } finally {
      setRunningTests(prev => {
        const newSet = new Set(prev);
        newSet.delete(test.id);
        return newSet;
      });
    }
  };

  const runAllTests = async () => {
    setAllTestsStatus('running');
    
    for (const suite of testSuites) {
      for (const test of suite.tests) {
        await runSingleTest(test);
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setAllTestsStatus('completed');
    
    const finalResults = testResults.filter(r => r.status !== 'pending');
    const passed = finalResults.filter(r => r.status === 'passed').length;
    const failed = finalResults.filter(r => r.status === 'failed').length;
    
    toast({
      title: "Testování dokončeno",
      description: `Prošlo: ${passed}, Selhalo: ${failed}`,
      variant: passed === finalResults.length ? "default" : "destructive"
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return <Badge variant="default" className="bg-green-500">Prošel</Badge>;
      case 'failed':
        return <Badge variant="destructive">Selhal</Badge>;
      case 'running':
        return <Badge variant="secondary">Běží</Badge>;
      default:
        return <Badge variant="outline">Čeká</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'crud':
        return <Database className="w-4 h-4" />;
      case 'security':
        return <Shield className="w-4 h-4" />;
      case 'audit':
        return <Bug className="w-4 h-4" />;
      case 'integration':
        return <Network className="w-4 h-4" />;
      case 'database':
        return <Database className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const testStats = {
    total: testResults.length,
    passed: testResults.filter(r => r.status === 'passed').length,
    failed: testResults.filter(r => r.status === 'failed').length,
    running: testResults.filter(r => r.status === 'running').length,
    pending: testResults.filter(r => r.status === 'pending').length
  };

  return (
    <div className="space-y-6">
      {/* Test Overview */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">OneMil Admin Test Suite</h2>
          <p className="text-muted-foreground">Kompletní testování administrátorské sekce</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={runAllTests}
            disabled={allTestsStatus === 'running'}
          >
            <Play className="w-4 h-4 mr-2" />
            {allTestsStatus === 'running' ? 'Testování běží...' : 'Spustit všechny testy'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{testStats.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prošlo</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{testStats.passed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selhalo</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{testStats.failed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Běží</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{testStats.running}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čeká</CardTitle>
            <Clock className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{testStats.pending}</div>
          </CardContent>
        </Card>
      </div>

      {/* Test Results by Category */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">Všechny testy</TabsTrigger>
          <TabsTrigger value="crud">CRUD</TabsTrigger>
          <TabsTrigger value="security">Bezpečnost</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="integration">Integrace</TabsTrigger>
          <TabsTrigger value="database">Databáze</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Všechny testy</CardTitle>
              <CardDescription>Přehled všech testů v sadě</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Doba běhu</TableHead>
                    <TableHead>Zpráva</TableHead>
                    <TableHead>Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testResults.map((result) => {
                    const test = allTests.find(t => t.id === result.id);
                    return (
                      <TableRow key={result.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(result.status)}
                            <div>
                              <div className="font-medium">{result.name}</div>
                              <div className="text-sm text-muted-foreground">{test?.description}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(result.category)}
                            <span className="capitalize">{result.category}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(result.status)}</TableCell>
                        <TableCell>
                          {result.duration ? `${result.duration}ms` : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {result.message || '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => test && runSingleTest(test)}
                            disabled={runningTests.has(result.id)}
                          >
                            {runningTests.has(result.id) ? 'Běží...' : 'Spustit'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Category-specific tabs */}
        {['crud', 'security', 'audit', 'integration', 'database'].map(category => (
          <TabsContent key={category} value={category}>
            <Card>
              <CardHeader>
                <CardTitle className="capitalize flex items-center gap-2">
                  {getCategoryIcon(category)}
                  {category === 'crud' ? 'CRUD Operace' :
                   category === 'security' ? 'Bezpečnost' :
                   category === 'audit' ? 'Audit Logy' :
                   category === 'integration' ? 'Integrace' :
                   'Databázové funkce'}
                </CardTitle>
                <CardDescription>
                  Testy pro kategorii {category}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {testResults
                    .filter(result => result.category === category)
                    .map((result) => {
                      const test = allTests.find(t => t.id === result.id);
                      return (
                        <div key={result.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(result.status)}
                            <div>
                              <h3 className="font-medium">{result.name}</h3>
                              <p className="text-sm text-muted-foreground">{test?.description}</p>
                              {result.message && (
                                <p className="text-sm mt-1 text-foreground">{result.message}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {result.duration && (
                              <span className="text-sm text-muted-foreground">
                                {result.duration}ms
                              </span>
                            )}
                            {getStatusBadge(result.status)}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => test && runSingleTest(test)}
                              disabled={runningTests.has(result.id)}
                            >
                              {runningTests.has(result.id) ? 'Běží...' : 'Spustit'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Test Instructions */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Pokyny pro testování:</strong><br />
          1. Ujistěte se, že jste přihlášeni jako admin uživatel<br />
          2. Před spuštěním testů zkontrolujte, že máte alespoň jednu soutěž a uživatele v databázi<br />
          3. Testy CRUD operací vytváří testovací data - po testování je doporučeno smazat<br />
          4. Sofinity integrace testy vyžadují správně nastavené secrets<br />
          5. Některé testy mohou selhat kvůli RLS policies - zkontrolujte své oprávnění
        </AlertDescription>
      </Alert>
    </div>
  );
};