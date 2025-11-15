import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";
import { supabase } from "@/integrations/supabase/client";

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const { getUserMessages, sendMessageToAdmin } = useMessages();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || authLoading) return;
    console.log('👤 User logged in, loading messages...');
    loadMessages();
  }, [user?.id, authLoading]);

  const loadMessages = async () => {
    if (!user?.id) {
      console.warn('⚠️ Cannot load messages: no user');
      return;
    }
    setLoading(true);

    const msgs = await getUserMessages(user.id);
    setMessages(msgs || []);

    setLoading(false);
  };

  const handleSend = async (content: string, title?: string) => {
    if (!user?.id) {
      console.error('❌ Cannot send message: no user');
      return false;
    }
    const ok = await sendMessageToAdmin(user.id, title || "", content);
    if (ok) await loadMessages();
    return ok;
  };

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user?.id) return;

    console.log('🔔 Setting up real-time subscription for messages...');

    const channel = supabase
      .channel('user-messages-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        console.log('📬 Real-time message update:', payload);
        loadMessages();
      })
      .subscribe();

    return () => {
      console.log('🧹 Cleaning up messages subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <div className="p-6 text-white max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Zprávy</h1>

      <MessageForm onSubmit={handleSend} />

      {loading ? (
        <p className="opacity-80 mt-4">Načítám...</p>
      ) : messages.length === 0 ? (
        <p className="opacity-50 mt-4">Žádné zprávy</p>
      ) : (
        <div className="mt-4 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="p-3 rounded border border-gray-700 bg-gray-900">
              <div className="text-xs opacity-60 mb-1">
                {new Date(m.created_at).toLocaleString()} {" · "}
                {m.sender}
              </div>
              <div className="font-bold">{m.title}</div>
              <div>{m.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
