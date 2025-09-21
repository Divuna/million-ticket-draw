import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Bell, Plus, Send, CheckCircle, Clock, AlertCircle, Search, Users } from 'lucide-react';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  message: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  user: {
    email: string;
    name?: string;
  };
}

interface NotificationForm {
  type: string;
  title: string;
  message: string;
  user_email: string;
  send_to_all: boolean;
}

interface User {
  id: string;
  email: string;
  name?: string;
}

export const AdminNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [notificationForm, setNotificationForm] = useState<NotificationForm>({
    type: 'info',
    title: '',
    message: '',
    user_email: '',
    send_to_all: false
  });

  useEffect(() => {
    fetchNotifications();
    fetchUsers();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          user:users(email, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst notifikace.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name')
        .order('email', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleCreateNotification = async () => {
    if (!notificationForm.message.trim()) {
      toast({
        title: "Chyba",
        description: "Zpráva je povinná.",
        variant: "destructive"
      });
      return;
    }

    if (!notificationForm.send_to_all && !notificationForm.user_email) {
      toast({
        title: "Chyba",
        description: "Vyberte uživatele nebo zašrtněte 'Poslat všem'.",
        variant: "destructive"
      });
      return;
    }

    try {
      if (notificationForm.send_to_all) {
        // Send to all users
        const notificationsToInsert = users.map(user => ({
          user_id: user.id,
          type: notificationForm.type,
          title: notificationForm.title || null,
          message: notificationForm.message,
          status: 'sent'
        }));

        const { error } = await supabase
          .from('notifications')
          .insert(notificationsToInsert);

        if (error) throw error;

        toast({
          title: "Úspěch",
          description: `Notifikace byla odeslána ${users.length} uživatelům.`,
        });
      } else {
        // Send to specific user
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('email', notificationForm.user_email)
          .single();

        if (userError || !userData) {
          toast({
            title: "Chyba",
            description: "Uživatel s tímto emailem nebyl nalezen.",
            variant: "destructive"
          });
          return;
        }

        const { error } = await supabase
          .from('notifications')
          .insert({
            user_id: userData.id,
            type: notificationForm.type,
            title: notificationForm.title || null,
            message: notificationForm.message,
            status: 'sent'
          });

        if (error) throw error;

        toast({
          title: "Úspěch",
          description: "Notifikace byla úspěšně odeslána.",
        });
      }

      // Reset form and refresh data
      setNotificationForm({
        type: 'info',
        title: '',
        message: '',
        user_email: '',
        send_to_all: false
      });
      setShowCreateDialog(false);
      fetchNotifications();

    } catch (error: any) {
      console.error('Error creating notification:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se odeslat notifikaci.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Odesláno</Badge>;
      case 'queued':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Ve frontě</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Selhalo</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      'info': 'bg-blue-500',
      'success': 'bg-green-500',
      'warning': 'bg-yellow-500',
      'error': 'bg-red-500',
      'promotion': 'bg-purple-500',
      'system': 'bg-gray-500'
    };

    const labels = {
      'info': 'Info',
      'success': 'Úspěch',
      'warning': 'Varování',
      'error': 'Chyba',
      'promotion': 'Akce',
      'system': 'Systém'
    };

    return (
      <Badge variant="default" className={colors[type as keyof typeof colors] || 'bg-gray-500'}>
        {labels[type as keyof typeof labels] || type}
      </Badge>
    );
  };

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = 
      notification.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (notification.title && notification.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      notification.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (notification.user.name && notification.user.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || notification.status === statusFilter;
    const matchesType = typeFilter === 'all' || notification.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const totalNotifications = notifications.length;
  const sentNotifications = notifications.filter(n => n.status === 'sent').length;
  const queuedNotifications = notifications.filter(n => n.status === 'queued').length;
  const failedNotifications = notifications.filter(n => n.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem notifikací</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalNotifications}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Odesláno</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{sentNotifications}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ve frontě</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{queuedNotifications}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selhalo</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failedNotifications}</div>
          </CardContent>
        </Card>
      </div>

      {/* Notification Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Správa notifikací
              </CardTitle>
              <CardDescription>
                Odesílejte notifikace uživatelům a spravujte jejich stav
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nová notifikace
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Vytvořit novou notifikaci</DialogTitle>
                  <DialogDescription>
                    Vyplňte údaje pro odeslání notifikace uživatelům
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="type">Typ notifikace</Label>
                      <Select value={notificationForm.type} onValueChange={(value) => setNotificationForm({...notificationForm, type: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="success">Úspěch</SelectItem>
                          <SelectItem value="warning">Varování</SelectItem>
                          <SelectItem value="error">Chyba</SelectItem>
                          <SelectItem value="promotion">Akce</SelectItem>
                          <SelectItem value="system">Systém</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="title">Nadpis (volitelný)</Label>
                      <Input
                        id="title"
                        value={notificationForm.title}
                        onChange={(e) => setNotificationForm({...notificationForm, title: e.target.value})}
                        placeholder="Nadpis notifikace"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">Zpráva *</Label>
                    <Textarea
                      id="message"
                      value={notificationForm.message}
                      onChange={(e) => setNotificationForm({...notificationForm, message: e.target.value})}
                      placeholder="Text notifikace"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="send_to_all"
                        checked={notificationForm.send_to_all}
                        onChange={(e) => setNotificationForm({...notificationForm, send_to_all: e.target.checked, user_email: e.target.checked ? '' : notificationForm.user_email})}
                        className="rounded"
                      />
                      <Label htmlFor="send_to_all" className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Poslat všem uživatelům ({users.length})
                      </Label>
                    </div>

                    {!notificationForm.send_to_all && (
                      <div>
                        <Label htmlFor="user_email">Email uživatele</Label>
                        <Select value={notificationForm.user_email} onValueChange={(value) => setNotificationForm({...notificationForm, user_email: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Vyberte uživatele..." />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.email}>
                                {user.name ? `${user.name} (${user.email})` : user.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Zrušit
                  </Button>
                  <Button onClick={handleCreateNotification}>
                    <Send className="w-4 h-4 mr-2" />
                    Odeslat notifikaci
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Hledat podle zprávy, nadpisu nebo uživatele..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-80"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny stavy</SelectItem>
                <SelectItem value="sent">Odesláno</SelectItem>
                <SelectItem value="queued">Ve frontě</SelectItem>
                <SelectItem value="failed">Selhalo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny typy</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Úspěch</SelectItem>
                <SelectItem value="warning">Varování</SelectItem>
                <SelectItem value="error">Chyba</SelectItem>
                <SelectItem value="promotion">Akce</SelectItem>
                <SelectItem value="system">Systém</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Načítám notifikace...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' 
                  ? 'Žádné notifikace nenalezeny dle zadaných filtrů.' 
                  : 'Žádné notifikace nebyly odeslány.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Uživatel</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Nadpis</TableHead>
                  <TableHead>Zpráva</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vytvořeno</TableHead>
                  <TableHead>Odesláno</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{notification.user.name || 'Bez jména'}</div>
                        <div className="text-sm text-muted-foreground">{notification.user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(notification.type)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {notification.title || '-'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {notification.message}
                    </TableCell>
                    <TableCell>{getStatusBadge(notification.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(notification.created_at).toLocaleString('cs-CZ')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {notification.sent_at 
                        ? new Date(notification.sent_at).toLocaleString('cs-CZ')
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};