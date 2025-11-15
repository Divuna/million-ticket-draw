import { useEffect, useState } from "react";
import { useSupabaseUser } from "@/hooks/useUserRole";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function MessagesPage() {
  const user = useSupabaseUser();
  const { getUserMessages, sendMessageToAdmin } = useMessages();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔵 Nahrávat zprávy po přihlášení
  useEffect(() => {
    if (!user?.id) return;
    loadMessages();
  }, [user]);

  const loadMessages = async () => {
    setLoading(true);
    const msgs = await getUserMessages();
    setMessages(msgs);
    setLoading(false);
  };

  const handleSendMessage = async (content: string, title?: string) => {
    const result = await sendMessageToAdmin(title || "", content);
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
          {loading ? (
            <p>Načítání…</p>
          ) : messages.length === 0 ? (
            <p>Žádné zprávy</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="p-3 border rounded-md bg-background/50">
                  <h3 className="font-semibold">{msg.title}</h3>
                  <p className="text-sm opacity-80">{msg.content}</p>
                  <p className="text-xs mt-1 opacity-50">{new Date(msg.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Formulář pro odeslání */}
          <div className="mt-6">
            <MessageForm onSend={handleSendMessage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
