import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMessages() {
  const { user } = useAuth();

  const sendMessageToAdmin = async (content: string, title?: string) => {
    if (!user) {
      console.error("❌ Uživatel není přihlášený, nelze odeslat zprávu");
      throw new Error("Musíte být přihlášený");
    }

    const message = {
      user_id: user.id,
      sender: "user",
      title: title || null,
      content,
      category: "support",
      read: false,
      parent_message_id: null,
    };

    console.log("📤 ODESÍLÁM ZPRÁVU:", message);

    const { data, error } = await supabase.from("messages").insert([message]);

    if (error) {
      console.error("❌ Chyba při odesílání zprávy:", error);
      throw new Error("Nepodařilo se odeslat zprávu");
    }

    console.log("✅ Zpráva odeslána:", data);
    return data;
  };

  return { sendMessageToAdmin };
}
