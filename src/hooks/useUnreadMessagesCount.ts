import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORT_REQUEST_MARKER } from "@/constants/supportRequestMarker";

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
 * Single source of truth for message-related badge counts in the shell:
 * - Admin: unread rows where sender=admin AND content is exactly SUPPORT_REQUEST_MARKER (see constants/supportRequestMarker.ts).
 * - Non-admin: unread admin→user messages for the current user.
 * Do not duplicate this logic elsewhere; refresh via `refresh()` after local reads.
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

    if (isAdmin) {
      // Count conversations waiting for an admin reply: any unread message from a
      // user (customer, partner, affiliate) — NOT only the SUPPORT REQUEST marker.
      // Admin opening a thread marks its user messages read (AdminMessageThread),
      // so the badge drops as conversations are handled. Distinct user_id = number
      // of waiting conversations.
      const { data, error } = await supabase
        .from("messages")
        .select("user_id")
        .eq("read", false)
        .eq("sender", "user");
      if (error) throw error;
      const distinct = new Set<string>();
      for (const row of data || []) {
        if (row?.user_id) distinct.add(row.user_id as string);
      }
      setUnreadCount(distinct.size);
      return;
    }

    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("read", false)
      .eq("sender", "admin")
      .eq("user_id", user.id);

    if (error) throw error;

    setUnreadCount(count || 0);
  } catch (err) {
    console.error("Unread error:", err);
    setUnreadCount(0);
  }
};

/** Coalesce bursty postgres_changes (e.g. bulk mark-read) into one count query after idle. */
let _fetchCountDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleFetchCountDebounced = () => {
  if (_fetchCountDebounceTimer != null) clearTimeout(_fetchCountDebounceTimer);
  _fetchCountDebounceTimer = setTimeout(() => {
    _fetchCountDebounceTimer = null;
    fetchCount();
  }, 120);
};

const isSupportSoundTriggerMessage = (record: any): boolean => {
  const sender = record?.sender;
  if (sender !== "admin") return false;
  const raw = typeof record?.content === "string" ? record.content : "";
  return raw === SUPPORT_REQUEST_MARKER;
};

const handleRealtimeMessage = (payload: any) => {
  const { eventType, new: newRecord } = payload;

  // Only play sound on INSERT
  if (eventType === "INSERT" && newRecord) {
    const messageUserId = newRecord.user_id;

    // Play sound for support requests (admin marker messages).
    if (isSupportSoundTriggerMessage(newRecord)) {
      // User receives sound only for their own support request marker.
      if (!_isCurrentUserAdmin && _currentUserId === messageUserId) {
        playNotificationSound();
      }

      // Admin receives sound for any support request marker.
      if (_isCurrentUserAdmin) {
        playNotificationSound();
      }
    }

    // Admin also gets a sound for any new incoming user message (customer,
    // partner, affiliate), not only support markers.
    if (_isCurrentUserAdmin && newRecord?.sender === "user") {
      playNotificationSound();
    }
  }

  scheduleFetchCountDebounced();
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
