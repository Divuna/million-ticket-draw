console.log("🔥 Messages.tsx LOADED");

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pokud se načítá auth → nic nevykresluj
  if (authLoading) {
    return (
      <div className="p-4 text-white">
        <p>Načítám…</p>
      </div>
    );
  }

  // Pokud uživatel není přihlášený
  if (!user) {
    return (
      <div className="p-4 text-white">
        <p>❌ Pro zobrazení zpráv se musíte přihlásit.</p>
      </div>
    );
  }

  useEffect(() => {
    const load = async () => {
      console.log("🔥 MessagesPage loading messages for:", user.id);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      console.log("📩 ZPRÁVY:", data);
      console.log("⚠️ ERROR:", error);

      setMessages(data || []);
      setLoading(false);
    };

    load();
  }, [user]);

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4">📨 Zprávy ({messages.length})</h1>

      {loading && <p>Načítám zprávy…</p>}

      {!loading && messages.length === 0 && <p className="text-muted-foreground">Žádné zprávy</p>}

      {messages.map((m) => (
        <div key={m.id} className="border border-white/20 bg-white/10 p-3 rounded mb-2">
          <div className="font-bold">{m.title}</div>
          <div>{m.content}</div>
        </div>
      ))}
    </div>
  );
}
