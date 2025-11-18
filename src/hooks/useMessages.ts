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
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("LOAD MESSAGES ERROR:", error);
      toast({
        title: "Chyba",
        description: "Nelze načíst zprávy.",
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
        description: "Nelze odeslat zprávu.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const sendAdminReply = async (userId: string, content: string) => {
    if (!userId || !content.trim()) return false;
    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: content.trim(),
    });
    if (error) {
      console.error("ADMIN SEND ERROR:", error);
      toast({
        title: "Chyba",
        description: "Nelze odeslat zprávu.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const subscribeToMessages = useCallback(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        () => getUserMessages(),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, getUserMessages]);

  useEffect(() => {
    getUserMessages();
  }, [getUserMessages]);

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
