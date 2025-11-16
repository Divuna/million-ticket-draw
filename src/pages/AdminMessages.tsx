import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminMessages } from '@/hooks/useAdminMessages';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, Users, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AdminMessages() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { conversations, loading } = useAdminMessages();
  const navigate = useNavigate();
  const [directOpen, setDirectOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [users, setUsers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name')
      .order('email');
    
    if (!error && data) {
      setUsers(data);
    }
    setLoadingUsers(false);
  };

  const handleDirectMessage = async () => {
    if (!selectedUserId || !messageContent.trim()) {
      toast({
        title: 'Chyba',
        description: 'Vyberte uživatele a napište zprávu',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.from('messages').insert({
      user_id: selectedUserId,
      sender: 'admin',
      title: messageTitle || null,
      content: messageContent,
      parent_message_id: null,
    });

    if (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat zprávu',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Úspěch',
        description: 'Zpráva byla odeslána',
      });
      setDirectOpen(false);
      setSelectedUserId('');
      setMessageContent('');
      setMessageTitle('');
    }
  };

  const handleBroadcastMessage = async () => {
    if (!messageContent.trim()) {
      toast({
        title: 'Chyba',
        description: 'Napište zprávu',
        variant: 'destructive',
      });
      return;
    }

    setLoadingUsers(true);
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id');

    if (usersError || !allUsers) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst uživatele',
        variant: 'destructive',
      });
      setLoadingUsers(false);
      return;
    }

    const messages = allUsers.map((u) => ({
      user_id: u.id,
      sender: 'admin',
      title: messageTitle || null,
      content: messageContent,
      parent_message_id: null,
    }));

    const { error } = await supabase.from('messages').insert(messages);
    setLoadingUsers(false);

    if (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat zprávy',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Úspěch',
        description: `Zpráva byla odeslána ${allUsers.length} uživatelům`,
      });
      setBroadcastOpen(false);
      setMessageContent('');
      setMessageTitle('');
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pb-24">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pb-24">
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-destructive text-center">Nemáte oprávnění k přístupu.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 pb-24">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Admin Zprávy</h1>
          <p className="text-muted-foreground">Správa konverzací s uživateli</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="pt-6 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Zatím nejsou žádné zprávy</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {conversations.map((conv) => (
              <Card
                key={conv.user_id}
                className="ticket-message ticket-perforations hover:border-primary/50 transition-all cursor-pointer"
                onClick={() => navigate(`/admin/messages/${conv.user_id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {conv.user_name || conv.user_email}
                          {conv.unread_count > 0 && (
                            <Badge variant="destructive" className="ml-2">
                              {conv.unread_count} nových
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground truncate">{conv.user_email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {format(new Date(conv.last_message_date), 'dd.MM.yyyy HH:mm', { locale: cs })}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{conv.last_message_content}</p>
                  <Button variant="ghost" size="sm" className="mt-3 w-full">
                    Zobrazit konverzaci →
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <AdminMenu />
    </div>
  );
}
