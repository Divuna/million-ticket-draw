import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMessages() {
  const { user } = useAuth();

  const sendMessageToAdmin = async (content: string) => {
    if (!user) {
      console.error("❌ Uživatel není přihlášený");
      throw new Error("Musíte být přihlášený pro odeslání zprávy");
    }

    const { error } = await supabase.from("messages").insert([{
      user_id: user.id,
      sender: "user",
      content: content.trim(),
    }]);

    if (error) {
      console.error("❌ Chyba při odesílání zprávy:", error);
      throw new Error(error.message || "Nepodařilo se odeslat zprávu");
    }

    return { success: true };
  };

  return { sendMessageToAdmin };
}
