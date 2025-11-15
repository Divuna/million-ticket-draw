import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageForm } from "@/components/MessageForm";

type Message = {
  id: string;
  user_id: string;
  sender: string;
  title: string | null;
  content: string;
  created_at: string;
  read: boolean | null;
  category: string | null;
};

export default function MessageDetail() {
  const [message, setMessage] = useState<Message | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const messageId = params.get("id");

  useEffect(() => {
    if (!messageId) return;
    loadMessage(messageId);
  }, [messageId]);

  const loadMessage = async (id: string) => {
    setLoading(true);

    const { data: msg } = await supabase.from("messages").select("*").eq("id", id).single();

    if (msg) {
      setMessage(msg);

      const { data: threadData } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", msg.user_id)
        .order("created_at", { ascending: true });

      if (threadData) setThread(threadData);
    }

    setLoading(false);
  };

  const handleReply = async (content: string, title?: string) => {
    if (!message) return false;

    const { error } = await supabase.from("messages").insert({
      user_id: message.user_id,
      sender: "admin",
      title: title || "",
      content,
    });

    if (error) return false;

    await loadMessage(message.id);
    return true;
  };

  if (!messageId) {
    return (
      <div className="p-6 text-white">
        <h1 className="text-xl font-bold">Detail zprávy</h1>
        <p className="opacity-70 text-sm mt-2">Chybí parametr ID.</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-3xl mx-auto space-y-6">
      {loading && <p className="opacity-70">Načítám…</p>}

      {message && (
        <div className="p-4 rounded border border-gray-700 bg-gray-900">
          <div className="text-xs opacity-60 mb-1">
            {new Date(message.created_at).toLocaleString()} · {message.sender}
          </div>
          {message.title && <div className="font-bold text-lg mb-2">{message.title}</div>}
          <div>{message.content}</div>
        </div>
      )}

      {thread.length > 0 && (
        <div className="p-4 rounded border border-gray-700 bg-gray-900 space-y-3">
          {thread.map((m) => (
            <div
              key={m.id}
              className={`max-w-xl p-3 rounded border text-sm ${
                m.sender === "admin" ? "ml-auto bg-blue-900/40 border-blue-700" : "mr-auto bg-gray-800 border-gray-700"
              }`}
            >
              <div className="text-xs opacity-60 mb-1">
                {new Date(m.created_at).toLocaleString()} · {m.sender}
              </div>
              {m.title && <div className="font-bold mb-1">{m.title}</div>}
              <div>{m.content}</div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-gray-700 rounded bg-gray-900 p-4">
        <h2 className="font-bold mb-3">Odpovědět zákazníkovi</h2>
        <MessageForm onSubmit={handleReply} placeholder="Odpovědět…" />
      </div>
    </div>
  );
}
