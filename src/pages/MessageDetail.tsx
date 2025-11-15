import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/supabase";
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

  const searchParams = new URLSearchParams(window.location.search);
  const messageId = searchParams.get("id");

  useEffect(() => {
    if (!messageId) return;
    loadMessageAndThread(messageId);
  }, [messageId]);

  const loadMessageAndThread = async (id: string) => {
    setLoading(true);

    const { data: msgData, error: msgError } = await supabase.from("messages").select("*").eq("id", id).single();

    if (!msgError && msgData) {
      const baseMessage = msgData as Message;
      setMessage(baseMessage);

      const { data: threadData, error: threadError } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", baseMessage.user_id)
        .order("created_at", { ascending: true });

      if (!threadError && threadData) {
        setThread(threadData as Message[]);
      }
    }

    setLoading(false);
  };

  const handleAdminReply = async (content: string, title?: string) => {
    if (!message) return false;

    const { error } = await supabase.from("messages").insert({
      user_id: message.user_id,
      sender: "admin",
      title: title || "",
      content,
    });

    if (error) return false;

    await loadMessageAndThread(message.id);
    return true;
  };

  if (!messageId) {
    return (
      <div className="p-6 text-white max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Detail zprávy</h1>
        <p className="opacity-70 text-sm">Chybí parametr id v URL.</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold mb-2">Detail zprávy</h1>

      {loading && <p className="opacity-70 text-sm">Načítám…</p>}

      {message && (
        <div className="p-4 rounded border border-gray-700 bg-gray-900 space-y-1">
          <div className="text-xs opacity-60">
            ID: <span className="font-mono">{message.id}</span>
          </div>
          <div className="text-xs opacity-60">
            Uživatel: <span className="font-mono">{message.user_id}</span>
          </div>
          <div className="text-xs opacity-60">
            Vytvořeno: {new Date(message.created_at).toLocaleString()} · {message.sender}
          </div>
          {message.title && message.title.trim() !== "" && <div className="font-bold mt-2">{message.title}</div>}
          <div>{message.content}</div>
        </div>
      )}

      {thread.length > 0 && (
        <div className="border border-gray-700 rounded bg-gray-900">
          <div className="px-4 py-3 border-b border-gray-700 font-bold">Konverzace se zákazníkem</div>
          <div className="p-4 space-y-3">
            {thread.map((m) => (
              <div
                key={m.id}
                className={`max-w-xl p-3 rounded border text-sm ${
                  m.sender === "admin"
                    ? "ml-auto bg-blue-900/40 border-blue-700"
                    : "mr-auto bg-gray-800 border-gray-700"
                }`}
              >
                <div className="text-xs opacity-60 mb-1">
                  {new Date(m.created_at).toLocaleString()} · {m.sender}
                </div>
                {m.title && m.title.trim() !== "" && <div className="font-bold mb-1">{m.title}</div>}
                <div>{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-gray-700 rounded bg-gray-900 p-4">
        <h2 className="font-bold mb-3 text-lg">Odpovědět zákazníkovi</h2>
        <MessageForm onSubmit={handleAdminReply} placeholder="Odpověď zákazníkovi…" />
      </div>
    </div>
  );
}
