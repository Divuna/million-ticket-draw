import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminMenu } from '@/components/AdminMenu';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminMessages } from '@/hooks/useAdminMessages';
import { useUserRole } from '@/hooks/useUserRole';
import { MessageCircle, User, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface User {
  id: string;
  email: string;
  name: string | null;
}

export default function AdminMessages() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { conversations, loading, refetch } = useAdminMessages();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sending, setSending] = useState(false);
  
  const [recipient, setRecipient] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (isModalOpen && users.length === 0) {
      fetchUsers();
    }
  }, [isModalOpen]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name')
        .order('email');
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst seznam uživatelů',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSend = async () => {
    if (!recipient || !content.trim()) {
      toast({
        title: 'Chyba',
        description: 'Vyplňte prosím příjemce a obsah zprávy',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const messageData = {
        sender: 'admin',
        title: title.trim() || null,
        content: content.trim(),
        category: 'support',
        parent_message_id: null,
        read: false,
      };

      if (recipient === 'all') {
        // Send to all users
        const messages = users.map(user => ({
          ...messageData,
          user_id: user.id,
        }));

        const { error } = await supabase
          .from('messages')
          .insert(messages);

        if (error) throw error;
      } else {
        // Send to single user
        const { error } = await supabase
          .from('messages')
          .insert({
            ...messageData,
            user_id: recipient,
          });

        if (error) throw error;
      }

      toast({
        title: 'Úspěch',
        description: 'Zpráva byla odeslána',
      });

      setIsModalOpen(false);
      setRecipient('');
      setTitle('');
      setContent('');
      refetch();
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat zprávu',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!isAdmin) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AdminMenu />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Zprávy od uživatelů</h1>
            <p className="text-muted-foreground mt-1">
              Správa konverzací s uživateli
            </p>
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nová zpráva
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Nová zpráva</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="recipient">Příjemce</Label>
                  <Select value={recipient} onValueChange={setRecipient} disabled={loadingUsers}>
                    <SelectTrigger id="recipient">
                      <SelectValue placeholder="Vyberte příjemce..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Všem uživatelům</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Předmět (nepovinné)</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Předmět zprávy..."
                    disabled={sending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Obsah zprávy</Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Napište zprávu..."
                    rows={6}
                    disabled={sending}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={sending}
                >
                  Zrušit
                </Button>
                <Button onClick={handleSend} disabled={sending || !recipient || !content.trim()}>
                  {sending ? 'Odesílám...' : 'Odeslat'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="pt-6 text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">Zatím nejsou žádné zprávy</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <Card 
                key={conv.user_id}
                className="border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/admin/messages/${conv.user_id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">
                          {conv.user_name || conv.user_email}
                        </span>
                        {conv.unread_count > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {conv.unread_count} nepřečtených
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {conv.last_message_content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(conv.last_message_date), 'd. M. yyyy HH:mm', { locale: cs })}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Otevřít
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
