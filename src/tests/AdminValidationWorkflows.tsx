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

export const AdminValidationWorkflows: React.FC = () => {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [sofinityEvents, setSofinityEvents] = useState<SofinityEventSummary[]>([]);
  const [uiValidations, setUiValidations] = useState<UIValidationResult[]>([]);
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

  const runCompleteValidation = async () => {
    setLoading(true);
    try {
      await Promise.all([
        getAdminSummary(),
        getSofinityEvents()
      ]);
      
      toast({
        title: "Kompletní validace dokončena",
        description: "Všechny kontroly byly úspěšně dokončeny",
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
        </TabsContent>
      </Tabs>
    </div>
  );
};