import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMessages() {
  const { user } = useAuth();

  const sendMessageToAdmin = async (content: string, title?: string) => {
    if (!user) {
      console.error("❌ Uživatel není přihlášený");
      throw new Error("Musíte být přihlášený pro odeslání zprávy");
    }

    const message = {
      user_id: user.id, // 🔑 zajištěno, že auth.uid() nebude NULL
      sender: "user",
      title: title || null,
      content,
      category: "support",
      read: false,
      parent_message_id: null,
    };

    const { data, error } = await supabase.from("messages").insert([message]);

    if (error) {
      console.error("❌ Chyba při odesílání zprávy:", error);
      throw new Error(error.message || "Nepodařilo se odeslat zprávu");
    }

    console.log("✅ Zpráva uložena:", data);
    return data;
  };

  return { sendMessageToAdmin };
}
