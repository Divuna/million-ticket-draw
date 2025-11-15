import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";

export default function MessagesPage() {
  const { user } = useAuth();
  const { getUserMessages, sendMessageToAdmin, subscribeToMessages } = useMessages();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const msgs = await getUserMessages(user.id);
    setMessages(msgs || []);

    setLoading(false);
  }, [user?.id, getUserMessages]);

  useEffect(() => {
    if (!user?.id) return;
    loadMessages();

    const cleanup = subscribeToMessages(user.id, loadMessages);
    return cleanup;
  }, [user?.id, loadMessages, subscribeToMessages]);

  const handleSend = async (content: string, title?: string) => {
    const ok = await sendMessageToAdmin(user.id, title || "", content);
    if (ok) await loadMessages();
    return ok;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-foreground">Zprávy</h1>

      <MessageForm onSubmit={handleSend} />

      {loading ? (
        <p className="opacity-80 mt-4">Načítám...</p>
      ) : messages.length === 0 ? (
        <p className="opacity-50 mt-4">Žádné zprávy</p>
      ) : (
        <div className="mt-4 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="p-3 rounded border border-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">
                  {m.sender === "admin" ? "👨‍💼 Admin" : "👤 Vy"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
              {m.title && <div className="font-bold mb-1">{m.title}</div>}
              <div className="text-foreground">{m.content}</div>
              {m.sender === "admin" && m.read !== true && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">
                    • Nová zpráva
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
