import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

export const useAdminMessages = () => {
  const { isAdmin } = useUserRole();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!isAdmin) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("user_id, sender, content, read, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst konverzace",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const convMap = {};
    
    // Helper to detect automatic winner messages
    const isAutoWinnerMessage = (content: string) => content.includes("Gratulujeme k výhře");

    data.forEach((msg) => {
      // Skip automatic winner messages in admin conversation list
      if (isAutoWinnerMessage(msg.content)) return;
      
      if (!convMap[msg.user_id]) {
        convMap[msg.user_id] = {
          user_id: msg.user_id,
          last_message: msg.content,
          last_message_date: msg.created_at,
          unread_count: 0,
        };
      }
      // Unread totals: use useUnreadMessagesCount / support marker logic only — do not count here.
    });

    setConversations(Object.values(convMap));
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("admin-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchConversations())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isAdmin]);

  return {
    conversations,
    loading,
    refetch: fetchConversations,
  };
};

export const useAdminMessageThread = (userId: string) => {
  const { isAdmin } = useUserRole();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);

  const fetchMessages = async () => {
    if (!isAdmin || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (!error) {
      // Filter out automatic winner messages in admin thread view
      const filtered = (data || []).filter(
        (msg) => !msg.content.includes("Gratulujeme k výhře")
      );
      setMessages(filtered);
      
      // Mark user messages as read
      await supabase
        .from("messages")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("sender", "user")
        .eq("read", false);
    }

    setLoading(false);
  };

  const fetchUserInfo = async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", userId)
      .single();

    if (data) {
      setUserInfo(data);
    }
  };

  const sendAdminReply = async (content: string) => {
    if (!isAdmin || !userId) return false;

    try {
      const { error } = await supabase.from("messages").insert({
        user_id: userId,
        sender: "admin",
        content: content.trim(),
        read: false,
        topic: "support",
        extension: "onemil",
        payload: {},
        event: "admin_reply",
        private: false,
      });

      if (error) throw error;

      await fetchMessages();
      return true;
    } catch {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchUserInfo();

    const channel = supabase
      .channel(`admin-thread-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${userId}` },
        () => fetchMessages()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId, isAdmin]);

  return {
    messages,
    loading,
    userInfo,
    sendAdminReply,
    refetch: fetchMessages,
  };
};
