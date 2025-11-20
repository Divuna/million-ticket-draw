"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AdminBottomNav from "@/components/admin/AdminBottomNav";

export default function AdminMessageThread() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll dolů
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

    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setMessages(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel("admin-message-thread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${userId}` }, () =>
        loadMessages(),
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [userId]);

  // Odeslat zprávu
  const sendAdminReply = async () => {
    if (!newMessage.trim()) return;

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: newMessage.trim(),
      read: false,
    });

    if (error) {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu.",
        variant: "destructive",
      });
      return;
    }

    setNewMessage("");
    loadMessages();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 text-gray-200 text-lg font-semibold border-b border-gray-800">
        <button onClick={() => router.push("/admin/messages")} className="mr-2 text-gray-400">
          ← Zpět
        </button>
        Konverzace
      </div>

      {/* ZPRÁVY */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {loading && messages.length === 0 ? (
          <p className="text-gray-400 text-center mt-10">Načítání…</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-400 text-center mt-10">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[75%] p-3 rounded-xl ${
                msg.sender === "admin" ? "self-end bg-blue-600 text-white" : "self-start bg-gray-800 text-gray-200"
              }`}
            >
              <p>{msg.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>

      {/* INPUT */}
      <div className="p-4 fixed bottom-16 left-0 right-0 bg-[#0f0f11] border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište odpověď…"
          className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        />
        <button onClick={sendAdminReply} className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          Odeslat
        </button>
      </div>

      {/* ADMIN BOTTOM NAV */}
      <AdminBottomNav />
    </div>
  );
}
