import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMessages() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // --------------------------------------------------
  // 1) USER → ADMIN
  // --------------------------------------------------
  const sendMessageToAdmin = async (content: string) => {
    if (!user) {
      throw new Error("Uživatel není přihlášený.");
    }

    if (!content.trim()) {
      throw new Error("Zpráva je prázdná.");
    }

    setLoading(true);

    const { error } = await supabase.from("messages").insert([
      {
        user_id: user.id,
        sender: "user",
        content: content.trim(),
      },
    ]);

    setLoading(false);

    if (error) {
      console.error("❌ sendMessageToAdmin error:", error);
      throw new Error(error.message || "Nepodařilo se odeslat zprávu.");
    }

    return true;
  };

  // --------------------------------------------------
  // 2) ADMIN → USER
  // --------------------------------------------------
  const sendAdminReply = async (userId: string, content: string) => {
    if (!userId || !content.trim()) {
      throw new Error("Chybný vstup.");
    }

    const { error } = await supabase.from("messages").insert([
      {
        user_id: userId,
        sender: "admin",
        content: content.trim(),
      },
    ]);

    if (error) {
      console.error("❌ sendAdminReply error:", error);
      throw new Error(error.message || "Nepodařilo se odeslat zprávu.");
    }

    return true;
  };

  return {
    sendMessageToAdmin,
    sendAdminReply,
    loading,
  };
}
