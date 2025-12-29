import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

// --- Notification sound ---
const NOTIFICATION_SOUND_URL = "/sounds/notification.mp3";
let _audioInstance: HTMLAudioElement | null = null;

const getNotificationSound = () => {
  if (!_audioInstance && typeof window !== "undefined") {
    _audioInstance = new Audio(NOTIFICATION_SOUND_URL);
    _audioInstance.volume = 0.5;
  }
  return _audioInstance;
};

const playNotificationSound = () => {
  try {
    const stored = localStorage.getItem("notification_settings");
    const settings = stored ? JSON.parse(stored) : { messageSoundEnabled: true };
    if (!settings.messageSoundEnabled) return;

    const audio = getNotificationSound();
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Autoplay blocked - ignore
      });
    }
  } catch {
    // Ignore errors
  }
};

/**
 * Single-source-of-truth store for unread messages count.
 * Fixes cases where multiple hook instances would each keep their own state,
 * causing menus to not re-render even though some other instance updated.
 */
let _unreadCount = 0;
let _started = false;
let _currentUserId: string | null = null;
let _isCurrentUserAdmin = false;
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
      _currentUserId = null;
      _isCurrentUserAdmin = false;
      setUnreadCount(0);
      return;
    }

    _currentUserId = user.id;

    // ZJISTÍME ROLE ADMIN / USER
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = role?.role === "admin" || role?.role === "superadmin";
    _isCurrentUserAdmin = isAdmin;

    let query = supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("read", false);

    if (isAdmin) {
      // ADMIN → UNREAD OD UŽIVATELŮ
      query = query.eq("sender", "user");
    } else {
      // USER → UNREAD OD ADMINA (systémové zprávy nyní mají sender='admin')
      query = query.eq("sender", "admin").eq("user_id", user.id);
    }

    const { count, error } = await query;
    if (error) throw error;

    setUnreadCount(count || 0);
  } catch (err) {
    console.error("Unread error:", err);
    setUnreadCount(0);
  }
};

const handleRealtimeMessage = (payload: any) => {
  const { eventType, new: newRecord } = payload;

  // Only play sound on INSERT
  if (eventType === "INSERT" && newRecord) {
    const sender = newRecord.sender;
    const messageUserId = newRecord.user_id;

    // User receives sound for admin messages addressed to them
    if (!_isCurrentUserAdmin && _currentUserId === messageUserId) {
      if (sender === "admin") {
        playNotificationSound();
      }
    }

    // Admin receives sound for user messages
    if (_isCurrentUserAdmin && sender === "user") {
      playNotificationSound();
    }
  }

  fetchCount();
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
      handleRealtimeMessage
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
