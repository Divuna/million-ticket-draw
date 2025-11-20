import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

export interface UserConversation {
  user_id: string;
  user_email: string;
  user_name: string | null;
  last_message_date: string;
  unread_count: number;
  last_message_content: string;
}

export interface ConversationMessage {
  id: string;
  user_id: string;
  content: string;
  sender: "user" | "admin";
  read: boolean;
  created_at: string;
}

export const useAdminMessages = () => {
  const { isAdmin } = useUserRole();
  const [conversations, setConversations] = useState<UserConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!isAdmin) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("id, user_id, content, sender, read, created_at")
        .order("created_at", { ascending: false });

      if (messagesError) throw messagesError;

      const { data: users, error: usersError } = await supabase.from("users").select("id, email, name");

      if (usersError) throw usersError;

      const grouped = new Map<string, UserConversation>();

      messages?.forEach((msg) => {
        const user = users?.find((u) => u.id === msg.user_id);
        if (!user) return;

        if (!grouped.has(msg.user_id)) {
          grouped.set(msg.user_id, {
            user_id: msg.user_id,
            user_email: user.email,
            user_name: user.name,
            last_message_date: msg.created_at,
            unread_count: msg.sender === "user" && !msg.read ? 1 : 0,
            last_message_content: msg.content,
          });
        } else {
          const conv = grouped.get(msg.user_id)!;
          if (msg.sender === "user" && !msg.read) conv.unread_count += 1;
        }
      });

      setConversations(Array.from(grouped.values()));
    } catch (error: any) {
      console.error("Error fetching admin messages:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst zprávy",
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

export const useAdminMessageThread = (userId: string | undefined) => {
  const { isAdmin } = useUserRole();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{ email: string; name: string | null } | null>(null);

  const fetchThread = async () => {
    if (!isAdmin || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, user_id, content, sender, read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMessages((data || []) as ConversationMessage[]);

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("email, name")
        .eq("id", userId)
        .single();

      if (userError) throw userError;

      setUserInfo(user);

      await supabase
        .from("messages")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("sender", "user")
        .eq("read", false);
    } catch (error: any) {
      console.error("Error fetching thread:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst konverzaci",
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
      });

      if (error) throw error;

      toast({ title: "Úspěch", description: "Zpráva byla odeslána" });
      return true;
    } catch (error: any) {
      console.error("Error sending reply:", error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchThread();

    if (!userId) return;

    const channel = supabase
      .channel(`admin-thread-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchThread(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isAdmin, userId]);

  return {
    messages,
    loading,
    userInfo,
    sendAdminReply,
    refetch: fetchThread,
  };
};
