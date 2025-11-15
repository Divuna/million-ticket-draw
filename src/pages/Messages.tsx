import { useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";

export default function Messages() {
  const user = useUser();
  const { getUserMessages, sendMessageToAdmin } = useMessages();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 🔥 Načtení zpráv pro uživatele
  useEffect(() => {
    if (!user?.id) return;
    loadMessages();
  }, [user]);

  const loadMessages = async () => {
    setLoading(true);
    const msgs = await getUserMessages(user.id);
    setMessages(msgs);
    setLoading(false);
  };

  // 🔥 Odeslání zprávy adminovi
  const handleSendMessage = async (content: string, title?: string) => {
    const result = await sendMessageToAdmin(user.id, title || "", content);
    if (result) {
      await loadMessages();
      return true;
    }
    return false;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Zprávy</h1>

      <div className="mb-6">
        <MessageForm onSend={handleSendMessage} />
      </div>

      {loading ? (
        <p>Načítám zprávy...</p>
      ) : messages.length === 0 ? (
        <p>Žádné zprávy.</p>
      ) : (
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="border border-gray-700 rounded-lg p-4 bg-gray-800 text-white">
              <div className="text-sm opacity-70">{new Date(msg.created_at).toLocaleString()}</div>
              <div className="font-semibold">{msg.title}</div>
              <div>{msg.content}</div>
              <div className="text-xs opacity-50 mt-1">Odeslal: {msg.sender}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
