import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, AlertTriangle, Play, Shield, Database, MessageSquare, FileText, CreditCard, Gift, Users, BarChart3 } from 'lucide-react';

interface ValidationResult {
  category: string;
  test: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
  timestamp: string;
  execution_time?: number;
}

interface AdminSummary {
  contests_summary: string;
  bonus_prizes_summary: string;
  vouchers_summary: string;
  payments_summary: string;
  notifications_summary: string;
  recent_actions: string;
}

interface SofinityEventSummary {
  event_name: string;
  count: number;
  latest_timestamp: string;
  sample_metadata: any;
}

interface UIValidationResult {
  component_name: string;
  test_type: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  czech_text_validated: boolean;
}

interface PerformanceMetrics {
  totalExecutionTime: number;
  averageTestTime: number;
  slowestTest: { name: string; time: number; category: string } | null;
  fastestTest: { name: string; time: number; category: string } | null;
  suiteBreakdown: { suite: string; totalTime: number; testCount: number; averageTime: number }[];
}

export const AdminValidationWorkflows: React.FC = () => {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [sofinityEvents, setSofinityEvents] = useState<SofinityEventSummary[]>([]);
  const [uiValidations, setUiValidations] = useState<UIValidationResult[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [overallStats, setOverallStats] = useState({
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  });

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
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'passed': 'default',
      'failed': 'destructive', 
      'running': 'secondary',
      'warning': 'outline'
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status === 'passed' && 'Prošel'}
        {status === 'failed' && 'Selhal'}
        {status === 'running' && 'Probíhá'}
        {status === 'warning' && 'Varování'}
      </Badge>
    );
  };

  const calculatePerformanceMetrics = (results: ValidationResult[]): PerformanceMetrics => {
    const testsWithTime = results.filter(r => r.execution_time && r.execution_time > 0);
    
    if (testsWithTime.length === 0) {
      return {
        totalExecutionTime: 0,
        averageTestTime: 0,
        slowestTest: null,
        fastestTest: null,
        suiteBreakdown: []
      };
    }

    const totalTime = testsWithTime.reduce((sum, r) => sum + (r.execution_time || 0), 0);
    const averageTime = totalTime / testsWithTime.length;

    // Find slowest and fastest tests
    const slowest = testsWithTime.reduce((prev, current) => 
      (current.execution_time || 0) > (prev.execution_time || 0) ? current : prev
    );
    
    const fastest = testsWithTime.reduce((prev, current) => 
      (current.execution_time || 0) < (prev.execution_time || 0) ? current : prev
    );

    // Calculate suite breakdown
    const suiteMap = new Map<string, { totalTime: number; testCount: number }>();
    
    testsWithTime.forEach(result => {
      const suite = result.category;
      const current = suiteMap.get(suite) || { totalTime: 0, testCount: 0 };
      suiteMap.set(suite, {
        totalTime: current.totalTime + (result.execution_time || 0),
        testCount: current.testCount + 1
      });
    });

    const suiteBreakdown = Array.from(suiteMap.entries()).map(([suite, data]) => ({
      suite,
      totalTime: data.totalTime,
      testCount: data.testCount,
      averageTime: data.totalTime / data.testCount
    })).sort((a, b) => b.totalTime - a.totalTime);

    return {
      totalExecutionTime: totalTime,
      averageTestTime: averageTime,
      slowestTest: {
        name: slowest.test,
        time: slowest.execution_time || 0,
        category: slowest.category
      },
      fastestTest: {
        name: fastest.test,
        time: fastest.execution_time || 0,
        category: fastest.category
      },
      suiteBreakdown
    };
  };

  const runCompleteValidation = async () => {
    setLoading(true);
    try {
      // Run the complete test suite and extract results
      const { data: testSuiteData, error: testError } = await supabase.rpc('run_complete_admin_test_suite');
      
      if (testError) throw testError;
      
      // Extract validation results from all test suites
      const allResults: ValidationResult[] = [];
      
      if (testSuiteData && typeof testSuiteData === 'object' && 'test_suites' in testSuiteData) {
        const suites = (testSuiteData as any).test_suites;
        
        // Process each test suite
        Object.entries(suites).forEach(([suiteName, suiteData]: [string, any]) => {
          if (suiteData?.test_results) {
            suiteData.test_results.forEach((test: any) => {
              allResults.push({
                category: suiteData.suite_name || suiteName,
                test: test.test_name,
                status: test.status === 'passed' ? 'passed' : 
                       test.status === 'warning' ? 'warning' : 'failed',
                message: test.message,
                timestamp: new Date().toISOString(),
                execution_time: test.execution_time_ms
              });
            });
          }
        });
      }
      
      setValidationResults(allResults);
      
      // Calculate performance metrics
      const metrics = calculatePerformanceMetrics(allResults);
      setPerformanceMetrics(metrics);
      
      // Also run admin summary and sofinity events
      await Promise.all([
        getAdminSummary(),
        getSofinityEvents()
      ]);
      
      toast({
        title: "Kompletní validace dokončena",
        description: `Dokončeno ${allResults.length} testů, ${allResults.filter(r => r.status === 'passed').length} prošlo`,
      });
    } catch (error: any) {
      toast({
        title: "Chyba při validaci",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getAdminSummary = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_summary_dashboard');
      if (error) throw error;
      if (data && data.length > 0) {
        setAdminSummary({
          contests_summary: data[0].contests_summary,
          bonus_prizes_summary: data[0].bonus_prizes_summary,
          vouchers_summary: data[0].vouchers_summary,
          payments_summary: data[0].payments_summary,
          notifications_summary: data[0].notifications_summary,
          recent_actions: data[0].recent_actions
        });
      }
    } catch (error: any) {
      toast({
        title: "Chyba při načítání přehledu",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getSofinityEvents = async () => {
    try {
      const { data, error } = await supabase.rpc('validate_sofinity_events', { p_hours_back: 24 });
      if (error) throw error;
      setSofinityEvents(data || []);
    } catch (error: any) {
      toast({
        title: "Chyba při načítání Sofinity událostí",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    const stats = validationResults.reduce((acc, result) => {
      acc.total++;
      if (result.status === 'passed') acc.passed++;
      else if (result.status === 'failed') acc.failed++;
      else if (result.status === 'warning') acc.warnings++;
      return acc;
    }, { total: 0, passed: 0, failed: 0, warnings: 0 });
    
    setOverallStats(stats);
  }, [validationResults]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OneMil Admin - Kompletní validace a testování</h1>
          <p className="text-muted-foreground">
            End-to-end validace admin backend funkcí, UI komponent a Sofinity integrace
          </p>
        </div>
        <Button 
          onClick={runCompleteValidation} 
          disabled={loading}
          className="flex items-center space-x-2"
        >
          {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span>Spustit kompletní validaci</span>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">Přehled</TabsTrigger>
          <TabsTrigger value="results">Výsledky</TabsTrigger>
          <TabsTrigger value="sofinity">Sofinity</TabsTrigger>
          <TabsTrigger value="performance">Výkon</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-primary">{overallStats.total}</div>
                <div className="text-sm text-muted-foreground">Celkem testů</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-green-600">{overallStats.passed}</div>
                <div className="text-sm text-muted-foreground">Prošlo</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-yellow-600">{overallStats.warnings}</div>
                <div className="text-sm text-muted-foreground">Varování</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold text-red-600">{overallStats.failed}</div>
                <div className="text-sm text-muted-foreground">Selhalo</div>
              </CardContent>
            </Card>
          </div>

          {adminSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4" />
                  <span>Admin Dashboard - Rychlý přehled</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Soutěže</h4>
                    <p className="text-sm text-muted-foreground">{adminSummary.contests_summary}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Vouchery</h4>
                    <p className="text-sm text-muted-foreground">{adminSummary.vouchers_summary}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Platby</h4>
                    <p className="text-sm text-muted-foreground">{adminSummary.payments_summary}</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Poznámka: tento souhrn pochází z DB funkce a může označovat připsané MioCoiny jako Kč.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Oznámení</h4>
                    <p className="text-sm text-muted-foreground">{adminSummary.notifications_summary}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle>Výsledky validace</CardTitle>
            </CardHeader>
            <CardContent>
              {validationResults.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategorie</TableHead>
                      <TableHead>Test</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Zpráva</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResults.map((result, index) => (
                      <TableRow key={index}>
                        <TableCell>{result.category}</TableCell>
                        <TableCell className="font-medium">{result.test}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(result.status)}
                            {getStatusBadge(result.status)}
                          </div>
                        </TableCell>
                        <TableCell>{result.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Zatím nebyly spuštěny žádné testy</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sofinity">
          <Card>
            <CardHeader>
              <CardTitle>Sofinity Events (posledních 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              {sofinityEvents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {sofinityEvents.map((event, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="text-lg font-semibold">{event.count}</div>
                        <div className="text-sm font-medium">{event.event_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(event.latest_timestamp).toLocaleString('cs-CZ')}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Žádné Sofinity události nenalezeny</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <div className="space-y-4">
            {performanceMetrics ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-2xl font-bold text-primary">
                        {performanceMetrics.totalExecutionTime.toFixed(0)}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Celkový čas</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-2xl font-bold text-blue-600">
                        {performanceMetrics.averageTestTime.toFixed(1)}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Průměr na test</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-2xl font-bold text-red-600">
                        {performanceMetrics.slowestTest?.time.toFixed(0) || 0}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Nejpomalejší</div>
                      {performanceMetrics.slowestTest && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {performanceMetrics.slowestTest.name}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-2xl font-bold text-green-600">
                        {performanceMetrics.fastestTest?.time.toFixed(0) || 0}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Nejrychlejší</div>
                      {performanceMetrics.fastestTest && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {performanceMetrics.fastestTest.name}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Breakdown podle test suites</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Test Suite</TableHead>
                          <TableHead>Počet testů</TableHead>
                          <TableHead>Celkový čas</TableHead>
                          <TableHead>Průměrný čas</TableHead>
                          <TableHead>Výkon</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {performanceMetrics.suiteBreakdown.map((suite, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{suite.suite}</TableCell>
                            <TableCell>{suite.testCount}</TableCell>
                            <TableCell>{suite.totalTime.toFixed(0)}ms</TableCell>
                            <TableCell>{suite.averageTime.toFixed(1)}ms</TableCell>
                            <TableCell>
                              <Progress 
                                value={(suite.totalTime / performanceMetrics.totalExecutionTime) * 100} 
                                className="w-16"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Výkonnostní metriky</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Výkonnostní metriky budou k dispozici po spuštění testů</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
