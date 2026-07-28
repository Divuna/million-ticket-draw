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

  // Count unseen wins for current user (admins can also see their wins)
  const { count, error } = await supabase
    .from("winners")
    .select("id", { count: "exact", head: true })
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
    } else if (event === "SIGNED_OUT") {
      _unseenCount = 0;
      notifyListeners();
    }
  });

  // Initial fetch
  fetchCount();
  // The installed Realtime client sends full winner rows, including internal
  // notes. Poll only the safe count projection so those rows never reach the
  // browser transport.
  window.setInterval(async () => {
    const previousCount = _unseenCount;
    await fetchCount();
    if (_unseenCount > previousCount) {
      playCelebrationSound();
    }
  }, 15_000);
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
