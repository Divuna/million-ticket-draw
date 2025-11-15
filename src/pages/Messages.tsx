import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);

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
        </div>
      ))}
    </div>
  );
}
