import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function AdminMessageThread() {
  const { userId } = useParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll vždy dolů
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Načtení zpráv
  const loadMessages = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
  };

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel("admin-msg-thread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${userId}` }, () =>
        loadMessages(),
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [userId]);

  // Poslat odpověď
  const sendMessage = async () => {
    if (!content.trim()) return;

    setLoading(true);

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: content.trim(),
      read: false,
      topic: "support",
      extension: "onemil",
      payload: {},
      event: "admin_reply",
      private: false,
    });

    if (error) {
      console.error(error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu.",
        variant: "destructive",
      });
    } else {
      setContent("");
      loadMessages();
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full p-4 pb-24">
      {/* ZPĚT NA SEZNAM */}
      <Link to="/admin/messages" className="text-gray-400 mb-4 block">
        ← Zpět na seznam
      </Link>

      {/* ZPRÁVY */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto h-full pr-1 pb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[70%] p-3 rounded-xl ${
              msg.sender === "admin"
                ? "bg-blue-600/20 text-blue-100 self-end"
                : "bg-gray-700/40 text-gray-100 self-start"
            }`}
          >
            <p>{msg.content}</p>
            <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* INPUT BAR — FIXED DOLE A VIDITELNÝ */}
      <div className="fixed bottom-20 left-0 right-0 px-4 py-3 bg-[#0f0f11] border-t border-gray-800 flex gap-2">
        <input
          className="flex-1 p-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:border-blue-500 outline-none"
          placeholder="Napište odpověď…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
