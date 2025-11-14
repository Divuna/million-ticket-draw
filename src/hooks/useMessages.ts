import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function useMessages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  async function loadMessages() {
    try {
      setLoading(true);

      // 🔥 ZÍSKÁNÍ USERA
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // 🔥 SELECT Z PRAVÉ TABULKY
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id) // správná identifikace zpráv
        .order("created_at", { ascending: false });

      if (error) throw error;

      setMessages(data || []);
    } catch (err: any) {
      console.error("loadMessages ERROR:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  // 🔥 ODESLÁNÍ ZPRÁVY (jen kdyby UI používalo)
  async function sendMessage(content: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      sender: "admin",
      title: "Zpráva od administrátora",
      content,
      category: "system",
    });

    if (error) throw error;

    loadMessages();
  }

  return { messages, loading, error, sendMessage, reload: loadMessages };
}
