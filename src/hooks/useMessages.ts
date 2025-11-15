import { supabase } from "@/integrations/supabase/client";

export function useMessages() {
  const getUserMessages = async (userId: string) => {
    if (!userId) {
      console.warn("⚠️ getUserMessages called without userId");
      return [];
    }

    // Load user's messages (only top-level messages, not replies)
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .is("parent_message_id", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ getUserMessages error:", error);
      return [];
    }

    // Mark unread admin messages as read
    const unreadAdmin = data?.filter(
      (msg) => msg.sender === "admin" && msg.read !== true
    );

    if (unreadAdmin.length > 0) {
      const { error: updateError } = await supabase
        .from("messages")
        .update({ read: true })
        .in("id", unreadAdmin.map((m) => m.id));

      if (updateError) {
        console.error("❌ Failed to mark messages as read:", updateError);
      }
    }

    return data || [];
  };

  const getMessageReplies = async (parentMessageId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("parent_message_id", parentMessageId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ getMessageReplies error:", error);
      return [];
    }

    return data || [];
  };

  const sendMessageToAdmin = async (
    userId: string,
    title: string,
    content: string,
    parentMessageId: string | null = null
  ) => {
    if (!userId || !content) {
      console.error("❌ sendMessageToAdmin missing fields");
      return { data: null, error: "Missing fields" };
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: userId,
        sender: "user",
        title: parentMessageId ? null : (title || null),
        content,
        read: false,
        parent_message_id: parentMessageId,
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Error inserting message:", error);
      return { data, error };
    }

    console.log("✅ Message inserted:", data);
    return { data, error };
  };

  const subscribeToMessages = (userId: string, onUpdate: () => void) => {
    if (!userId) {
      console.warn("⚠️ subscribeToMessages called without userId");
      return () => {};
    }

    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${userId}`
        },
        () => {
          console.log("📨 Messages updated, refreshing...");
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  return { getUserMessages, getMessageReplies, sendMessageToAdmin, subscribeToMessages };
}
