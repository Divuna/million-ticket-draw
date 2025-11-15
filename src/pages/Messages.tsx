import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";
import { useMessages } from "@/hooks/useMessages";
import { useUser } from "@/hooks/useUser";
import { MessageForm } from "@/components/MessageForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, User, Calendar, Mail, MailOpen } from "lucide-react";

const Messages: React.FC = () => {
  const { isAdmin } = useUserRole();
  const { user } = useUser();
  const navigate = useNavigate();

  const { getUserMessages, sendMessage } = useMessages();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🚀 TADY SE NAČÍTAJÍ ZPRÁVY PRO UŽIVATELE
  useEffect(() => {
    if (!user?.id) return;

    loadMessages();

    async function loadMessages() {
      setLoading(true);
      const msgs = await getUserMessages(user.id);
      setMessages(msgs);
      setLoading(false);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <MessageCircle className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-neon-orange">Zprávy</h1>
          </div>

          <MessageForm onSubmit={sendMessage} />

          <Card className="ticket-message ticket-perforations">
            <CardHeader>
              <CardTitle className="text-neon-orange">Komunikace s administrátorem</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Načítání zpráv...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="h-16 w-16 text-neon-orange mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-neon-orange">Žádné zprávy</h3>
                  <p className="text-muted-foreground">Zde se zobrazí komunikace s administrátorem.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      onClick={() => navigate(`/messages/${message.id}`)}
                      className="p-4 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {message.read ? (
                              <MailOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                            <h3
                              className={`font-semibold truncate ${!message.read ? "text-primary" : "text-foreground"}`}
                            >
                              {message.title || "Zpráva bez předmětu"}
                            </h3>
                          </div>

                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{message.content}</p>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>{message.sender === "admin" ? "Administrátor" : "Já"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(message.created_at).toLocaleString("cs-CZ")}</span>
                            </div>
                          </div>
                        </div>

                        <Badge variant={message.sender === "admin" ? "default" : "secondary"}>
                          {message.sender === "admin" ? "Admin" : "Uživatel"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Messages;
