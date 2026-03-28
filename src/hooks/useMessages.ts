import { useCallback } from "react";
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

/**
 * User chat send only. Does not subscribe or load the thread — Messages.tsx owns that
 * (limit + single realtime channel). Previously this hook refetched ALL messages on mount
 * and on every INSERT, which duplicated work and slowed heavy threads.
 */
export const useMessages = () => {
  const sendMessageToAdmin = useCallback(async (content: string): Promise<ConversationMessage | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
    } catch {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return null;
    }
  }, []);

  return {
    sendMessageToAdmin,
  };
};
