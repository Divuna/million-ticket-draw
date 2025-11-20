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

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          user_id,
          users:profiles!messages_user_id_fkey (
            email,
            full_name
          ),
          last_message:messages!messages_user_id_fkey (
            content,
            created_at,
            sender,
            read
          )
        `,
        )
        .order("created_at", { referencedTable: "last_message", ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
        toast({
          title: "Chyba",
          description: "Nepodařilo se načíst konverzace",
          variant: "destructive",
        });
        return;
      }

      const formatted: UserConversation[] = (data || []).map((item: any) => ({
        user_id: item.user_id,
        user_email: item.users?.email || "Neznámý uživatel",
        user_name: item.users?.full_name || null,
        last_message_date: item.last_message?.created_at || "",
        unread_count: item.last_message?.read === false ? 1 : 0,
        last_message_content: item.last_message?.content || "",
      }));

      setConversations(formatted);
    } catch (error: any) {
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

    if (!isAdmin) return;

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
  };
};

export const useAdminMessageThread = (userId: string | null) => {
  const { isAdmin } = useUserRole();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{
    email: string;
    name: string | null;
    unread_count: number;
  } | null>(null);

  const fetchThread = async () => {
    if (!isAdmin || !userId) {
      setMessages([]);
      setUserInfo(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", userId)
        .single();

      if (userError) {
        console.error("Error fetching user info:", userError);
      } else {
        const { count: unreadCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("sender", "user")
          .eq("read", false);

        setUserInfo({
          email: userData?.email || "Neznámý uživatel",
          name: userData?.full_name || null,
          unread_count: unreadCount || 0,
        });
      }

      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select("id, user_id, content, sender, read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Error fetching thread:", messagesError);
        toast({
          title: "Chyba",
          description: "Nepodařilo se načíst konverzaci",
          variant: "destructive",
        });
        return;
      }

      setMessages(
        (messagesData || []).map((msg: any) => ({
          id: msg.id,
          user_id: msg.user_id,
          content: msg.content,
          sender: msg.sender,
          read: msg.read,
          created_at: msg.created_at,
        })),
      );

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
      const { error } = await supabase.from("messages").insert([
        {
          user_id: userId,
          sender: "admin",
          content: content.trim(),
          read: false,
          // 🔥 POVINNÉ SLOUPCE PRO ONEMIL ↔ SOFINITY PIPELINE
          topic: "support",
          extension: "onemil",
          // ZACHOVÁNÍ SCHÉMATU
          payload: null,
          event: null,
          private: false,
        },
      ]);

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
