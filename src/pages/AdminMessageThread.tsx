import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAdminMessageThread } from '@/hooks/useAdminMessages';
import { useUserRole } from '@/hooks/useUserRole';
import { ArrowLeft, User, Send } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

export default function AdminMessageThread() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { messages, loading, userInfo, sendAdminReply } = useAdminMessageThread(userId);
  const [content, setContent] = useState('');

  const handleSend = async () => {
    if (!content.trim()) return;

    const success = await sendAdminReply(content);
    if (success) {
      setContent('');
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
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </main>
        <AdminMenu />
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
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 pb-24 flex flex-col">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/messages')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zpět na seznam
          </Button>

          {userInfo && (
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {userInfo.name || userInfo.email}
                </h1>
                <p className="text-sm text-muted-foreground">{userInfo.email}</p>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">Zatím nejsou žádné zprávy</p>
                  </CardContent>
                </Card>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        msg.sender === 'admin'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-card border border-border/50 text-card-foreground rounded-bl-sm'
                      }`}
                      style={
                        msg.sender === 'user'
                          ? { boxShadow: 'var(--glow-gold)' }
                          : undefined
                      }
                    >
                      {msg.title && (
                        <p className="text-xs font-semibold mb-1 opacity-80">{msg.title}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-card border border-border/50 rounded-lg p-4 shadow-lg">
              <div className="flex gap-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Napište odpověď..."
                  className="resize-none bg-input border-border/50 focus:border-primary"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!content.trim()}
                  className="self-end bg-primary hover:bg-primary/90"
                  size="icon"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
      <AdminMenu />
    </div>
  );
}
