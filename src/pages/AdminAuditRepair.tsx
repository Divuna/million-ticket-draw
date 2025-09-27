import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Wrench, Zap, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { AdminMenu } from '@/components/AdminMenu';

interface AuditEvent {
  id: string;
  event_name: string;
  user_id: string | null;
  timestamp: string;
  metadata: any;
  generation_type: 'existing' | 'repaired';
}

interface AuditStats {
  total_repairs: number;
  total_validations: number;
  runtime_ms: number;
  last_check: string;
}

const AdminAuditRepair = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<AuditStats>({
    total_repairs: 0,
    total_validations: 0,
    runtime_ms: 0,
    last_check: new Date().toISOString()
  });
  const [loading, setLoading] = useState({
    testConnection: false,
    repairEvents: false,
    runAudit: false
  });

  // Show loading while checking user role
  if (roleLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Načítám...</p>
          </div>
        </div>
      </div>
    );
  }

  // Redirect if not admin
  if (!user || (role !== 'admin' && role !== 'superadmin')) {
    return <Navigate to="/login" replace />;
  }

  const setLoadingState = (action: keyof typeof loading, state: boolean) => {
    setLoading(prev => ({ ...prev, [action]: state }));
  };

  const testConnection = async () => {
    setLoadingState('testConnection', true);
    try {
      const { data, error } = await supabase.functions.invoke('test-connection');
      
      if (error) throw error;
      
      // Add test connection result to events table
      const newEvent = {
        id: `test_${Date.now()}`,
        event_name: 'test_connection',
        user_id: null,
        timestamp: new Date().toISOString(),
        metadata: data,
        generation_type: 'existing' as const
      };
      
      setEvents(prev => [newEvent, ...prev]);
      
      toast({
        title: "Test spojení",
        description: data.message,
        variant: data.success ? "default" : "destructive"
      });
    } catch (error: any) {
      // Add failed test connection to events table
      const newEvent = {
        id: `test_${Date.now()}`,
        event_name: 'test_connection',
        user_id: null,
        timestamp: new Date().toISOString(),
        metadata: { error: error.message || "Connection test failed" },
        generation_type: 'existing' as const
      };
      
      setEvents(prev => [newEvent, ...prev]);
      
      toast({
        title: "Chyba",
        description: error.message || "Nepodarilo se otestovat spojení",
        variant: "destructive"
      });
    } finally {
      setLoadingState('testConnection', false);
    }
  };

  const repairMissingEvents = async () => {
    setLoadingState('repairEvents', true);
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase.functions.invoke('repair-missing-events', {
        body: { days: 7 }
      });
      
      if (error) throw error;
      
      // Update events list with generated events
      if (data.generated_events) {
        const newEvents = data.generated_events.map((event: any) => ({
          id: event.id || Math.random().toString(),
          event_name: event.event_name,
          user_id: event.user_id,
          timestamp: event.timestamp,
          metadata: event.metadata,
          generation_type: 'repaired' as const
        }));
        setEvents(prev => [...prev, ...newEvents]);
      }
      
      // Update stats
      const runtime = Date.now() - startTime;
      setStats(prev => ({
        ...prev,
        total_repairs: prev.total_repairs + (data.generated_count || 0),
        runtime_ms: runtime,
        last_check: new Date().toISOString()
      }));
      
      toast({
        title: "Oprava eventů",
        description: data.message,
        variant: data.success ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Chyba",
        description: error.message || "Nepodarilo se opravit eventy",
        variant: "destructive"
      });
    } finally {
      setLoadingState('repairEvents', false);
    }
  };

  const runAudit = async () => {
    setLoadingState('runAudit', true);
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase.functions.invoke('run-audit');
      
      if (error) throw error;
      
      // Update events list with audit results
      if (data.events_data) {
        const auditEvents = data.events_data.map((event: any) => ({
          id: event.id || Math.random().toString(),
          event_name: event.event_name,
          user_id: event.user_id,
          timestamp: event.timestamp,
          metadata: event.metadata,
          generation_type: 'existing' as const
        }));
        setEvents(auditEvents);
      }
      
      // Update stats
      const runtime = Date.now() - startTime;
      setStats(prev => ({
        ...prev,
        total_validations: prev.total_validations + (data.validated_count || 0),
        runtime_ms: runtime,
        last_check: new Date().toISOString()
      }));
      
      toast({
        title: "Audit dokončen",
        description: data.message,
        variant: data.success ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Chyba",
        description: error.message || "Nepodarilo se spustit audit",
        variant: "destructive"
      });
    } finally {
      setLoadingState('runAudit', false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('cs-CZ');
  };

  const getGenerationTypeBadge = (type: 'existing' | 'repaired') => {
    return (
      <Badge variant={type === 'existing' ? 'default' : 'secondary'}>
        {type === 'existing' ? 'Existující' : 'Opravené'}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">OneMil Audit & Repair</h1>
        <p className="text-muted-foreground">Správa a oprava event logů v systému</p>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button
          onClick={testConnection}
          disabled={loading.testConnection}
          className="h-16 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading.testConnection ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <CheckCircle className="w-5 h-5 mr-2" />
          )}
          Test spojení
        </Button>

        <Button
          onClick={repairMissingEvents}
          disabled={loading.repairEvents}
          className="h-16 bg-orange-600 hover:bg-orange-700 text-white"
        >
          {loading.repairEvents ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Wrench className="w-5 h-5 mr-2" />
          )}
          Opravit chybějící eventy
        </Button>

        <Button
          onClick={runAudit}
          disabled={loading.runAudit}
          className="h-16 bg-green-600 hover:bg-green-700 text-white"
        >
          {loading.runAudit ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Zap className="w-5 h-5 mr-2" />
          )}
          Spustit audit
        </Button>
      </div>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Výsledky auditu</CardTitle>
          <CardDescription>
            Seznam event logů s informacemi o jejich původu a stavu
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Uživatel</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Metadata</TableHead>
                  <TableHead>Typ generace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.slice(0, 50).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-mono text-xs">
                      {String(event.id).slice(0, 8)}...
                    </TableCell>
                    <TableCell className="font-medium">{event.event_name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.user_id ? `${String(event.user_id).slice(0, 8)}...` : 'N/A'}
                    </TableCell>
                    <TableCell>{formatDate(event.timestamp)}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted p-1 rounded">
                        {JSON.stringify(event.metadata).slice(0, 50)}...
                      </code>
                    </TableCell>
                    <TableCell>{getGenerationTypeBadge(event.generation_type)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Žádné výsledky k zobrazení. Spusťte některou z akcí výše.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.total_repairs}</div>
              <div className="text-sm text-muted-foreground">Oprav</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.total_validations}</div>
              <div className="text-sm text-muted-foreground">Validací</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.runtime_ms}ms</div>
              <div className="text-sm text-muted-foreground">Runtime</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">
                {formatDate(stats.last_check)}
              </div>
              <div className="text-sm text-muted-foreground">Poslední kontrola</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Menu */}
      <AdminMenu />
    </div>
  );
};

export default AdminAuditRepair;