import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  read: boolean;
  created_at: string;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { sendMessageToAdmin, refetch } = useMessages();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // LOAD MESSAGES
  useEffect(() => {
    const loadMessages = async () => {
      if (!user) return;
      setLoading(true);

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      setMessages(data || []);
      setLoading(false);
    };

    loadMessages();

    const channel = supabase
      .channel("messages-user-thread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user?.id}` },
        () => loadMessages(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  // SEND
  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setLoading(true);
    const ok = await sendMessageToAdmin(newMessage);

    if (ok) {
      setNewMessage("");
      await refetch();
      toast({ title: "Odesláno" });
    } else {
      toast({ title: "Chyba", description: "Odeslání selhalo", variant: "destructive" });
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] p-4 pb-24">
      {/* MESSAGE LIST */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[70%] p-3 rounded-xl ${
              msg.sender === "user"
                ? "bg-blue-600/20 text-blue-100 self-end"
                : "bg-gray-700/40 text-gray-100 self-start"
            }`}
          >
            <p>{msg.content}</p>
            <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* INPUT BAR — ALWAYS VISIBLE */}
      <div className="fixed bottom-20 left-0 right-0 p-4 flex gap-2 bg-[#0f0f11] border-t border-gray-800">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište zprávu..."
          className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="px-5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
