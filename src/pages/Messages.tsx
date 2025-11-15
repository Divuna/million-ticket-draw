console.log("🔥🔥🔥 MESSAGES.TSX FILE LOADED - OUTSIDE");

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { MessageForm } from "@/components/MessageForm";
import { supabase } from "@/integrations/supabase/client";

export default function MessagesPage() {
  console.log("🚀🚀🚀 MessagesPage RENDERING START");

  const { user } = useAuth();
  console.log("👤👤👤 User from useAuth:", user);

  const { getUserMessages, sendMessageToAdmin, subscribeToMessages } = useMessages();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  // 🔥 DEBUG BLOCK
  useEffect(() => {
    console.log("🔥 useEffect testMessages TRIGGERED");
    const testMessages = async () => {
      console.log("🔥 DEBUG: Test zpráv");

      const { data: authUser, error: authError } = await supabase.auth.getUser();
      console.log("👤 Přihlášený uživatel:", authUser?.user?.id);
      console.log("📧 Email:", authUser?.user?.email);
      console.log("🔑 Auth error:", authError);

      if (!authUser?.user?.id) {
        console.log("❌ Žádný user_id – AUTH NEFUNGUJE");
        return;
      }

      const { data, error } = await supabase.from("messages").select("*").eq("user_id", authUser.user.id);

      console.log("📨 Zprávy data:", data);
      console.log("📊 Počet zpráv:", data?.length);
      console.log("❌ Zprávy error:", error);
    };

    testMessages();
  }, []);
  // 🔥 END DEBUG BLOCK

  // Načtení zpráv
  const loadMessages = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    const msgs = await getUserMessages(user.id);
    setMessages(msgs || []);
    setLoading(false);
  }, [user?.id, getUserMessages]);

  useEffect(() => {
    if (!user?.id) return;

    loadMessages();
    const cleanup = subscribeToMessages(user.id, loadMessages);
    return cleanup;
  }, [user?.id, loadMessages, subscribeToMessages]);

  // Odeslání zprávy
  const handleSend = async (content: string, title?: string) => {
    if (!user?.id) return false;
    const ok = await sendMessageToAdmin(user.id, title || "", content);
    if (ok) await loadMessages();
    return ok;
  };

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4">Zprávy</h1>

      {loading ? (
        <p>Načítám…</p>
      ) : messages.length === 0 ? (
        <p>Žádné zprávy</p>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className="border border-gray-700 p-3 rounded-md bg-gray-900">
              <div className="text-xs text-gray-400">
                {m.sender === "admin" ? "👨‍💼 Admin" : "👤 Vy"} • {new Date(m.created_at).toLocaleString()}
              </div>

              {m.title && <div className="font-bold mt-1">{m.title}</div>}

              <div className="mt-1">{m.content}</div>

              {m.sender === "admin" && m.read !== true && (
                <div className="text-red-400 text-xs mt-1">• Nová zpráva</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <MessageForm onSubmit={handleSend} />
      </div>
    </div>
  );
}
