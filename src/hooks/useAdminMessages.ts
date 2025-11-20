import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

export const useAdminMessages = () => {
  const { isAdmin } = useUserRole();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!isAdmin) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Get all messages with user info
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("user_id, sender, content, created_at, read")
        .order("created_at", { ascending: false });

      if (messagesError) throw messagesError;

      // Get user details
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, name");

      if (usersError) throw usersError;

      // Group messages by user_id
      const convMap: Record<string, any> = {};

      messages?.forEach((msg) => {
        if (!convMap[msg.user_id]) {
          const user = users?.find(u => u.id === msg.user_id);
          convMap[msg.user_id] = {
            user_id: msg.user_id,
            user_email: user?.email || 'Unknown',
            user_name: user?.name || null,
            last_message_content: msg.content,
            last_message_date: msg.created_at,
            unread_count: 0,
          };
        }
        
        // Count unread messages from users (sender = 'user')
        if (msg.sender === 'user' && !msg.read) {
          convMap[msg.user_id].unread_count++;
        }
      });

      setConversations(Object.values(convMap));
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst konverzace",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("admin-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isAdmin]);

  return { conversations, loading, refetch: fetchConversations };
};

export const useAdminMessageThread = (userId: string | undefined) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);

  const fetchMessages = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Get messages for this user
      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select("id, user_id, content, sender, read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      // Get user info
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, email, name")
        .eq("id", userId)
        .single();

      if (userError) throw userError;

      setMessages(messagesData || []);
      setUserInfo(userData);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst zprávy",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendAdminReply = async (content: string) => {
    if (!userId || !content.trim()) return false;

    try {
      const { error } = await supabase.from("messages").insert({
        user_id: userId,
        sender: "admin",
        content: content.trim(),
        read: false,
      });

      if (error) throw error;

      await fetchMessages();
      return true;
    } catch (error) {
      console.error("Error sending admin reply:", error);
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

    if (!userId) return;

    const channel = supabase
      .channel(`user-messages-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return { messages, loading, userInfo, sendAdminReply };
};
