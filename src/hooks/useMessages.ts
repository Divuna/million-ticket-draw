import { supabase } from "@/utils/supabaseClient";

export function useMessages() {
  const getUserMessages = async (userId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error) return [];
    return data || [];
  };

  const sendMessageToAdmin = async (userId: string, title: string, content: string) => {
    const { error } = await supabase.from("messages").insert({
      sender_id: userId,
      receiver_id: "admin",
      sender: "user",
      title,
      content,
    });

    if (error) return false;
    return true;
  };

  return { getUserMessages, sendMessageToAdmin };
}
