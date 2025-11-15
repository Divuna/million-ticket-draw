import { supabase } from "@/integrations/supabase/client";

export function useMessages() {
  const getUserMessages = async (userId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("getUserMessages error:", error);
      return [];
    }

    return data || [];
  };

  const sendMessageToAdmin = async (userId: string, title: string, content: string) => {
    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "user",
      title,
      content,
    });

    if (error) {
      console.error("sendMessageToAdmin error:", error);
      return false;
    }

    return true;
  };

  return { getUserMessages, sendMessageToAdmin };
}
