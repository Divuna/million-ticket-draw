import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageForm } from '@/components/MessageForm';
import { useAdminMessageThread } from '@/hooks/useAdminMessages';
import { useUserRole } from '@/hooks/useUserRole';
import { ArrowLeft, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

export default function AdminMessageThread() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { messages, loading, userInfo, sendAdminReply } = useAdminMessageThread(userId);

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
            <div className="flex items-center gap-3 mb-2">
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
            <div className="space-y-4 mb-6">
              {messages.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">Zatím nejsou žádné zprávy</p>
                  </CardContent>
                </Card>
              ) : (
                messages.map((msg) => (
                  <Card
                    key={msg.id}
                    className={`ticket-message ticket-perforations ${
                      msg.sender === 'admin' ? 'bg-primary/5 border-primary/30' : ''
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.sender === 'admin' ? 'default' : 'secondary'}>
                            {msg.sender === 'admin' ? 'Admin' : 'Uživatel'}
                          </Badge>
                          {msg.title && (
                            <CardTitle className="text-base">{msg.title}</CardTitle>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <MessageForm
              onSend={sendAdminReply}
              placeholder="Napište odpověď uživateli..."
              showTitle={false}
            />
          </>
        )}
      </main>
      <AdminMenu />
    </div>
  );
}
