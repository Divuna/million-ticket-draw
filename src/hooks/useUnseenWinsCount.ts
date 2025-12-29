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
    const settings = stored ? JSON.parse(stored) : { winSoundEnabled: true };
    if (!settings.winSoundEnabled) return;

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

// Single source of truth for unseen wins count
let _unseenCount = 0;
let _listeners: (() => void)[] = [];
let _initialized = false;
let _channel: ReturnType<typeof supabase.channel> | null = null;

const notifyListeners = () => {
  _listeners.forEach((l) => l());
};

const fetchCount = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    _unseenCount = 0;
    notifyListeners();
    return;
  }

  // Check user role - admins don't see user badge
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (userData?.role === "admin" || userData?.role === "superadmin") {
    _unseenCount = 0;
    notifyListeners();
    return;
  }

  // Count unseen wins for current user
  const { count, error } = await supabase
    .from("winners")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("user_seen", false);

  if (!error && count !== null) {
    _unseenCount = count;
    notifyListeners();
  }
};

const startUnseenWinsStore = () => {
  if (_initialized) return;
  _initialized = true;

  // Listen for auth state changes
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") {
      fetchCount();
      setupRealtimeSubscription();
    } else if (event === "SIGNED_OUT") {
      _unseenCount = 0;
      notifyListeners();
      if (_channel) {
        supabase.removeChannel(_channel);
        _channel = null;
      }
    }
  });

  // Initial fetch
  fetchCount();
  setupRealtimeSubscription();
};

const setupRealtimeSubscription = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Check user role
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (userData?.role === "admin" || userData?.role === "superadmin") return;

  if (_channel) {
    supabase.removeChannel(_channel);
  }

  _channel = supabase
    .channel("unseen-wins-changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "winners",
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        // New win added - play sound and refetch count
        playNotificationSound();
        fetchCount();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "winners",
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        // Win updated (user_seen changed) - refetch count
        fetchCount();
      }
    )
    .subscribe();
};

const subscribe = (listener: () => void) => {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
};

const getSnapshot = () => _unseenCount;

export const useUnseenWinsCount = () => {
  useEffect(() => {
    startUnseenWinsStore();
  }, []);

  const unseenCount = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    unseenCount,
    refresh: fetchCount,
  };
};
