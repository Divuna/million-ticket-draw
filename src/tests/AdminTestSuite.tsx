import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Clock, AlertTriangle, Play, RefreshCw, Timer } from 'lucide-react'; // Fixed cache issue
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

export const AdminTestSuite: React.FC = () => {
  const [testResults, setTestResults] = useState<ComprehensiveTestResult | null>(null);
  const [individualSuites, setIndividualSuites] = useState<{[key: string]: TestSuite}>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

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
    try {
      const { data, error } = await supabase.rpc('run_complete_admin_test_suite');
      
      if (error) throw error;
      
      const testData = data as unknown as ComprehensiveTestResult;
      setTestResults(testData);
      toast({
        title: "Test suite dokončen",
        description: `${testData.summary.passed_tests}/${testData.summary.total_tests} testů prošlo (${testData.summary.success_rate}%)`,
      });
    } catch (error: any) {
      toast({
        title: "Chyba při spuštění testů",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runIndividualTestSuite = async (testType: string) => {
    setLoading(true);
    try {
      let rpcFunction: any = '';
      switch (testType) {
        case 'crud':
          rpcFunction = 'test_admin_crud_operations';
          break;
        case 'security':
          rpcFunction = 'test_admin_security_rls';
          break;
        case 'audit':
          rpcFunction = 'test_audit_logging';
          break;
        case 'sofinity':
          rpcFunction = 'test_sofinity_integration';
          break;
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

      toast({
        title: `${suiteData.suite_name} dokončen`,
        description: `${suiteData.passed_tests}/${suiteData.total_tests} testů prošlo`,
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="crud">CRUD Testy</TabsTrigger>
          <TabsTrigger value="security">Bezpečnost</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="sofinity">Sofinity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Play className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">CRUD Operace</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('crud')}
                    disabled={loading}
                  >
                    Spustit CRUD testy
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Bezpečnost & RLS</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('security')}
                    disabled={loading}
                  >
                    Spustit RLS testy
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Timer className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Audit Logging</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('audit')}
                    disabled={loading}
                  >
                    Spustit audit testy
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">Sofinity Integrace</span>
                </div>
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => runIndividualTestSuite('sofinity')}
                    disabled={loading}
                  >
                    Spustit Sofinity testy
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

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
      </Tabs>
    </div>
  );
};