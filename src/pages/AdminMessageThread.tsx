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

export default function AdminMessageThread() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);

  useEffect(() => {
    loadLatestMessages();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    loadThread(selectedUserId);
  }, [selectedUserId]);

  const loadLatestMessages = async () => {
    setLoading(true);

    const { data } = await supabase.from("messages").select("*").order("created_at", { ascending: false });

    if (data) setMessages(data as Message[]);
    setLoading(false);
  };

  const loadThread = async (userId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (data) setThreadMessages(data as Message[]);
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
  };

  const handleAdminReply = async (content: string, title?: string) => {
    if (!selectedUserId) return false;

    const { error } = await supabase.from("messages").insert({
      user_id: selectedUserId,
      sender: "admin",
      title: title || "",
      content,
    });

    if (error) return false;

    await loadThread(selectedUserId);
    await loadLatestMessages();
    return true;
  };

  const users = Array.from(
    new Map(
      messages.map((m) => [
        m.user_id,
        {
          user_id: m.user_id,
          last_message: m.content,
          last_sender: m.sender,
          last_created_at: m.created_at,
        },
      ]),
    ).values(),
  );

  return (
    <div className="p-6 text-white max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 border border-gray-700 rounded bg-gray-900">
        <div className="px-4 py-3 border-b border-gray-700 font-bold">Zákazníci</div>

        {loading ? (
          <div className="p-4 text-sm opacity-70">Načítám…</div>
        ) : users.length === 0 ? (
          <div className="p-4 text-sm opacity-70">Žádné zprávy</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {users.map((u) => (
              <button
                key={u.user_id}
                onClick={() => handleSelectUser(u.user_id)}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-800 ${
                  selectedUserId === u.user_id ? "bg-gray-800" : ""
                }`}
              >
                <div className="font-mono text-xs opacity-70">{u.user_id}</div>
                <div className="text-xs opacity-60">
                  {new Date(u.last_created_at).toLocaleString()} · {u.last_sender}
                </div>
                <div className="text-sm truncate">{u.last_message}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="md:col-span-2 border border-gray-700 rounded bg-gray-900 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-700 font-bold">
          {selectedUserId ? "Konverzace se zákazníkem" : "Vyberte zákazníka vlevo"}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {selectedUserId && threadMessages.length === 0 && (
            <div className="text-sm opacity-70">Žádné zprávy v této konverzaci.</div>
          )}

          {selectedUserId &&
            threadMessages.map((m) => (
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

        {selectedUserId && (
          <div className="border-t border-gray-700 p-4">
            <MessageForm onSubmit={handleAdminReply} placeholder="Odpovědět zákazníkovi…" />
          </div>
        )}
      </div>
    </div>
  );
}
