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
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // AUTO SCROLL
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
      setError(null);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError("Nepodařilo se načíst zprávy.");
        console.error(error);
      } else {
        setMessages(data || []);
      }

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

    return () => channel.unsubscribe();
  }, [user]);

  // SEND MESSAGE
  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setLoading(true);
    const ok = await sendMessageToAdmin(newMessage);

    if (ok) {
      toast({ title: "Zpráva odeslána", description: "Odesláno úspěšně." });
      setNewMessage("");
      await refetch();
    } else {
      toast({ title: "Chyba", description: "Nepodařilo se odeslat zprávu.", variant: "destructive" });
    }

    setLoading(false);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <p>Přihlaste se pro zobrazení zpráv.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4 pb-4">
      {/* MESSAGE LIST */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto pr-1 pb-32">
        {loading && messages.length === 0 ? (
          <p className="text-center text-gray-400 mt-20">Načítání zpráv…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-400 mt-20">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => (
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
          ))
        )}
      </div>

      {/* INPUT */}
      <div className="flex gap-2 pt-2 border-t border-gray-800 bg-[#0f0f11]">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište zprávu..."
          className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
