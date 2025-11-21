import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  created_at: string;
  read: boolean;
}

export default function AdminMessageThread() {
  const { userId } = useParams();
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

  const loadMessages = async () => {
    if (!userId) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setMessages(data || []);

    // Mark all user messages as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("sender", "user")
      .eq("read", false);

    setLoading(false);
  };

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel("admin-thread")
      .on("postgres_changes", { event: "*", table: "messages", schema: "public", filter: `user_id=eq.${userId}` }, () =>
        loadMessages(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: newMessage.trim(),
      read: false,
      topic: "support",
      extension: "onemil",
      payload: {},
      event: "admin_reply",
      private: false,
    });

    if (error) {
      toast({ title: "Chyba", description: "Zprávu nelze odeslat", variant: "destructive" });
      return;
    }

    setNewMessage("");
    loadMessages();
  };

  return (
    <div className="flex flex-col h-[100vh] bg-[#0b0d11] p-4 pb-24">
      {/* MESSAGES */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
        {loading && messages.length === 0 ? (
          <p className="text-gray-500 mt-10 text-center">Načítání zpráv…</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-500 mt-10 text-center">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[70%] p-3 rounded-xl ${
                msg.sender === "admin"
                  ? "bg-blue-600/30 text-blue-100 self-end"
                  : "bg-gray-700/40 text-gray-100 self-start"
              }`}
            >
              <p>{msg.content}</p>
              <p className="text-xs mt-1 text-gray-400">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>

      {/* INPUT AT BOTTOM */}
      <div className="mt-4 flex gap-2">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište odpověď…"
          className="flex-1 bg-gray-800 text-gray-200 p-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        />
        <button onClick={handleSend} className="px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          Odeslat
        </button>
      </div>
    </div>
  );
}
