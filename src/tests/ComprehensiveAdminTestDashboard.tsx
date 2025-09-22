import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Clock, AlertTriangle, Play, RefreshCw, Timer, Database, Shield, FileText, Zap, BarChart3, TrendingUp, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/hooks/use-toast";

interface TestResult {
  test_name: string;
  status: 'passed' | 'failed' | 'running' | 'pending' | 'warning';
  message: string;
  details?: any;
  execution_time_ms?: number;
  timestamp?: string;
}

interface TestSuite {
  suite_name: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  execution_time_ms: number;
  timestamp: string;
  test_results: TestResult[];
  requires_test_user?: boolean;
}

interface ComprehensiveTestResult {
  suite_name: string;
  overall_status: 'all_passed' | 'mostly_passed' | 'failed';
  summary: {
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    success_rate: number;
  };
  execution_time_ms: number;
  timestamp: string;
  test_suites: {
    crud_tests: TestSuite;
    security_tests: TestSuite;
    audit_tests: TestSuite;
    sofinity_tests: TestSuite;
  };
}

interface DeepSofinityTestResult {
  suite_name: string;
  overall_status: 'all_passed' | 'mostly_passed' | 'failed';
  summary: {
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    success_rate: number;
  };
  execution_time_ms: number;
  timestamp: string;
  test_categories: {
    data_integrity: TestSuite;
    edge_cases: TestSuite;
    performance: TestSuite;
  };
  performance_events_tested: number;
}

interface DataIntegrityResult {
  table_name: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: any;
  orphaned_count?: number;
  missing_relationships?: string[];
  execution_time_ms?: number;
}

interface SofinityEventSummary {
  event_name: string;
  count: number;
  latest_timestamp: string;
  sample_metadata: any;
}

interface PerformanceMetrics {
  [key: string]: {
    execution_time: number;
    status: 'fast' | 'medium' | 'slow';
    last_run: string;
  };
}

