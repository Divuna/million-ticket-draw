import { supabase } from "@/lib/supabaseClient";

export function useMessages() {
  // ZÍSKÁNÍ PŘIHLÁŠENÉHO UŽIVATELE
  async function getUserMessages() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("No logged user found");
      return [];
    }

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load messages error:", error);
      return [];
    }

    return data;
  }

  async function sendMessageToAdmin(title: string, content: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("No logged user found");
      return null;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
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

    return data[0];
  }

  return {
    getUserMessages,
    sendMessageToAdmin,
  };
}
