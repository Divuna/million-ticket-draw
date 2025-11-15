import { useEffect, useState } from "react";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";

export default function Messages() {
  const user = useSupabaseUser();
  const { getUserMessages, sendMessageToAdmin } = useMessages();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadMessages = async () => {
    if (!user?.id) return;
    setLoading(true);
    const msgs = await getUserMessages(user.id);
    setMessages(msgs);
    setLoading(false);
  };

  useEffect(() => {
    loadMessages();
  }, [user]);

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
    <div>
      <MessageForm onSend={handleSendMessage} />
      {loading ? (
        <p>Načítám…</p>
      ) : (
        messages.map((m) => (
          <div key={m.id}>
            <b>{m.title}</b>
            <p>{m.content}</p>
          </div>
        ))
      )}
    </div>
  );
}