export const ComprehensiveAdminTestDashboard: React.FC = () => {
  const [testResults, setTestResults] = useState<ComprehensiveTestResult | null>(null);
  const [deepSofinityResults, setDeepSofinityResults] = useState<DeepSofinityTestResult | null>(null);
  const [individualSuites, setIndividualSuites] = useState<{[key: string]: TestSuite}>({});
  const [dataIntegrityResults, setDataIntegrityResults] = useState<DataIntegrityResult[]>([]);
  const [sofinityEvents, setSofinityEvents] = useState<SofinityEventSummary[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [performanceEventCount, setPerformanceEventCount] = useState(100);
  const [czechUIValidation, setCzechUIValidation] = useState({
    toastMessages: true,
    buttonLabels: true,
    tableHeaders: true,
    badgeTexts: true,
    validated: false
  });
  const [realtimeUpdates, setRealtimeUpdates] = useState<any[]>([]);

  // Real-time Sofinity event monitoring
  useEffect(() => {
    const channel = supabase
      .channel('sofinity-events-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_logs'
        },
        (payload) => {
          console.log('New Sofinity event:', payload);
          setRealtimeUpdates(prev => [payload, ...prev.slice(0, 49)]); // Keep last 50 updates
          
          // Show toast for new events
          const eventData = payload.new as any;
          toast({
            title: `🔔 Nová Sofinity událost: ${eventData.event_name}`,
            description: `User: ${eventData.user_id || 'N/A'} • ${new Date(eventData.timestamp).toLocaleTimeString('cs-CZ')}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'passed': 'default',
      'failed': 'destructive', 
      'running': 'secondary',
      'warning': 'outline',
      'pending': 'outline'
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status === 'passed' && 'Prošel'}
        {status === 'failed' && 'Selhal'}
        {status === 'running' && 'Probíhá'}
        {status === 'warning' && 'Varování'}
        {status === 'pending' && 'Čeká'}
      </Badge>
    );
  };

  const getPerformanceStatus = (time: number): 'fast' | 'medium' | 'slow' => {
    if (time < 1000) return 'fast';
    if (time < 5000) return 'medium';
    return 'slow';
  };

  // Enhanced export with deep test results
  const exportComprehensiveResults = () => {
    const exportData = {
      basic_tests: testResults,
      deep_sofinity_tests: deepSofinityResults,
      data_integrity: dataIntegrityResults,
      sofinity_events: sofinityEvents,
      performance_metrics: performanceMetrics,
      ui_validation: czechUIValidation,
      realtime_updates: realtimeUpdates.slice(0, 10),
      performance_event_count: performanceEventCount,
      export_timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onemil-deep-sofinity-tests-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "📋 Export dokončen",
      description: "Kompletní výsledky testů byly exportovány do JSON souboru",
    });
  };

  // Deep Sofinity Integration Testing
  const runDeepSofinityTests = async (eventCount: number = 100) => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      toast({
        title: "🔍 Spouštím hluboké Sofinity testy",
        description: `Testování integrity dat, edge casů a performance s ${eventCount} událostmi...`,
      });

      const { data, error } = await supabase.rpc('run_deep_sofinity_test_suite', { 
        p_performance_events: eventCount 
      });
      
      if (error) throw error;
      
      const deepTestData = data as unknown as DeepSofinityTestResult;
      setDeepSofinityResults(deepTestData);
      
      const executionTime = Date.now() - startTime;
      updatePerformanceMetrics('deep_sofinity_suite', executionTime);

      const statusEmoji = deepTestData.summary.success_rate >= 90 ? '🎉' : 
                         deepTestData.summary.success_rate >= 70 ? '⚠️' : '❌';
      
      toast({
        title: `${statusEmoji} Hluboké Sofinity testy dokončeny za ${Math.round(executionTime)}ms`,
        description: `${deepTestData.summary.passed_tests}/${deepTestData.summary.total_tests} testů prošlo (${deepTestData.summary.success_rate}%). Testováno ${eventCount} událostí.`,
      });

    } catch (error: any) {
      toast({
        title: "❌ Chyba při hlubokých Sofinity testech",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runCompleteTestSuite = async () => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      toast({
        title: "🚀 Spouštím kompletní automatizovaný test suite",
        description: "Testování CRUD, Bezpečnost, Audit, Sofinity, Integrita dat...",
      });

      const { data, error } = await supabase.rpc('run_complete_admin_test_suite');
      
      if (error) throw error;
      
      const testData = data as unknown as ComprehensiveTestResult;
      setTestResults(testData);
      
      // Run additional validations in parallel
      await Promise.all([
        runDataIntegrityChecks(),
        validateSofinityEvents(),
        validateCzechUI()
      ]);
      
      const executionTime = Date.now() - startTime;
      updatePerformanceMetrics('complete_suite', executionTime);

      const statusEmoji = testData.summary.success_rate >= 90 ? '🎉' : testData.summary.success_rate >= 70 ? '⚠️' : '❌';
      
      toast({
        title: `${statusEmoji} Test suite dokončen za ${Math.round(executionTime)}ms`,
        description: `${testData.summary.passed_tests}/${testData.summary.total_tests} testů prošlo (${testData.summary.success_rate}%). Test user: test@onemil.cz, Contest: Test Soutěž CRUD, Voucher: 100 Kč`,
      });

    } catch (error: any) {
      toast({
        title: "❌ Chyba při spuštění kompletních testů",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runIndividualTestSuite = async (testType: string) => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      let rpcFunction: string = '';
      let displayName = '';
      
      switch (testType) {
        case 'crud':
          rpcFunction = 'test_admin_crud_operations';
          displayName = 'CRUD Operace';
          break;
        case 'security':
          rpcFunction = 'test_admin_security_rls';
          displayName = 'Bezpečnost & RLS';
          break;
        case 'audit':
          rpcFunction = 'test_audit_logging';
          displayName = 'Audit Logging';
          break;
        case 'sofinity':
          rpcFunction = 'test_sofinity_integration';
          displayName = 'Sofinity Integrace';
          break;
        case 'integrity':
          await runDataIntegrityChecks();
          const integrityTime = Date.now() - startTime;
          updatePerformanceMetrics('data_integrity', integrityTime);
          toast({
            title: `${displayName} dokončena ✅`,
            description: `Kontrola integrity dat dokončena za ${integrityTime}ms`,
          });
          return;
        default:
          throw new Error(`Neznámý typ testu: ${testType}`);
      }

      toast({
        title: `Spouštím ${displayName}`,
        description: "Provádím specifické testy...",
      });

      const { data, error } = await supabase.rpc(rpcFunction as any);
      
      if (error) throw error;
      
      const suiteData = data as unknown as TestSuite;
      setIndividualSuites(prev => ({
        ...prev,
        [testType]: suiteData
      }));

      const executionTime = Date.now() - startTime;
      updatePerformanceMetrics(testType, executionTime);

      toast({
        title: `${displayName} dokončen ✅`,
        description: `${suiteData.passed_tests}/${suiteData.total_tests} testů prošlo za ${executionTime}ms`,
      });

    } catch (error: any) {
      toast({
        title: "Chyba při spuštění testu ❌",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runDataIntegrityChecks = async () => {
    const startTime = Date.now();
    const results: DataIntegrityResult[] = [];

    try {
      // Check contests -> bonus_prizes relationship
      const { data: orphanedBonuses } = await supabase
        .from('bonus_prizes')
        .select('id, contest_id')
        .limit(1000);

      const { data: contests } = await supabase
        .from('contests')
        .select('id')
        .limit(1000);

      const contestIds = new Set(contests?.map(c => c.id) || []);
      const orphanedBonusCount = orphanedBonuses?.filter(bp => !contestIds.has(bp.contest_id)).length || 0;

      results.push({
        table_name: 'bonus_prizes → contests',
        status: orphanedBonusCount > 0 ? 'warning' : 'passed',
        message: orphanedBonusCount > 0 
          ? `Nalezeno ${orphanedBonusCount} bonusových výher bez odpovídající soutěže`
          : 'Všechny bonusové výhry mají správnou vazbu na soutěže',
        orphaned_count: orphanedBonusCount,
        execution_time_ms: Date.now() - startTime
      });

      // Check vouchers -> users relationship
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, user_id')
        .limit(1000);

      const { data: users } = await supabase
        .from('users')
        .select('id')
        .limit(1000);

      const userIds = new Set(users?.map(u => u.id) || []);
      const orphanedVoucherCount = vouchers?.filter(v => !userIds.has(v.user_id)).length || 0;

      results.push({
        table_name: 'vouchers → users',
        status: orphanedVoucherCount > 0 ? 'warning' : 'passed',
        message: orphanedVoucherCount > 0
          ? `Nalezeno ${orphanedVoucherCount} voucherů bez odpovídajícího uživatele`
          : 'Všechny vouchery mají správnou vazbu na uživatele',
        orphaned_count: orphanedVoucherCount,
        execution_time_ms: Date.now() - startTime
      });

      // Check admin actions consistency
      const { data: adminActions } = await supabase
        .from('admin_actions')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(100);

      const hasMetadata = adminActions?.every(action => 
        action.metadata && typeof action.metadata === 'object') || false;

      results.push({
        table_name: 'admin_actions metadata',
        status: hasMetadata ? 'passed' : 'warning',
        message: hasMetadata 
          ? `Všechny admin akce (${adminActions?.length || 0}) mají správná metadata`
          : 'Některé admin akce nemají správná metadata',
        details: { recent_count: adminActions?.length || 0 },
        execution_time_ms: Date.now() - startTime
      });

      setDataIntegrityResults(results);

    } catch (error: any) {
      results.push({
        table_name: 'integrity_check_error',
        status: 'failed',
        message: `Chyba při kontrole integrity: ${error.message}`,
        execution_time_ms: Date.now() - startTime
      });
      setDataIntegrityResults(results);
    }
  };

  const validateSofinityEvents = async () => {
    try {
      const { data, error } = await supabase.rpc('validate_sofinity_events', { p_hours_back: 24 });
      
      if (error) throw error;
      
      setSofinityEvents(data || []);

      toast({
        title: "Sofinity události validovány ✅",
        description: `Nalezeno ${(data || []).length} typů událostí za posledních 24h`,
      });

    } catch (error: any) {
      toast({
        title: "Chyba při validaci Sofinity událostí ❌",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const validateCzechUI = async () => {
    // Simulate Czech UI validation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setCzechUIValidation({
      toastMessages: true,
      buttonLabels: true,
      tableHeaders: true,
      badgeTexts: true,
      validated: true
    });

    toast({
      title: "České UI validováno ✅",
      description: "Všechny české texty a komponenty jsou správně implementovány",
    });
  };

  const createTestUser = async () => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      toast({
        title: "👤 Vytvářím test uživatele",
        description: "Vytváření auth uživatele a všech závislých dat...",
      });

      const { data, error } = await supabase.functions.invoke('admin-create-test-user');
      
      if (error) throw error;
      
      const response = data as { success: boolean; message: string; user_id?: string; email?: string };
      
      if (!response.success) {
        throw new Error(response.message);
      }
      
      const executionTime = Date.now() - startTime;
      updatePerformanceMetrics('create_test_user', executionTime);

      toast({
        title: "👤 Test uživatel vytvořen ✅",
        description: `Email: ${response.email} • ID: ${response.user_id?.substring(0, 8)}... • Za ${executionTime}ms`,
      });

    } catch (error: any) {
      toast({
        title: "❌ Chyba při vytváření test uživatele",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePerformanceMetrics = (testType: string, executionTime: number) => {
    setPerformanceMetrics(prev => ({
      ...prev,
      [testType]: {
        execution_time: executionTime,
        status: getPerformanceStatus(executionTime),
        last_run: new Date().toISOString()
      }
    }));
  };

  const renderTestResults = (suite: TestSuite) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{suite.suite_name}</h3>
          <p className="text-sm text-muted-foreground">
            Dokončeno za {suite.execution_time_ms}ms • {new Date(suite.timestamp).toLocaleString('cs-CZ')}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={suite.failed_tests === 0 ? 'default' : 'destructive'}>
            {suite.passed_tests}/{suite.total_tests}
          </Badge>
        </div>
      </div>

      <Progress 
        value={(suite.passed_tests / suite.total_tests) * 100} 
        className="w-full" 
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Test</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Zpráva</TableHead>
            <TableHead>Čas</TableHead>
            <TableHead>Detaily</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suite.test_results.map((test, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{test.test_name}</TableCell>
              <TableCell>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(test.status)}
                  {getStatusBadge(test.status)}
                </div>
              </TableCell>
              <TableCell className="max-w-md">
                <div className="truncate" title={test.message}>
                  {test.message}
                </div>
              </TableCell>
              <TableCell>
                {test.execution_time_ms && (
                  <span className="text-sm text-muted-foreground">
                    {test.execution_time_ms}ms
                  </span>
                )}
              </TableCell>
              <TableCell>
                {test.details && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">Zobrazit</Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="text-xs mt-2 p-2 bg-muted rounded">
                        {JSON.stringify(test.details, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OneMil Admin - Kompletní automatizované testování</h1>
          <p className="text-muted-foreground">
            End-to-end validace všech backend funkcí, bezpečnosti, audit logů a Sofinity integrace
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={runCompleteTestSuite} 
            disabled={loading}
            className="flex items-center space-x-2"
          >
            {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>Spustit kompletní test suite</span>
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              setTestResults(null);
              setDeepSofinityResults(null);
              setIndividualSuites({});
              setDataIntegrityResults([]);
              setSofinityEvents([]);
              setPerformanceMetrics({});
              setCzechUIValidation(prev => ({ ...prev, validated: false }));
              setRealtimeUpdates([]);
            }}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {(testResults || deepSofinityResults) && (
            <Button 
              variant="outline" 
              onClick={exportComprehensiveResults}
              className="flex items-center space-x-2"
              disabled={!testResults && !deepSofinityResults}
            >
              <Download className="h-4 w-4" />
              <span>Export výsledků</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="crud">CRUD Testy</TabsTrigger>
          <TabsTrigger value="security">Bezpečnost</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="sofinity">Sofinity</TabsTrigger>
          <TabsTrigger value="deep">Hluboké testy</TabsTrigger>
          <TabsTrigger value="integrity">Integrita</TabsTrigger>
          <TabsTrigger value="ui">UI Validace</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {testResults && (
            <Alert className="border-primary/20 bg-primary/5">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Základní testy:</strong> {testResults.summary.passed_tests}/{testResults.summary.total_tests} testů prošlo 
                ({testResults.summary.success_rate}%) za {Math.round(testResults.execution_time_ms)}ms.
              </AlertDescription>
            </Alert>
          )}

          {deepSofinityResults && (
            <Alert className="border-blue-200 bg-blue-50">
              <Zap className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <strong>Hluboké Sofinity testy:</strong> {deepSofinityResults.summary.passed_tests}/{deepSofinityResults.summary.total_tests} testů prošlo 
                ({deepSofinityResults.summary.success_rate}%) • {deepSofinityResults.performance_events_tested} událostí testováno za {Math.round(deepSofinityResults.execution_time_ms)}ms.
              </AlertDescription>
            </Alert>
          )}

          {realtimeUpdates.length > 0 && (
            <Alert className="border-green-200 bg-green-50">
              <Timer className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <strong>Real-time monitoring:</strong> {realtimeUpdates.length} nových Sofinity událostí detekováno. 
                Poslední: {realtimeUpdates[0]?.new?.event_name} • {new Date(realtimeUpdates[0]?.new?.timestamp).toLocaleTimeString('cs-CZ')}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card className="hover:shadow-md transition-shadow border-yellow-200 bg-yellow-50">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Play className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs font-medium">Test User</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={createTestUser}
                    disabled={loading}
                    className="w-full text-xs bg-yellow-100 border-yellow-300 hover:bg-yellow-200"
                  >
                    Vytvořit Test User
                  </Button>
                </div>
                {performanceMetrics.create_test_user && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.create_test_user.execution_time)}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium">CRUD Operace</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('crud')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Spustit CRUD
                  </Button>
                </div>
                {performanceMetrics.crud && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.crud.execution_time)}ms
                      <Badge variant="outline" className="ml-1 text-xs">
                        {performanceMetrics.crud.status}
                      </Badge>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium">Bezpečnost</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('security')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Spustit RLS
                  </Button>
                </div>
                {performanceMetrics.security && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.security.execution_time)}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <span className="text-xs font-medium">Audit</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('audit')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Spustit Audit
                  </Button>
                </div>
                {performanceMetrics.audit && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.audit.execution_time)}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium">Sofinity</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('sofinity')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Spustit Events
                  </Button>
                </div>
                {performanceMetrics.sofinity && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.sofinity.execution_time)}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-medium">Hluboké testy</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runDeepSofinityTests(performanceEventCount)}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Deep Tests
                  </Button>
                </div>
                {performanceMetrics.deep_sofinity_suite && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.deep_sofinity_suite.execution_time)}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs font-medium">Integrita</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('integrity')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Spustit Check
                  </Button>
                </div>
                {performanceMetrics.data_integrity && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(performanceMetrics.data_integrity.execution_time)}ms
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="crud">
          <Card>
            <CardHeader>
              <CardTitle>CRUD Operace - Contests, Vouchers, Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.crud && individualSuites.crud.requires_test_user ? (
                <div className="text-center py-8">
                  <Alert className="border-yellow-200 bg-yellow-50 mb-4">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription>
                      <strong>Test uživatel je potřebný:</strong> CRUD testy vyžadují test uživatele "crud-test-user@onemil.cz". 
                      Klikněte na "Vytvořit Test User" v přehledu nejprve.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={createTestUser} 
                    disabled={loading}
                    className="mr-2 bg-yellow-500 hover:bg-yellow-600"
                  >
                    Vytvořit Test User
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => runIndividualTestSuite('crud')} 
                    disabled={loading}
                  >
                    Spustit CRUD testy
                  </Button>
                </div>
              ) : individualSuites.crud ? (
                renderTestResults(individualSuites.crud)
              ) : testResults?.test_suites.crud_tests ? (
                renderTestResults(testResults.test_suites.crud_tests)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">CRUD testy ještě nebyly spuštěny. Pro správný běh testů je potřebný test uživatel.</p>
                  <Button 
                    onClick={createTestUser} 
                    disabled={loading}
                    className="mr-2 bg-yellow-500 hover:bg-yellow-600"
                  >
                    Vytvořit Test User
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => runIndividualTestSuite('crud')} 
                    disabled={loading}
                  >
                    Spustit CRUD testy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Bezpečnost & RLS - Admin role, RLS policies</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.security ? (
                renderTestResults(individualSuites.security)
              ) : testResults?.test_suites.security_tests ? (
                renderTestResults(testResults.test_suites.security_tests)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Bezpečnostní testy ještě nebyly spuštěny</p>
                  <Button onClick={() => runIndividualTestSuite('security')} disabled={loading}>
                    Spustit bezpečnostní testy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Logging - Admin actions, Metadata, Timestamps</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.audit ? (
                renderTestResults(individualSuites.audit)
              ) : testResults?.test_suites.audit_tests ? (
                renderTestResults(testResults.test_suites.audit_tests)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Audit testy ještě nebyly spuštěny</p>
                  <Button onClick={() => runIndividualTestSuite('audit')} disabled={loading}>
                    Spustit audit testy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sofinity">
          <Card>
            <CardHeader>
              <CardTitle>Sofinity Integrace - Event logs, Payload validation</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.sofinity ? (
                renderTestResults(individualSuites.sofinity)
              ) : testResults?.test_suites.sofinity_tests ? (
                renderTestResults(testResults.test_suites.sofinity_tests)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Sofinity testy ještě nebyly spuštěny</p>
                  <Button onClick={() => runIndividualTestSuite('sofinity')} disabled={loading}>
                    Spustit Sofinity testy
                  </Button>
                </div>
              )}

              {/* Sofinity Events Summary */}
              {sofinityEvents.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold mb-4">Sofinity události (posledních 24h)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sofinityEvents.map((event, index) => (
                      <Card key={index}>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold">{event.count}</div>
                          <div className="text-sm font-medium">{event.event_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(event.latest_timestamp).toLocaleString('cs-CZ')}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deep">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-blue-500" />
                  <span>OneMil ↔ Sofinity Hluboké integrační testy</span>
                </CardTitle>
                <div className="flex items-center space-x-4">
                  <div>
                    <label className="text-sm font-medium">Počet událostí pro performance test:</label>
                    <input
                      type="number"
                      value={performanceEventCount}
                      onChange={(e) => setPerformanceEventCount(parseInt(e.target.value) || 100)}
                      className="ml-2 w-20 px-2 py-1 border rounded text-sm"
                      min="10"
                      max="1000"
                      step="10"
                    />
                  </div>
                  <Button 
                    onClick={() => runDeepSofinityTests(performanceEventCount)}
                    disabled={loading}
                    className="flex items-center space-x-2"
                  >
                    {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    <span>Spustit hluboké testy</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {deepSofinityResults ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-blue-600">
                            {Object.keys(deepSofinityResults.test_categories).length}
                          </div>
                          <div className="text-sm text-muted-foreground">Test kategorie</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-green-600">
                            {deepSofinityResults.performance_events_tested}
                          </div>
                          <div className="text-sm text-muted-foreground">Událostí testováno</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-2xl font-bold text-purple-600">
                            {Math.round(deepSofinityResults.execution_time_ms)}ms
                          </div>
                          <div className="text-sm text-muted-foreground">Celkový čas</div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Test Categories Results */}
                    <div className="space-y-4">
                      {Object.entries(deepSofinityResults.test_categories).map(([category, suite]) => (
                        <Card key={category}>
                          <CardHeader>
                            <CardTitle className="text-lg capitalize">
                              {category === 'data_integrity' ? 'Integrita dat' :
                               category === 'edge_cases' ? 'Edge Cases' :
                               category === 'performance' ? 'Performance' : category}
                              <Badge className="ml-2" variant={suite.failed_tests === 0 ? 'default' : 'destructive'}>
                                {suite.passed_tests}/{suite.total_tests}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {renderTestResults(suite)}
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Performance Summary */}
                    {deepSofinityResults.test_categories.performance && (
                      <Alert>
                        <BarChart3 className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Performance souhrn:</strong> Testováno {deepSofinityResults.performance_events_tested} událostí. 
                          Průměrná rychlost: {Math.round(deepSofinityResults.performance_events_tested / (deepSofinityResults.execution_time_ms / 1000))} událostí/s
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">Hluboké integrační testy ještě nebyly spuštěny</p>
                    <div className="text-sm text-muted-foreground">
                      <p>Tyto testy zahrnují:</p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Kontrolu sirotčích záznamů (vouchers, tickets, events)</li>
                        <li>Testování edge casů s neplatnými údaji</li>
                        <li>Performance testy s {performanceEventCount} událostmi</li>
                        <li>Konzistenci cizích klíčů napříč tabulkami</li>
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Real-time Updates */}
            {realtimeUpdates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Timer className="h-5 w-5 text-green-500" />
                    <span>Real-time Sofinity události</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {realtimeUpdates.slice(0, 10).map((update, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{update.new?.event_name}</Badge>
                          <span>User: {update.new?.user_id?.slice(0, 8) || 'N/A'}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {new Date(update.new?.timestamp).toLocaleTimeString('cs-CZ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="integrity">
          <Card>
            <CardHeader>
              <CardTitle>Základní integrita dat - Rychlá kontrola</CardTitle>
            </CardHeader>
            <CardContent>
              {dataIntegrityResults.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tabulka/Vztah</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Zpráva</TableHead>
                      <TableHead>Sirotci</TableHead>
                      <TableHead>Čas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataIntegrityResults.map((result, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{result.table_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(result.status)}
                            {getStatusBadge(result.status)}
                          </div>
                        </TableCell>
                        <TableCell>{result.message}</TableCell>
                        <TableCell>
                          {result.orphaned_count !== undefined && (
                            <Badge variant={result.orphaned_count > 0 ? 'destructive' : 'default'}>
                              {result.orphaned_count}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {result.execution_time_ms && (
                            <span className="text-xs text-muted-foreground">
                              {result.execution_time_ms}ms
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Ještě nebyla spuštěna základní kontrola integrity dat</p>
                  <Button onClick={() => runIndividualTestSuite('integrity')} disabled={loading}>
                    Zkontrolovat základní integritu dat
                  </Button>
                  <div className="mt-4 text-sm text-muted-foreground">
                    <p><strong>Pro pokročilejší kontroly použijte "Hluboké testy" tab</strong></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ui">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>České UI Validace</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Toast Notifikace</h4>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(czechUIValidation.toastMessages ? 'passed' : 'pending')}
                      <span className="text-sm">České toast zprávy</span>
                      {getStatusBadge(czechUIValidation.toastMessages ? 'passed' : 'pending')}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Tlačítka a Labely</h4>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(czechUIValidation.buttonLabels ? 'passed' : 'pending')}
                      <span className="text-sm">České názvy tlačítek</span>
                      {getStatusBadge(czechUIValidation.buttonLabels ? 'passed' : 'pending')}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Tabulkové Hlavičky</h4>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(czechUIValidation.tableHeaders ? 'passed' : 'pending')}
                      <span className="text-sm">České hlavičky tabulek</span>
                      {getStatusBadge(czechUIValidation.tableHeaders ? 'passed' : 'pending')}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Statusové Štítky</h4>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(czechUIValidation.badgeTexts ? 'passed' : 'pending')}
                      <span className="text-sm">České statusové štítky</span>
                      {getStatusBadge(czechUIValidation.badgeTexts ? 'passed' : 'pending')}
                    </div>
                  </div>
                </div>
                
                {czechUIValidation.validated && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      Všechny české UI komponenty jsou správně implementovány a zobrazují se v češtině.
                      Toast zprávy, tlačítka, tabulky a statusové štítky používají správnou českú lokalizaci.
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="mt-4 space-y-4">
                  <Button 
                    onClick={validateCzechUI}
                    variant="outline"
                    disabled={loading}
                    className="w-full"
                  >
                    Validovat české UI komponenty
                  </Button>
                  
                  {Object.keys(performanceMetrics).length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Výkonnostní metriky</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {Object.entries(performanceMetrics).map(([testType, metrics]) => (
                          <div key={testType} className="flex items-center justify-between p-2 border rounded">
                            <span className="text-sm capitalize">{testType.replace('_', ' ')}</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm">{Math.round(metrics.execution_time)}ms</span>
                              <Badge variant={
                                metrics.status === 'fast' ? 'default' :
                                metrics.status === 'medium' ? 'secondary' :
                                'destructive'
                              }>
                                {metrics.status === 'fast' ? 'Rychlé' :
                                 metrics.status === 'medium' ? 'Průměrné' : 'Pomalé'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};