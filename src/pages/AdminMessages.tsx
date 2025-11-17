import { useNavigate } from 'react-router-dom';
import { AdminMenu } from '@/components/AdminMenu';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAdminMessages } from '@/hooks/useAdminMessages';
import { useUserRole } from '@/hooks/useUserRole';
import { MessageCircle, User } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

export default function AdminMessages() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { conversations, loading } = useAdminMessages();

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Zprávy od uživatelů</h1>
          <p className="text-muted-foreground mt-1">
            Správa konverzací s uživateli
          </p>
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
