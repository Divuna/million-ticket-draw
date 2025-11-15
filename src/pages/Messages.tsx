import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useMessages } from "@/hooks/useMessages";
import { useUser } from "@/hooks/useUser";

import MessageForm from "@/components/MessageForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MessagesPage() {
  const { user } = useUser();
  const { getUserMessages, sendMessageToAdmin } = useMessages();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 🔥 Funkce pro načtení zpráv
  const loadMessages = async () => {
    if (!user?.id) return;

    setLoading(true);
    const msgs = await getUserMessages(user.id);
    setMessages(msgs);
    setLoading(false);
  };

  // 🔥 Načíst zprávy při otevření stránky
  useEffect(() => {
    loadMessages();
  }, [user]);

  // 🔥 Odeslání zprávy adminovi
  const handleSendMessage = async (content: string, title?: string) => {
    if (!user?.id) return false;

    const result = await sendMessageToAdmin(user.id, title || "", content);
    if (result) {
      await loadMessages();
      return true;
    }
    return false;
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Zprávy</CardTitle>
        </CardHeader>

        <CardContent>
          <MessageForm onSend={handleSendMessage} />

          {loading && <p className="mt-4 text-muted-foreground">Načítám…</p>}

          {!loading && messages.length === 0 && <p className="mt-4 text-center text-muted-foreground">Žádné zprávy</p>}

          <div className="mt-6 space-y-4">
            {messages.map((msg) => (
              <Card key={msg.id}>
                <CardHeader>
                  <CardTitle>{msg.title || "Bez názvu"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{msg.content}</p>
                  <div className="text-xs text-muted-foreground mt-2">{new Date(msg.created_at).toLocaleString()}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
