console.log("🔥🔥🔥 TOTO JE TEN SPRAVNY FILE - Messages.tsx");

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/hooks/useMessages";

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [user, setUser] = useState(null);

  const load = async () => {
    console.log("Loading messages...");
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      setUser(userData.user);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });
      setMessages(data || []);
    }
  };

  useEffect(() => {
    const load = async () => {
      console.log("🔥 MessagesPage LOADING…");

      const { data: user, error: authError } = await supabase.auth.getUser();
      console.log("👤 USER:", user?.user?.id);
      console.log("AUTH ERROR:", authError);

      if (!user?.user?.id) {
        console.log("❌ Žádný user → Nenačítám zprávy.");
        return;
      }

      const { data, error } = await supabase.from("messages").select("*").eq("user_id", user.user.id);

      console.log("📩 ZPRÁVY:", data);
      console.log("⚠️ ERROR:", error);

      setMessages(data || []);
    };

    const handleSend = async () => {
      console.log("Sending message as user:", user?.id);

      if (!user?.id) {
        console.error("Cannot send message - user.id is missing");
        return;
      }

      setSending(true);
      try {
        const { sendMessageToAdmin } = useMessages();
        const { data, error } = await sendMessageToAdmin(user.id, title, content);

        if (error) {
          console.error("Error sending message:", error);
        } else {
          console.log("Message sent successfully!", data);
          setTitle("");
          setContent("");
          await load();
        }
      } catch (err) {
        console.error("Send failed:", err);
      } finally {
        setSending(false);
      }
    };

    load();
  }, []);

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4">📨 Zprávy ({messages.length})</h1>

      {messages.length === 0 && <p className="text-muted-foreground">Žádné zprávy</p>}

      {messages.map((m) => (
        <div key={m.id} className="border border-white/20 bg-white/10 p-3 rounded mb-2">
          <div className="font-bold">{m.title}</div>
          <div>{m.content}</div>

          {/* Formulář pro odesílání zprávy */}
          <div className="mt-6 border-t border-white/20 pt-4">
            <h2 className="text-lg font-bold mb-3">📤 Poslat zprávu</h2>
            <input
              type="text"
              placeholder="Titulek (volitelně)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 mb-2 bg-white/10 border border-white/20 rounded text-white placeholder-white/50"
            />
            <textarea
              placeholder="Zpráva"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-2 mb-2 bg-white/10 border border-white/20 rounded text-white placeholder-white/50 min-h-24"
            />
            <button
              onClick={handleSend}
              disabled={sending || !content}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {sending ? "Odesílám..." : "Odeslat zprávu"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
