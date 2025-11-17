import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessages } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { Send, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

export default function Messages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(user?.id);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) {
      toast({
        title: 'Chyba',
        description: 'Zpráva nemůže být prázdná',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    const success = await sendMessage(content);
    setSending(false);

    if (success) {
      setContent('');
      toast({
        title: 'Úspěch',
        description: 'Zpráva byla odeslána',
      });
    } else {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat zprávu',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-6 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Zprávy</h1>
          <p className="text-muted-foreground mt-1">
            Komunikace s administrátory
          </p>
        </div>

        <div className="space-y-6">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Napište zprávu administrátorům..."
                rows={4}
                className="mb-3"
                disabled={sending}
              />
              <Button 
                onClick={handleSend} 
                disabled={sending || !content.trim()}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                {sending ? 'Odesílám...' : 'Odeslat zprávu'}
              </Button>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Historie zpráv</h2>
            
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="pt-6 text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Zatím nejsou žádné zprávy</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <Card 
                    key={msg.id}
                    className={`border-border/50 ${
                      msg.sender === 'admin' 
                        ? 'bg-primary/5 border-primary/20' 
                        : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {msg.sender === 'admin' ? 'Administrátor' : 'Vy'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), 'd. M. yyyy HH:mm', { locale: cs })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
