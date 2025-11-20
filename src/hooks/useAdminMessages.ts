import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

export const useAdminMessages = () => {
  const { isAdmin } = useUserRole();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!isAdmin) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("user_id, sender, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst konverzace",
        variant: "destructive",
      });
      return;
    }

    const convMap = {};

    data.forEach((msg) => {
      if (!convMap[msg.user_id]) {
        convMap[msg.user_id] = {
          user_id: msg.user_id,
          last_message: msg.content,
          last_message_date: msg.created_at,
        };
      }
    });

    setConversations(Object.values(convMap));
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("admin-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchConversations())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isAdmin]);

  return { conversations, loading };
};
