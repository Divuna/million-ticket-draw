"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function AdminMessageThread() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id as string;

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll dolů
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  // Načtení zpráv
  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst zprávy.",
        variant: "destructive",
      });
      return;
    }

    setMessages(data || []);
    setTimeout(scrollToBottom, 100);
  };

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel("admin-thread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${userId}` },
        loadMessages,
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [userId]);

  // Odeslání zprávy
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    setLoading(true);

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: newMessage,
      read: false,
    });

    if (error) {
      toast({
        title: "Chyba",
        description: "Zprávu se nepodařilo odeslat.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setNewMessage("");
    setLoading(false);
    setTimeout(scrollToBottom, 80);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d0f15] text-white">
      {/* TOP BAR */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-4">
        <button onClick={() => router.push("/admin/messages")} className="text-gray-300 hover:text-white">
          ← Zpět
        </button>
        <h2 className="text-lg font-semibold">Neznámý uživatel</h2>
      </div>

      {/* MESSAGE LIST */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-gray-500 mt-20">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[70%] p-3 rounded-xl ${
                msg.sender === "admin"
                  ? "bg-blue-600/30 text-blue-100 self-end ml-auto"
                  : "bg-gray-700/40 text-gray-100 self-start"
              }`}
            >
              <p>{msg.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>

      {/* INPUT BAR */}
      <div className="p-4 border-t border-gray-800 bg-[#0f1118] flex gap-3">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište odpověď…"
          className="flex-1 bg-gray-900 border border-gray-700 p-3 rounded-lg focus:border-blue-500 outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 px-5 rounded-lg disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
