import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAdminMessageThread } from "@/hooks/useAdminMessages";
import { Button } from "@/components/ui/button";

export default function AdminMessageThread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { messages, loading, userInfo, sendAdminReply, refetch } = useAdminMessageThread(id || "");

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

  const handleSend = async () => {
    if (!newMessage.trim() || !id) return;

    const ok = await sendAdminReply(newMessage.trim());
    if (ok) {
      setNewMessage("");
      await refetch();
      scrollToBottom();
    }
  };

  const safeMessages = Array.isArray(messages) ? messages : [];

  return (
    <div className="flex flex-col h-full max-h-screen bg-[#050816] text-white">
      {/* HEADER */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        <button
          onClick={() => navigate("/admin/messages")}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <span className="text-sm text-white/60">Konverzace s uživatelem</span>
          <span className="text-base font-semibold">{userInfo?.email || "Neznámý uživatel"}</span>
        </div>
      </div>

      {/* THREAD */}
      <div className="flex flex-col flex-1 px-6 pt-4 pb-28">
        <div ref={scrollRef} className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
          {loading && safeMessages.length === 0 ? (
            <p className="mt-10 text-center text-white/40">Načítání zpráv…</p>
          ) : safeMessages.length === 0 ? (
            <p className="mt-10 text-center text-white/40">Zatím žádné zprávy.</p>
          ) : (
            safeMessages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[70%] p-3 rounded-2xl text-sm ${
                  msg.sender === "admin" ? "self-end bg-blue-600/80 text-white" : "self-start bg-white/10 text-white"
                }`}
              >
                <p>{msg.content}</p>
                <p className="mt-1 text-[11px] text-white/50">{new Date(msg.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* INPUT BAR – nad spodním admin bottom barem */}
      <div className="fixed bottom-20 left-0 right-0 px-6 pb-4 bg-gradient-to-t from-[#050816] via-[#050816]/95 to-transparent">
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Napište odpověď…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-blue-500"
          />
          <Button
            onClick={handleSend}
            disabled={loading || !newMessage.trim()}
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            Odeslat
          </Button>
        </div>
      </div>
    </div>
  );
}
