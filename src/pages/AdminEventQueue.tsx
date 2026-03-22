import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { RefreshCw, ListOrdered } from 'lucide-react';

interface EventQueueRow {
  id: string;
  event_name: string;
  status: string | null;
  created_at: string | null;
  processed_at: string | null;
  retry_count: number | null;
  last_error: string | null;
  user_id: string | null;
  contest_id: string | null;
  source_system: string | null;
}

const AdminEventQueue: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<EventQueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    try {
      const { data, error } = await supabase
        .from('event_queue')
        .select('id, event_name, status, created_at, processed_at, retry_count, last_error, user_id, contest_id, source_system')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data as EventQueueRow[]) ?? []);
    } catch (e) {
      console.error('Error fetching event queue:', e);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst frontu událostí',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchQueue();
  }, [user, isAdmin]);

  if (!user) return <NavigateToLogin />;
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Načítání…</div>
      </div>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const statusVariant = (s: string | null) => {
    if (s === "completed") return "success" as const;
    if (s === "failed") return "destructive" as const;
    if (s === "processing") return "warning" as const;
    return "pending" as const;
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                Fronta událostí (event_queue)
              </CardTitle>
              <CardDescription>
                Read-only přehled položek ve frontě pro odeslání do Sofinity
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Obnovit
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground py-8 text-center">Načítání…</div>
            ) : rows.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">Žádné záznamy</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Čas</TableHead>
                      <TableHead>Událost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Opakování</TableHead>
                      <TableHead>Zpracováno</TableHead>
                      <TableHead>Chyba</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleString('cs-CZ') : '–'}
                        </TableCell>
                        <TableCell className="font-medium">{r.event_name}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(r.status)}>{r.status ?? 'pending'}</Badge>
                        </TableCell>
                        <TableCell>{r.retry_count ?? 0}</TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {r.processed_at ? new Date(r.processed_at).toLocaleString('cs-CZ') : '–'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-destructive" title={r.last_error ?? undefined}>
                          {r.last_error ?? '–'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
};

export default AdminEventQueue;
