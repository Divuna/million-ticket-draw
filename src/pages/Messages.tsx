import { useEffect, useState } from "react";
import { useSupabaseUser } from "@/lib/auth";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";

export default function MessagesPage() {
  const { user } = useSupabaseUser();
  const { getUserMessages, sendMessageToAdmin } = useMessages();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    loadMessages();
  }, [user]);

  const loadMessages = async () => {
    if (!user?.id) return;
    setLoading(true);
    const msgs = await getUserMessages(user.id);
    setMessages(msgs);
    setLoading(false);
  };

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
    <div className="p-4 space-y-4">
      <MessageForm onSend={handleSendMessage} />

      {loading ? (
        <p>Načítám zprávy...</p>
      ) : messages.length === 0 ? (
        <p>Žádné zprávy</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="p-3 rounded border border-gray-700 bg-gray-900">
              <div className="text-xs opacity-70">{new Date(m.created_at).toLocaleString()}</div>
              <div className="font-bold">{m.title}</div>
              <div>{m.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
