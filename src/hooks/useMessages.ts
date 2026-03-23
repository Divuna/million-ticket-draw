import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ConversationMessage {
  id: string;
  user_id: string;
  content: string;
  sender: "user" | "admin" | "ai";
  read: boolean;
  created_at: string;
}

export const useMessages = () => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // 🟦 GET USER
  const getUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data?.user || null);
  };

  // 🟦 LOAD USER MESSAGES
  const getUserMessages = async () => {
    if (!user?.id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (!error) setMessages(data || []);
    setLoading(false);
  };

  // 🟦 SEND MESSAGE (USER)
  const sendMessageToAdmin = async (content: string): Promise<ConversationMessage | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          user_id: user.id,
          sender: "user",
          content: content.trim(),
          read: false,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data as ConversationMessage;
    } catch (err) {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return null;
    }
  };

  // 🟦 SEND MESSAGE (ADMIN)
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
    } catch (err) {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return false;
    }
  };

  // 🟦 REALTIME LISTENER — OPRAVENO
  useEffect(() => {
    if (!user?.id) return;

    getUserMessages();

    const channel = supabase
      .channel(`messages-for-user-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          getUserMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // 🟦 INITIAL LOAD
  useEffect(() => {
    getUser();
  }, []);

  return {
    messages,
    loading,
    sendMessageToAdmin,
    sendAdminReply,
    refetch: getUserMessages,
  };
};
