import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface AuditResult {
  total_events: number;
  generated_events: number;
  validated_events: number;
  missing_events: number;
  event_types: string[];
  integration_status: 'passed' | 'failed' | 'warning';
}

const OneMilAudit = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isFixingEvents, setIsFixingEvents] = useState(false);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResult | null>(null);

  // Redirect if not admin
  if (!user || (role !== 'admin' && role !== 'superadmin')) {
    navigate('/login');
    return null;
  }

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const { data, error } = await supabase
        .from('event_logs')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      toast({
        title: "✅ Spojení úspěšné",
        description: `Nalezeno ${data?.length || 0} událostí za posledních 24 hodin`,
        variant: "default",
      });
    } catch (error) {
      console.error('Connection test failed:', error);
      toast({
        title: "❌ Chyba spojení",
        description: "Nepodařilo se připojit k EventLogs",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const fixMissingEvents = async () => {
    setIsFixingEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke('repair-missing-events', {
        body: { days: 7 }
      });

      if (error) throw error;

      toast({
        title: "🔧 Eventy opraveny",
        description: `Vygenerováno ${data?.generated_count || 0} chybějících událostí`,
        variant: "default",
      });
    } catch (error) {
      console.error('Fix events failed:', error);
      toast({
        title: "❌ Chyba při opravě",
        description: "Nepodařilo se opravit chybějící eventy",
        variant: "destructive",
      });
    } finally {
      setIsFixingEvents(false);
    }
  };

  const runAudit = async () => {
    setIsRunningAudit(true);
    try {
      // Check event existence for last 7 days
      const { data: eventStats, error: eventError } = await supabase
        .from('event_logs')
        .select('event_name, metadata')
        .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (eventError) throw eventError;

      const requiredEventTypes = [
        'user_registered',
        'voucher_purchased', 
        'coin_redeemed',
        'contest_closed',
        'prize_won',
        'notification_sent'
      ];

      const foundEventTypes = [...new Set(eventStats?.map(e => e.event_name) || [])];
      const validJsonCount = eventStats?.filter(e => {
        if (!e.metadata) return false;
        try {
          return typeof e.metadata === 'object';
        } catch {
          return false;
        }
      }).length || 0;

      const missingTypes = requiredEventTypes.filter(type => !foundEventTypes.includes(type));
      
      const results: AuditResult = {
        total_events: eventStats?.length || 0,
        generated_events: foundEventTypes.length,
        validated_events: validJsonCount,
        missing_events: missingTypes.length,
        event_types: foundEventTypes,
        integration_status: missingTypes.length === 0 ? 'passed' : 'warning'
      };

      setAuditResults(results);

      toast({
        title: results.integration_status === 'passed' ? "✅ Audit úspěšný" : "⚠️ Audit dokončen",
        description: `${results.total_events} událostí, ${results.missing_events} chybějících typů`,
        variant: results.integration_status === 'passed' ? "default" : "destructive",
      });

    } catch (error) {
      console.error('Audit failed:', error);
      toast({
        title: "❌ Chyba auditu",
        description: "Nepodařilo se spustit audit",
        variant: "destructive",
      });
    } finally {
      setIsRunningAudit(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">OneMil Audit</h1>
          <p className="text-muted-foreground">
            Správa a kontrola integrace událostí
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Test spojení
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Ověří připojení k EventLogs za posledních 24 hodin
            </p>
            <Button 
              onClick={testConnection}
              disabled={isTestingConnection}
              className="w-full"
            >
              {isTestingConnection && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test spojení
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Opravit eventy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Vygeneruje chybějící události za posledních 7 dní
            </p>
            <Button 
              onClick={fixMissingEvents}
              disabled={isFixingEvents}
              variant="outline"
              className="w-full"
            >
              {isFixingEvents && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opravit chybějící eventy
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Spustit audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Kompletní kontrola událostí a metadata
            </p>
            <Button 
              onClick={runAudit}
              disabled={isRunningAudit}
              variant="default"
              className="w-full"
            >
              {isRunningAudit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spustit audit
            </Button>
          </CardContent>
        </Card>
      </div>

      {auditResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(auditResults.integration_status)}
              Výsledky auditu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {auditResults.total_events}
                </div>
                <div className="text-sm text-muted-foreground">
                  Celkem událostí
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {auditResults.validated_events}
                </div>
                <div className="text-sm text-muted-foreground">
                  Validní metadata
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {auditResults.generated_events}
                </div>
                <div className="text-sm text-muted-foreground">
                  Typy událostí
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {auditResults.missing_events}
                </div>
                <div className="text-sm text-muted-foreground">
                  Chybějící typy
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-semibold mb-2">Nalezené typy událostí:</h4>
              <div className="flex flex-wrap gap-2">
                {auditResults.event_types.map((type) => (
                  <Badge key={type} variant="secondary">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold">Stav integrace:</span>
              {getStatusIcon(auditResults.integration_status)}
              <Badge 
                variant={auditResults.integration_status === 'passed' ? 'default' : 'destructive'}
              >
                {auditResults.integration_status === 'passed' ? 'Prošel (100%)' : 'Nedokonalý'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OneMilAudit;