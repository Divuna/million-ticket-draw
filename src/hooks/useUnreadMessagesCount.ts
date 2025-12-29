import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useUnreadMessagesCount = () => {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setUnreadCount(0);

      // ZJISTÍME ROLE ADMIN / USER
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();

      const isAdmin = role?.role === "admin" || role?.role === "superadmin";

      const query = supabase.from("messages").select("*", { count: "exact", head: true }).eq("read", false);

      if (isAdmin) {
        // ADMIN → UNREAD OD UŽIVATELŮ
        query.eq("sender", "user");
      } else {
        // USER → UNREAD OD ADMINA
        query.eq("sender", "admin").eq("user_id", user.id);
      }

      const { count } = await query;
      setUnreadCount(count || 0);
    } catch (err) {
      console.error("Unread error:", err);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchCount();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchCount();
    });

    const channel = supabase
      .channel("unread-msgs")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchCount())
      .subscribe();

    return () => {
      subscription.unsubscribe();
      channel.unsubscribe();
    };
  }, []);

  return { unreadCount, refresh: fetchCount };
};
