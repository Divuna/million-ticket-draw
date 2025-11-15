import { supabase } from "@/integrations/supabase/client";

export function useMessages() {
  const getUserMessages = async (userId: string) => {
    if (!userId) {
      console.warn('⚠️ getUserMessages called without userId');
      return [];
    }

    console.log('📨 Loading messages for user:', userId);
    
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ getUserMessages error:", error);
      return [];
    }

    console.log('✅ Loaded', data?.length || 0, 'messages');
    return data || [];
  };

  const sendMessageToAdmin = async (userId: string, title: string, content: string) => {
    if (!userId || !content) {
      console.error('❌ sendMessageToAdmin: missing required fields');
      return false;
    }

    console.log('📤 Sending message to admin...');

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "user",
      title: title || null,
      content,
    });

    if (error) {
      console.error("❌ sendMessageToAdmin error:", error);
      return false;
    }

    console.log('✅ Message sent successfully');
    return true;
  };

  return { getUserMessages, sendMessageToAdmin };
}
