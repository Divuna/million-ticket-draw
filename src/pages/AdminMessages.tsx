import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { AdminMenu } from "@/components/AdminMenu";
import { useAdminMessagesList } from "@/hooks/useAdminMessages";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AdminMessages() {
  const navigate = useNavigate();
  const { conversations, loading } = useAdminMessagesList();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Načítám zprávy...</p>
        </div>
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Správa zpráv</h1>

        <div className="space-y-4">
          {conversations.length === 0 ? (
            <Card className="p-6">
              <p className="text-muted-foreground">Žádné zprávy</p>
            </Card>
          ) : (
            conversations.map((conv) => (
              <Card
                key={conv.user_id}
                className="p-6 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => navigate(`/admin/messages/${conv.user_id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">
                        {conv.user_name || conv.user_email}
                      </h3>
                      {conv.unread_count > 0 && (
                        <Badge variant="destructive">{conv.unread_count}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.last_message_content}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(conv.last_message_date), "dd.MM.yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
      <AdminMenu />
    </div>
  );
}
