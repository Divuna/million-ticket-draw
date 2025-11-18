import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useMessages(userId: string | undefined) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMessages = async () => {
    if (!userId) return;
    setLoading(true);

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

    // Označit admin zprávy jako přečtené
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

    return () => channel.unsubscribe();
  }, [userId]);

  // 🔥 SEND MESSAGE TO ONEMIL + SOFINITY
  const sendMessage = async (content: string, title?: string) => {
    if (!userId || !content.trim()) return false;

    // 1) Uložit v OneMil
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

    // 2) Odeslat do Sofinity
    try {
      await fetch("https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/sofinity-message-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-token": "Jizd287FYEReMXFFVuzXQsTEnOEisbs4khIyOztjZEIiqiGLR1l2VGZQEVCpF4go",
        },
        body: JSON.stringify({
          user_id: userId,
          sender: "user",
          content,
        }),
      });
    } catch (err) {
      console.error("⚠️ Error sending to Sofinity:", err);
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
