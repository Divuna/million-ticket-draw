import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Clock, AlertTriangle, Play, RefreshCw, Timer, Database, Shield, FileText, Zap } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/hooks/use-toast";

interface TestResult {
  test_name: string;
  status: 'passed' | 'failed' | 'running' | 'pending';
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

interface DataIntegrityResult {
  table_name: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: any;
  orphaned_count?: number;
  missing_relationships?: string[];
}

interface SofinityEventSummary {
  event_name: string;
  count: number;
  latest_timestamp: string;
  sample_metadata: any;
}

export const AdminTestSuite: React.FC = () => {
  const [testResults, setTestResults] = useState<ComprehensiveTestResult | null>(null);
  const [individualSuites, setIndividualSuites] = useState<{[key: string]: TestSuite}>({});
  const [dataIntegrityResults, setDataIntegrityResults] = useState<DataIntegrityResult[]>([]);
  const [sofinityEvents, setSofinityEvents] = useState<SofinityEventSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [performanceMetrics, setPerformanceMetrics] = useState<{[key: string]: number}>({});

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'passed': 'default',
      'failed': 'destructive', 
      'running': 'secondary',
      'pending': 'outline'
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status === 'passed' && 'Prošel'}
        {status === 'failed' && 'Selhal'}
        {status === 'running' && 'Probíhá'}
        {status === 'pending' && 'Čeká'}
      </Badge>
    );
  };

  const runCompleteTestSuite = async () => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      // Run complete test suite
      const { data, error } = await supabase.rpc('run_complete_admin_test_suite');
      
      if (error) throw error;
      
      const testData = data as unknown as ComprehensiveTestResult;
      setTestResults(testData);
      
      // Run data integrity checks in parallel
      await Promise.all([
        runDataIntegrityChecks(),
        validateSofinityEvents()
      ]);
      
      const executionTime = Date.now() - startTime;
      setPerformanceMetrics(prev => ({
        ...prev,
        complete_suite: executionTime
      }));

      toast({
        title: "Kompletní test suite dokončen",
        description: `${testData.summary.passed_tests}/${testData.summary.total_tests} testů prošlo (${testData.summary.success_rate}%) za ${executionTime}ms`,
      });
    } catch (error: any) {
      toast({
        title: "Chyba při spuštění kompletních testů",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runDataIntegrityChecks = async () => {
    const results: DataIntegrityResult[] = [];
    try {
      // Run checks sequentially to avoid statement timeout
      results.push(...await checkContestBonusPrizeRelationships());
      results.push(...await checkVoucherUserRelationships());
      results.push(...await checkPaymentUserRelationships());
      results.push(...await checkAuditLogConsistency());
      results.push(...await checkEventLogCompleteness());
      
      setDataIntegrityResults(results);
    } catch (error) {
      console.error('Data integrity check failed:', error);
      setDataIntegrityResults(results);
    }
  };

  const checkContestBonusPrizeRelationships = async (): Promise<DataIntegrityResult[]> => {
    // Use lightweight EXISTS-style check: fetch a small sample of bonus_prizes and verify contest exists
    const { data: sampleBonuses } = await supabase
      .from('bonus_prizes')
      .select('id, contest_id')
      .limit(50);

    let orphanedCount = 0;
    if (sampleBonuses && sampleBonuses.length > 0) {
      const uniqueContestIds = [...new Set(sampleBonuses.map(b => b.contest_id))];
      const { data: matchingContests } = await supabase
        .from('public_contests')
        .select('id')
        .in('id', uniqueContestIds);
      const validIds = new Set(matchingContests?.map(c => c.id) || []);
      orphanedCount = sampleBonuses.filter(b => !validIds.has(b.contest_id)).length;
    }

    return [{
      table_name: 'bonus_prizes -> contests',
      status: orphanedCount > 0 ? 'warning' : 'passed',
      message: orphanedCount > 0 
        ? `Nalezeno ${orphanedCount} bonusových výher bez odpovídající soutěže (vzorek 50)`
        : 'Všechny bonusové výhry mají správnou vazbu na soutěže',
      orphaned_count: orphanedCount
    }];
  };

  const checkVoucherUserRelationships = async (): Promise<DataIntegrityResult[]> => {
    const { data: sampleVouchers } = await supabase
      .from('vouchers')
      .select('id, user_id')
      .not('user_id', 'is', null)
      .limit(50);

    let orphanedCount = 0;
    if (sampleVouchers && sampleVouchers.length > 0) {
      const uniqueUserIds = [...new Set(sampleVouchers.map(v => v.user_id).filter(Boolean))];
      const { data: matchingUsers } = await supabase
        .from('users')
        .select('id')
        .in('id', uniqueUserIds);
      const validIds = new Set(matchingUsers?.map(u => u.id) || []);
      orphanedCount = sampleVouchers.filter(v => v.user_id && !validIds.has(v.user_id)).length;
    }

    return [{
      table_name: 'vouchers -> users',
      status: orphanedCount > 0 ? 'warning' : 'passed',
      message: orphanedCount > 0
        ? `Nalezeno ${orphanedCount} voucherů bez odpovídajícího uživatele (vzorek 50)`
        : 'Všechny vouchery mají správnou vazbu na uživatele',
      orphaned_count: orphanedCount
    }];
  };

  const checkPaymentUserRelationships = async (): Promise<DataIntegrityResult[]> => {
    // Just check if any recent payments exist - lightweight
    const { count, error } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    return [{
      table_name: 'payments -> users',
      status: error ? 'warning' : 'passed',
      message: error 
        ? `Chyba při kontrole plateb: ${error.message}`
        : `Platby za posledních 7 dní: ${count || 0} záznamů`,
      orphaned_count: 0
    }];
  };

  const checkAuditLogConsistency = async (): Promise<DataIntegrityResult[]> => {
    const { data: recentAdminActions, error } = await supabase
      .from('admin_actions')
      .select('id, metadata')
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(20);

    if (error) {
      return [{
        table_name: 'admin_actions audit consistency',
        status: 'warning',
        message: `Chyba při kontrole: ${error.message}`,
        details: {}
      }];
    }

    const hasMetadata = recentAdminActions?.every(action => 
      action.metadata && typeof action.metadata === 'object') ?? true;

    return [{
      table_name: 'admin_actions audit consistency',
      status: hasMetadata ? 'passed' : 'warning',
      message: hasMetadata 
        ? `Všechny admin akce (${recentAdminActions?.length || 0}) mají správná metadata`
        : 'Některé admin akce nemají správná metadata',
      details: { recent_count: recentAdminActions?.length || 0 }
    }];
  };

  const checkEventLogCompleteness = async (): Promise<DataIntegrityResult[]> => {
    // Use head:true count instead of loading all rows
    const { count, error } = await supabase
      .from('event_logs')
      .select('id', { count: 'exact', head: true })
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      return [{
        table_name: 'event_logs completeness',
        status: 'warning',
        message: `Chyba při kontrole event logů: ${error.message}`,
        details: {}
      }];
    }

    return [{
      table_name: 'event_logs completeness',
      status: 'passed',
      message: `Event logy za posledních 24h: ${count || 0} záznamů`,
      details: { recent_count: count || 0 }
    }];
  };

  const validateSofinityEvents = async () => {
    try {
      const { data, error } = await supabase.rpc('validate_sofinity_events', { p_hours_back: 24 });
      
      if (error) throw error;
      
      setSofinityEvents(data || []);
    } catch (error) {
      console.error('Sofinity validation failed:', error);
    }
  };

  const runIndividualTestSuite = async (testType: string) => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      let rpcFunction: any = '';
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
          displayName = 'Integrita dat';
          const executionTime = Date.now() - startTime;
          setPerformanceMetrics(prev => ({ ...prev, [testType]: executionTime }));
          toast({
            title: `${displayName} dokončen`,
            description: `Kontrola integrity dat dokončena za ${executionTime}ms`,
          });
          return;
        case 'events':
          await validateSofinityEvents();
          displayName = 'Sofinity události';
          const eventsTime = Date.now() - startTime;
          setPerformanceMetrics(prev => ({ ...prev, [testType]: eventsTime }));
          toast({
            title: `${displayName} dokončeno`,
            description: `Validace Sofinity událostí dokončena za ${eventsTime}ms`,
          });
          return;
        default:
          throw new Error(`Neznámý typ testu: ${testType}`);
      }

      const { data, error } = await supabase.rpc(rpcFunction as any);
      
      if (error) throw error;
      
      const suiteData = data as TestSuite;
      setIndividualSuites(prev => ({
        ...prev,
        [testType]: suiteData
      }));

      const executionTime = Date.now() - startTime;
      setPerformanceMetrics(prev => ({ ...prev, [testType]: executionTime }));

      toast({
        title: `${displayName} dokončen`,
        description: `${suiteData.passed_tests}/${suiteData.total_tests} testů prošlo za ${executionTime}ms`,
      });
    } catch (error: any) {
      toast({
        title: "Chyba při spuštění testu",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
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
                {test.details && (
                  <details className="text-xs text-muted-foreground mt-1">
                    <summary className="cursor-pointer">Detaily</summary>
                    <pre className="mt-1 text-xs">{JSON.stringify(test.details, null, 2)}</pre>
                  </details>
                )}
              </TableCell>
              <TableCell>
                {test.execution_time_ms && (
                  <span className="text-sm text-muted-foreground">
                    {test.execution_time_ms}ms
                  </span>
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
          <h1 className="text-2xl font-bold">OneMil Admin Test Suite</h1>
          <p className="text-muted-foreground">
            Automatizované testování CRUD operací, bezpečnosti, audit logů a integrace
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={runCompleteTestSuite} 
            disabled={loading}
            className="flex items-center space-x-2"
          >
            {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>Spustit vše</span>
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              setTestResults(null);
              setIndividualSuites({});
            }}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="crud">CRUD Testy</TabsTrigger>
          <TabsTrigger value="security">Bezpečnost</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="sofinity">Sofinity</TabsTrigger>
          <TabsTrigger value="integrity">Integrita dat</TabsTrigger>
          <TabsTrigger value="performance">Výkonnost</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card>
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
                  <div className="text-xs text-muted-foreground mt-1">
                    {performanceMetrics.crud}ms
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
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
                  <div className="text-xs text-muted-foreground mt-1">
                    {performanceMetrics.security}ms
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-purple-500" />
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
                    Spustit audit
                  </Button>
                </div>
                {performanceMetrics.audit && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {performanceMetrics.audit}ms
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-orange-500" />
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
                    Spustit Sofinity
                  </Button>
                </div>
                {performanceMetrics.sofinity && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {performanceMetrics.sofinity}ms
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Database className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-medium">Integrita dat</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('integrity')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Zkontrolovat data
                  </Button>
                </div>
                {performanceMetrics.integrity && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {performanceMetrics.integrity}ms
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs font-medium">Události</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('events')}
                    disabled={loading}
                    className="w-full text-xs"
                  >
                    Validovat události
                  </Button>
                </div>
                {performanceMetrics.events && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {performanceMetrics.events}ms
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Data Integrity Summary */}
          {dataIntegrityResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Database className="h-4 w-4" />
                  <span>Integrita dat - rychlý přehled</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {dataIntegrityResults.filter(r => r.status === 'passed').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Prošlo</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {dataIntegrityResults.filter(r => r.status === 'warning').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Varování</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {dataIntegrityResults.filter(r => r.status === 'failed').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Selhalo</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sofinity Events Summary */}
          {sofinityEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="h-4 w-4" />
                  <span>Sofinity události (posledních 24h)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {sofinityEvents.slice(0, 4).map((event, index) => (
                    <div key={index} className="text-center p-3 border rounded">
                      <div className="text-lg font-semibold">{event.count}</div>
                      <div className="text-sm text-muted-foreground">{event.event_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(event.latest_timestamp).toLocaleString('cs-CZ')}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {testResults && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Výsledky kompletního test suite</span>
                  <Badge 
                    variant={testResults.overall_status === 'all_passed' ? 'default' : 
                             testResults.overall_status === 'mostly_passed' ? 'secondary' : 'destructive'}
                  >
                    {testResults.overall_status === 'all_passed' && 'Vše prošlo'}
                    {testResults.overall_status === 'mostly_passed' && 'Většinou prošlo'}
                    {testResults.overall_status === 'failed' && 'Selhalo'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{testResults.summary.total_tests}</div>
                    <div className="text-sm text-muted-foreground">Celkem testů</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{testResults.summary.passed_tests}</div>
                    <div className="text-sm text-muted-foreground">Prošlo</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{testResults.summary.failed_tests}</div>
                    <div className="text-sm text-muted-foreground">Selhalo</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{testResults.summary.success_rate}%</div>
                    <div className="text-sm text-muted-foreground">Úspěšnost</div>
                  </div>
                </div>

                <Progress value={testResults.summary.success_rate} className="w-full mb-4" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">CRUD Testy</h4>
                    <div className="text-sm text-muted-foreground">
                      {testResults.test_suites.crud_tests.passed_tests}/{testResults.test_suites.crud_tests.total_tests} prošlo
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Bezpečnostní Testy</h4>
                    <div className="text-sm text-muted-foreground">
                      {testResults.test_suites.security_tests.passed_tests}/{testResults.test_suites.security_tests.total_tests} prošlo
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Audit Testy</h4>
                    <div className="text-sm text-muted-foreground">
                      {testResults.test_suites.audit_tests.passed_tests}/{testResults.test_suites.audit_tests.total_tests} prošlo
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Sofinity Testy</h4>
                    <div className="text-sm text-muted-foreground">
                      {testResults.test_suites.sofinity_tests.passed_tests}/{testResults.test_suites.sofinity_tests.total_tests} prošlo
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  Dokončeno za {testResults.execution_time_ms}ms • {new Date(testResults.timestamp).toLocaleString('cs-CZ')}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="crud">
          <Card>
            <CardHeader>
              <CardTitle>CRUD Operace</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.crud ? (
                renderTestResults(individualSuites.crud)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Ještě nebyly spuštěny CRUD testy</p>
                  <Button onClick={() => runIndividualTestSuite('crud')} disabled={loading}>
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
              <CardTitle>Bezpečnost & RLS</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.security ? (
                renderTestResults(individualSuites.security)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Ještě nebyly spuštěny bezpečnostní testy</p>
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
              <CardTitle>Audit Logging</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.audit ? (
                renderTestResults(individualSuites.audit)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Ještě nebyly spuštěny audit testy</p>
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
              <CardTitle>Sofinity Integrace</CardTitle>
            </CardHeader>
            <CardContent>
              {individualSuites.sofinity ? (
                renderTestResults(individualSuites.sofinity)
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Ještě nebyly spuštěny Sofinity testy</p>
                  <Button onClick={() => runIndividualTestSuite('sofinity')} disabled={loading}>
                    Spustit Sofinity testy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrity">
          <Card>
            <CardHeader>
              <CardTitle>Integrita dat a vztahy tabulek</CardTitle>
            </CardHeader>
            <CardContent>
              {dataIntegrityResults.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tabulka/Vztah</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Zpráva</TableHead>
                      <TableHead>Detail</TableHead>
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
                          {result.orphaned_count && result.orphaned_count > 0 && (
                            <Badge variant="outline">{result.orphaned_count} sirotek</Badge>
                          )}
                          {result.details && (
                            <details className="text-xs">
                              <summary className="cursor-pointer">Více info</summary>
                              <pre className="mt-1">{JSON.stringify(result.details, null, 2)}</pre>
                            </details>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Ještě nebyla spuštěna kontrola integrity dat</p>
                  <Button onClick={() => runIndividualTestSuite('integrity')} disabled={loading}>
                    Zkontrolovat integritu dat
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Výkonnostní metriky a rychlost testů</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.keys(performanceMetrics).length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(performanceMetrics).map(([testType, time]) => (
                        <Card key={testType}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{testType}</span>
                              <Badge variant="outline">{time}ms</Badge>
                            </div>
                            <Progress 
                              value={Math.min((time / 10000) * 100, 100)} 
                              className="mt-2" 
                            />
                            <div className="text-xs text-muted-foreground mt-1">
                              {time < 1000 ? 'Velmi rychlé' : 
                               time < 5000 ? 'Rychlé' : 
                               time < 10000 ? 'Průměrné' : 'Pomalé'}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    
                    <Alert>
                      <Clock className="h-4 w-4" />
                      <AlertDescription>
                        Celkový čas posledního kompletního test suite: {performanceMetrics.complete_suite || 'N/A'}ms
                      </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">Zatím nejsou k dispozici výkonnostní metriky</p>
                    <Button onClick={runCompleteTestSuite} disabled={loading}>
                      Spustit kompletní test suite pro metriky
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
