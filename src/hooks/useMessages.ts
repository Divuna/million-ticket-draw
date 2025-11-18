import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export const useMessages = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔵 Načti zprávy uživatele
  const getUserMessages = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("LOAD MESSAGES ERROR:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst zprávy.",
        variant: "destructive",
      });
    } else {
      setMessages(data || []);
    }

    setLoading(false);
  }, [user]);

  // 🔵 Odeslání zprávy od zákazníka
  const sendMessageToAdmin = async (content: string) => {
    if (!user) {
      toast({
        title: "Chyba",
        description: "Musíte být přihlášený.",
        variant: "destructive",
      });
      return false;
    }

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      sender: "user",
      content: content.trim(),
    });

    if (error) {
      console.error("SEND MESSAGE ERROR:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // 🔵 Realtime odběr
  const subscribeToMessages = useCallback(() => {
    if (!user) return;

    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        () => {
          getUserMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, getUserMessages]);

  // Auto-load
  useEffect(() => {
    getUserMessages();
  }, [getUserMessages]);

  // Auto-subscribe
  useEffect(() => {
    const cleanup = subscribeToMessages();
    return () => cleanup && cleanup();
  }, [subscribeToMessages]);

  return {
    messages,
    loading,
    getUserMessages,
    sendMessageToAdmin,
    subscribeToMessages,
  };
};
