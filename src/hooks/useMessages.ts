import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export const useMessages = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const getUserMessages = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("id, user_id, content, sender, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst zprávy",
        variant: "destructive",
      });
    } else {
      setMessages(data || []);
    }

    setLoading(false);
  }, [user]);

  const sendMessageToAdmin = async (content: string) => {
    if (!user) {
      toast({
        title: "Chyba",
        description: "Musíte být přihlášený",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase.from("messages").insert({
        user_id: user.id,
        sender: "user",
        content: content.trim(),
        read: false,
      });

      if (error) throw error;

      await getUserMessages();
      return true;
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return false;
    }
  };

  const sendAdminReply = async (content: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase.from("messages").insert({
        user_id: user.id,
        sender: "admin",
        content: content.trim(),
        read: false,
      });

      if (error) throw error;

      await getUserMessages();
      return true;
    } catch (error: any) {
      console.error("Error sending admin reply:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return false;
    }
  };

  const subscribeToMessages = useCallback(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-messages-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${user.id}`,
        },
        () => getUserMessages(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, getUserMessages]);

  useEffect(() => {
    const cleanup = subscribeToMessages();
    return () => cleanup && cleanup();
  }, [subscribeToMessages]);

  return {
    messages,
    loading,
    sendMessageToAdmin,
    sendAdminReply,
  };
};
