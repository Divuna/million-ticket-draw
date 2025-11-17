import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useMessages(userId: string | undefined) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMessages = async () => {
    if (!userId) return;
    setLoading(true);

    // načteme zprávy
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
      setMessages([]);
      setLoading(false);
      return;
    }

    setMessages(data || []);
    setLoading(false);

    // OZNAČIT ADMIN ZPRÁVY JAKO PŘEČTENÉ
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("sender", "admin")
      .eq("read", false);
  };

  useEffect(() => {
    if (!userId) return;

    loadMessages();

    // unikátní realtime kanál
    const channel = supabase
      .channel(`user-thread-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${userId}`,
        },
        () => loadMessages(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const sendMessage = async (content: string, title?: string) => {
    if (!userId || !content.trim()) return false;

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "user",
      title: title || null,
      content,
      parent_message_id: null,
      category: "support",
      read: false,
    });

    if (error) {
      console.error("Error sending message:", error);
      return false;
    }

    return true;
  };

  return {
    messages,
    loading,
    sendMessage,
    refetch: loadMessages,
  };
}
