import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAdminMessageThread } from "@/hooks/useAdminMessages";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function AdminMessageThread() {
  const { userId } = useParams();
  const { messages, loading, userInfo, sendAdminReply, refetch } = useAdminMessageThread(userId || "");

  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // AUTO SCROLL BOTTOM
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const ok = await sendAdminReply(newMessage);
    if (!ok) {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu.",
        variant: "destructive",
      });
      return;
    }

    setNewMessage("");
    await refetch();
    scrollToBottom();
  };

  return (
    <div className="flex flex-col h-full pb-24 p-4">
      {/* USER INFO */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{userInfo?.email ?? "Neznámý uživatel"}</h2>
      </div>

      {/* MESSAGE LIST */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
        {loading ? (
          <p className="text-gray-400 mt-20 text-center">Načítání…</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-400 mt-20 text-center">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => (
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
          ))
        )}
      </div>

      {/* FIXED INPUT BAR */}
      <div className="fixed bottom-20 left-0 right-0 px-4 py-4 bg-[#0f0f11] border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište odpověď…"
          className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        />
        <button
          onClick={handleSend}
          className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
