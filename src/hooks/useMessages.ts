import { supabase } from "@/lib/supabaseClient";

export function useMessages() {
  async function getUserMessages(userId: string) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load messages error:", error);
      return [];
    }
    return data || [];
  }

  async function sendMessageToAdmin(userId: string, title: string, content: string) {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: userId,
        sender: "user",
        title: title || null,
        content,
        category: "system",
      })
      .select();

    if (error) {
      console.error("send message error:", error);
      return null;
    }
    return data?.[0] || null;
  }

  return {
    getUserMessages,
    sendMessageToAdmin,
  };
}
