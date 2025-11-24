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
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          user_id,
          users:user_id ( email, name ),
          content,
          created_at,
          sender,
          read
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const grouped = data.reduce((acc: any, msg: any) => {
        const userId = msg.user_id;
        if (!acc[userId]) {
          acc[userId] = {
            user_id: userId,
            user_email: msg.users?.email ?? "",
            user_name: msg.users?.name ?? "",
            last_message_date: msg.created_at,
            unread_count: 0,
            last_message_content: msg.content,
          };
        }

        if (msg.created_at > acc[userId].last_message_date) {
          acc[userId].last_message_date = msg.created_at;
          acc[userId].last_message_content = msg.content;
        }

        if (msg.sender === "user" && !msg.read) {
          acc[userId].unread_count += 1;
        }

        return acc;
      }, {});

      const sortedConversations = Object.values(grouped).sort(
        // @ts-ignore
        (a, b) => new Date((b as any).last_message_date).getTime() - new Date((a as any).last_message_date).getTime(),
      );

      setConversations(sortedConversations);
    } catch (err) {
      console.error("Error fetching admin conversations:", err);
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
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("admin-messages-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  return { conversations, loading, refetch: fetchConversations };
};

export const useAdminMessageThread = (userId: string | null) => {
  const { isAdmin } = useUserRole();
  const [messages, setMessages] = useState<any[]>([]);
  const [userInfo, setUserInfo] = useState<{ email: string; name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    if (!isAdmin || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMessages(data || []);
    } catch (err) {
      console.error("Error fetching admin message thread:", err);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst konverzaci",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInfo = async () => {
    if (!userId) return;

    const { data } = await supabase.from("users").select("email, name").eq("id", userId).single();

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
  }, [isAdmin, userId]);

  useEffect(() => {
    if (!isAdmin || !userId) return;

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
        () => {
          fetchMessages();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return { messages, userInfo, loading, sendAdminReply, refetch: fetchMessages };
};
