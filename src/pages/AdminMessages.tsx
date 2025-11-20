import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  created_at: string;
}

export default function AdminMessageThread() {
  const router = useRouter();
  const { id: userId } = router.query;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [messages]);

  // LOAD MESSAGES
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
      toast({ title: "Chyba", description: "Nelze načíst zprávy", variant: "destructive" });
    } else {
      setMessages(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadMessages();

    if (!userId) return;

    const channel = supabase
      .channel("admin-message-thread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${userId}` },
        loadMessages,
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [userId]);

  // SEND ADMIN REPLY
  const sendReply = async () => {
    if (!reply.trim()) return;

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: reply.trim(),
      read: false,
      topic: "support",
      extension: "onemil",
      payload: {},
      event: "admin_reply",
      private: false,
    });

    if (error) {
      console.error(error);
      toast({ title: "Chyba", description: "Nelze odeslat zprávu", variant: "destructive" });
      return;
    }

    setReply("");
    await loadMessages();
  };

  return (
    <div className="flex flex-col h-full p-4 pb-24">
      {/* MESSAGE LIST */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
        {loading ? (
          <p className="text-gray-400 text-center mt-10">Načítání…</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-400 text-center mt-10">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[70%] p-3 rounded-xl ${
                msg.sender === "admin"
                  ? "self-end bg-blue-600/20 text-blue-100"
                  : "self-start bg-gray-700/40 text-gray-200"
              }`}
            >
              <p>{msg.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>

      {/* INPUT BAR */}
      <div className="fixed bottom-20 left-0 right-0 px-4 py-3 bg-[#0f0f11] border-t border-gray-800 flex gap-2">
        <input
          className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
          placeholder="Napište odpověď…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <button onClick={sendReply} className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          Odeslat
        </button>
      </div>
    </div>
  );
}
