import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single-source-of-truth store for unread messages count.
 * Fixes cases where multiple hook instances would each keep their own state,
 * causing menus to not re-render even though some other instance updated.
 */
let _unreadCount = 0;
let _started = false;
let _authUnsub: { unsubscribe: () => void } | null = null;
let _channel: { unsubscribe: () => void } | null = null;
const _listeners = new Set<() => void>();

const emit = () => {
  _listeners.forEach((l) => l());
};

const setUnreadCount = (next: number) => {
  const safe = Number.isFinite(next) ? next : 0;
  if (safe === _unreadCount) return;
  _unreadCount = safe;
  emit();
};

const fetchCount = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUnreadCount(0);
      return;
    }

    // ZJISTÍME ROLE ADMIN / USER
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = role?.role === "admin" || role?.role === "superadmin";

    let query = supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("read", false);

    if (isAdmin) {
      // ADMIN → UNREAD OD UŽIVATELŮ
      query = query.eq("sender", "user");
    } else {
      // USER → UNREAD OD ADMINA NEBO SYSTÉMU
      query = query.in("sender", ["admin", "system"]).eq("user_id", user.id);
    }

    const { count, error } = await query;
    if (error) throw error;

    setUnreadCount(count || 0);
  } catch (err) {
    console.error("Unread error:", err);
    setUnreadCount(0);
  }
};

const startUnreadCountStore = () => {
  if (_started) return;
  _started = true;

  fetchCount();

  const { data } = supabase.auth.onAuthStateChange(() => {
    fetchCount();
  });
  _authUnsub = data.subscription;

  _channel = supabase
    .channel("unread-msgs")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => fetchCount()
    )
    .subscribe();
};

const subscribe = (listener: () => void) => {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
};

const getSnapshot = () => _unreadCount;

export const useUnreadMessagesCount = () => {
  useEffect(() => {
    startUnreadCountStore();
  }, []);

  const unreadCount = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { unreadCount, refresh: fetchCount };
};
