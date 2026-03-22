import React, { useEffect, useState } from 'react';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Search, FileText, Download, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface AuditLog {
  id: number;
  event_name: string;
  user_id?: string;
  metadata?: any;
  timestamp: string;
  users?: {
    email: string;
    name?: string;
  };
}

const AdminAuditLogs: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('všechny');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
    }
  }, [isAdmin]);

  const fetchAuditLogs = async () => {
    try {
      const { data: logs, error } = await supabase
        .from('event_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Get user details for logs with user_id
      const userIds = [...new Set(logs?.filter(log => log.user_id).map(log => log.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, email, name')
        .in('id', userIds);

      // Merge user data with logs
      const logsWithUsers = logs?.map(log => ({
        ...log,
        users: log.user_id ? users?.find(u => u.id === log.user_id) : null
      })) || [];

      setAuditLogs(logsWithUsers);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst audit logy",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async () => {
    try {
      const csvContent = [
        ['ID', 'Event', 'User', 'Created At', 'Metadata'].join(','),
        ...filteredLogs.map(log => [
          log.id,
          log.event_name,
          log.users?.email || 'System',
          new Date(log.timestamp).toLocaleString('cs-CZ'),
          JSON.stringify(log.metadata || {}).replace(/,/g, ';')
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Úspěch",
        description: "Audit logy byly exportovány",
      });
    } catch (error) {
      console.error('Error exporting logs:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se exportovat audit logy",
        variant: "destructive",
      });
    }
  };

  const filteredLogs = auditLogs.filter(log => {
    const email = typeof log.users?.email === "string" ? log.users.email : "";
    const matchesSearch =
      log.event_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter === 'všechny' || log.event_name.includes(eventFilter);
    return matchesSearch && matchesEvent;
  });

  const getEventBadge = (event: string) => {
    if (event.includes("created")) return <Badge variant="success">Vytvořeno</Badge>;
    if (event.includes("updated")) return <Badge variant="info">Aktualizováno</Badge>;
    if (event.includes("deleted")) return <Badge variant="destructive">Smazáno</Badge>;
    if (event.includes("login")) return <Badge variant="outline">Přihlášení</Badge>;
    return <Badge variant="outline">{event}</Badge>;
  };

  const getUniqueEvents = () => {
    const events = [...new Set(auditLogs.map(log => log.event_name))];
    return events.sort();
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (authLoading) {
    return null;
  }

  if (!user || !isAdmin) {
    return <NavigateToLogin />;
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-8">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Audit logy
                </CardTitle>
                <CardDescription>
                  Přehled všech admin akcí a systémových událostí
                </CardDescription>
              </div>
              <Button onClick={exportLogs} disabled={filteredLogs.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Hledejte podle události nebo uživatele..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrovat podle události" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="všechny">Všechny události</SelectItem>
                  {getUniqueEvents().map(event => (
                    <SelectItem key={event} value={event}>{event}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8">Načítání audit logů...</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Událost</TableHead>
                      <TableHead>Uživatel</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Metadata</TableHead>
                      <TableHead>Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{log.id}</TableCell>
                        <TableCell>{getEventBadge(log.event_name)}</TableCell>
                        <TableCell>{log.users?.email || 'System'}</TableCell>
                        <TableCell>
                          {new Date(log.timestamp).toLocaleString('cs-CZ')}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {log.metadata ? (
                            <span className="text-xs text-muted-foreground truncate">
                              {JSON.stringify(log.metadata).substring(0, 50)}...
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {log.metadata && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Detail audit logu #{log.id}</DialogTitle>
                                  <DialogDescription>
                                    Událost: {log.event_name} | Uživatel: {log.users?.email || 'System'}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="mt-4">
                                  <h4 className="text-sm font-medium mb-2">Metadata:</h4>
                                  <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredLogs.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                Nenalezeny žádné audit logy podle zadaných kritérií.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
};

export default AdminAuditLogs;