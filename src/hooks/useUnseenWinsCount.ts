import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

// --- Celebration sound using premium MP3 ---
let _celebrationAudio: HTMLAudioElement | null = null;

const playCelebrationSound = () => {
  try {
    // Check user settings
    const stored = localStorage.getItem("notification_settings");
    const settings = stored ? JSON.parse(stored) : { winSoundEnabled: true };
    if (!settings.winSoundEnabled) return;

    // Create or reuse audio element
    if (!_celebrationAudio) {
      _celebrationAudio = new Audio("/sounds/win-celebration.mp3");
      _celebrationAudio.volume = 0.7;
    }

    // Reset and play (ensures fresh playback each time)
    _celebrationAudio.currentTime = 0;
    _celebrationAudio.play().catch(() => {
      // Ignore autoplay policy errors silently
    });
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
      (payload) => {
        // New win added - play celebration sound and refetch count
        // Verify this is truly for the current user (defense in depth)
        if (payload.new && (payload.new as { user_id?: string }).user_id === user.id) {
          playCelebrationSound();
        }
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
        // Win updated (user_seen changed) - refetch count only, no sound
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
