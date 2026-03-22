import React, { useEffect, useState } from 'react';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Search, Bell, Plus, Send } from 'lucide-react';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title?: string;
  message: string;
  status: string;
  created_at: string;
  sent_at?: string;
  users?: {
    email: string;
    name?: string;
  };
}

const AdminNotifications: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('všechny');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newNotification, setNewNotification] = useState({
    userEmail: '',
    type: 'info',
    title: '',
    message: ''
  });

  useEffect(() => {
    if (isAdmin) {
      fetchNotifications();
    }
  }, [isAdmin]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          users (
            email,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst notifikace",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createNotification = async () => {
    try {
      // Find user by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', newNotification.userEmail)
        .single();

      if (userError) throw new Error('Uživatel s tímto emailem nebyl nalezen');

      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: userData.id,
          type: newNotification.type,
          title: newNotification.title,
          message: newNotification.message,
          status: 'sent'
        });

      if (error) throw error;

      await dispatchPushViaEdge([userData.id], newNotification.title, newNotification.message);

      // Log admin action
      await supabase.rpc('log_admin_action', {
        action_name: 'notification_created',
        entity_type: 'notification',
        new_data: { 
          user_email: newNotification.userEmail,
          type: newNotification.type,
          title: newNotification.title,
          message: newNotification.message
        }
      });

      await fetchNotifications();
      setIsCreateModalOpen(false);
      setNewNotification({ userEmail: '', type: 'info', title: '', message: '' });
      
      toast({
        title: "Úspěch",
        description: "Notifikace byla odeslána",
      });
    } catch (error: any) {
      console.error('Error creating notification:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se vytvořit notifikaci",
        variant: "destructive",
      });
    }
  };

  const sendBulkNotification = async () => {
    try {
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id');

      if (usersError) throw usersError;

      const notificationsToInsert = users.map(user => ({
        user_id: user.id,
        type: newNotification.type,
        title: newNotification.title,
        message: newNotification.message,
        status: 'sent'
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);

      if (error) throw error;

      await dispatchPushViaEdge(users.map((u) => u.id), newNotification.title, newNotification.message);

      // Log admin action
      await supabase.rpc('log_admin_action', {
        action_name: 'bulk_notification_sent',
        entity_type: 'notification',
        new_data: { 
          type: newNotification.type,
          title: newNotification.title,
          message: newNotification.message,
          recipient_count: users.length
        }
      });

      await fetchNotifications();
      setIsCreateModalOpen(false);
      setNewNotification({ userEmail: '', type: 'info', title: '', message: '' });
      
      toast({
        title: "Úspěch",
        description: `Notifikace byla odeslána ${users.length} uživatelům`,
      });
    } catch (error) {
      console.error('Error sending bulk notification:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat hromadnou notifikaci",
        variant: "destructive",
      });
    }
  };

  const dispatchPushViaEdge = async (userIds: string[], title: string, message: string) => {
    if (userIds.length === 0) return;

    const { data: devices, error: devicesError } = await supabase
      .from('user_devices')
      .select('user_id, player_id, updated_at')
      .in('user_id', userIds)
      .not('player_id', 'is', null)
      .neq('player_id', '');

    if (devicesError) {
      console.error('Error loading user_devices for edge dispatch:', devicesError);
      return;
    }

    const latestPlayerByUser = new Map<string, string>();
    (devices || [])
      .sort((a, b) => (new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()))
      .forEach((d) => {
        if (!latestPlayerByUser.has(d.user_id) && d.player_id) {
          latestPlayerByUser.set(d.user_id, d.player_id);
        }
      });

    const calls: Promise<unknown>[] = [];
    for (const userId of userIds) {
      const player_id = latestPlayerByUser.get(userId) || '';
      calls.push(
        supabase.functions.invoke('send-push', {
          body: {
            player_id,
            title: title || '',
            message: message || '',
            user_id: userId,
          },
        })
      );
    }

    const results = await Promise.allSettled(calls);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`send-push invoke failed for ${failed} rows`);
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    const q = searchTerm.toLowerCase();
    const msg = typeof notification.message === "string" ? notification.message : "";
    const title = typeof notification.title === "string" ? notification.title : "";
    const email = typeof notification.users?.email === "string" ? notification.users.email : "";
    const matchesSearch =
      msg.toLowerCase().includes(q) || title.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    const matchesType = typeFilter === 'všechny' || notification.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "info":
        return <Badge variant="info">Info</Badge>;
      case "warning":
        return <Badge variant="warning">Varování</Badge>;
      case "success":
        return <Badge variant="success">Úspěch</Badge>;
      case "error":
        return <Badge variant="destructive">Chyba</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
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
                  <Bell className="h-5 w-5" />
                  Správa notifikací
                </CardTitle>
                <CardDescription>
                  Odeslání push přes Edge Function send-push (záznam v push_log). Správa záznamů v tabulce notifikací.
                </CardDescription>
              </div>
              <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nová notifikace
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Vytvořit novou notifikaci</DialogTitle>
                    <DialogDescription>
                      Vytvořte notifikaci pro konkrétního uživatele nebo všechny uživatele
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="userEmail">Email uživatele (prázdné = všichni)</Label>
                      <Input
                        id="userEmail"
                        value={newNotification.userEmail}
                        onChange={(e) => setNewNotification(prev => ({ ...prev, userEmail: e.target.value }))}
                        placeholder="user@example.com nebo prázdné pro všechny"
                      />
                    </div>
                    <div>
                      <Label htmlFor="type">Typ notifikace</Label>
                      <Select 
                        value={newNotification.type} 
                        onValueChange={(value) => setNewNotification(prev => ({ ...prev, type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Informační</SelectItem>
                          <SelectItem value="warning">Varování</SelectItem>
                          <SelectItem value="success">Úspěch</SelectItem>
                          <SelectItem value="error">Chyba</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="title">Nadpis</Label>
                      <Input
                        id="title"
                        value={newNotification.title}
                        onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Nadpis notifikace"
                      />
                    </div>
                    <div>
                      <Label htmlFor="message">Zpráva</Label>
                      <Textarea
                        id="message"
                        value={newNotification.message}
                        onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))}
                        placeholder="Text notifikace..."
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Zrušit
                    </Button>
                    {newNotification.userEmail ? (
                      <Button 
                        onClick={createNotification}
                        disabled={!newNotification.message}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Odeslat
                      </Button>
                    ) : (
                      <Button 
                        onClick={sendBulkNotification}
                        disabled={!newNotification.message}
                        variant="secondary"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Odeslat všem
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Hledejte podle zprávy, nadpisu nebo emailu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrovat podle typu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="všechny">Všechny typy</SelectItem>
                  <SelectItem value="info">Informační</SelectItem>
                  <SelectItem value="warning">Varování</SelectItem>
                  <SelectItem value="success">Úspěch</SelectItem>
                  <SelectItem value="error">Chyba</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8">Načítání notifikací...</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Uživatel</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Nadpis</TableHead>
                      <TableHead>Zpráva</TableHead>
                      <TableHead>Vytvořeno</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotifications.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell>{notification.users?.email}</TableCell>
                        <TableCell>{getTypeBadge(notification.type)}</TableCell>
                        <TableCell className="font-medium">{notification.title || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">{notification.message}</TableCell>
                        <TableCell>
                          {new Date(notification.created_at).toLocaleDateString('cs-CZ')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={notification.status === "sent" ? "success" : "pending"}>
                            {notification.status === "sent" ? "Odesláno" : "Čeká"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredNotifications.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                Nenalezeny žádné notifikace podle zadaných kritérií.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
};

export default AdminNotifications;