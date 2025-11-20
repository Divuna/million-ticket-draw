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
      if (recipient === 'all') {
        const messages = users.map(user => ({
          user_id: user.id,
          sender: 'admin',
          content: content.trim(),
          read: false,
          topic: 'support',
          extension: 'onemil',
          payload: {},
          event: 'admin_broadcast',
          private: false,
        }));

        const { error } = await supabase
          .from('messages')
          .insert(messages);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('messages')
          .insert({
            user_id: recipient,
            sender: 'admin',
            content: content.trim(),
            read: false,
            topic: 'support',
            extension: 'onemil',
            payload: {},
            event: 'admin_message',
            private: false,
          });

        if (error) throw error;
      }

      toast({
        title: 'Úspěch',
        description: 'Zpráva byla odeslána',
      });

      setIsModalOpen(false);
      setRecipient('');
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-full" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {conversations.map((conv) => (
              <Card 
                key={conv.user_id}
                className={`rounded-full transition-all duration-200 cursor-pointer hover:scale-105 hover:shadow-lg ${
                  conv.unread_count > 0 
                    ? 'border-2 border-destructive shadow-md' 
                    : 'border-border/50 hover:border-primary/50'
                }`}
                onClick={() => navigate(`/admin/messages/${conv.user_id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-foreground text-sm truncate max-w-[180px]">
                        {conv.user_name || conv.user_email}
                      </span>
                    </div>
                    
                    {conv.unread_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {conv.unread_count} nepřečtených
                      </Badge>
                    )}
                    
                    <p className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]">
                      {conv.last_message_content}
                    </p>
                    
                    <p className="text-xs text-muted-foreground/70">
                      {format(new Date(conv.last_message_date), 'd. M. yyyy HH:mm', { locale: cs })}
                    </p>
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
