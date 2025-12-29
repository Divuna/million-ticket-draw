import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

// --- Celebration sound using Web Audio API ---
let _audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!_audioContext && typeof window !== "undefined") {
    _audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return _audioContext;
};

const playCelebrationSound = () => {
  try {
    const stored = localStorage.getItem("notification_settings");
    const settings = stored ? JSON.parse(stored) : { winSoundEnabled: true };
    if (!settings.winSoundEnabled) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume context if suspended (required for autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.setValueAtTime(0.25, now); // Pleasant volume

    // Fanfare notes (C major arpeggio with harmonics)
    const notes = [
      { freq: 523.25, start: 0, duration: 0.3 },      // C5
      { freq: 659.25, start: 0.15, duration: 0.3 },   // E5
      { freq: 783.99, start: 0.3, duration: 0.4 },    // G5
      { freq: 1046.50, start: 0.5, duration: 0.6 },   // C6
      { freq: 783.99, start: 0.8, duration: 0.4 },    // G5
      { freq: 1046.50, start: 1.1, duration: 0.8 },   // C6
      { freq: 1318.51, start: 1.4, duration: 1.0 },   // E6
      { freq: 1567.98, start: 1.8, duration: 1.2 },   // G6 (triumphant peak)
      { freq: 2093.00, start: 2.2, duration: 1.8 },   // C7 (final high note)
    ];

    notes.forEach(({ freq, start, duration }) => {
      // Main oscillator
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      
      // Envelope: attack, sustain, release
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.6, now + start + 0.05);
      gain.gain.setValueAtTime(0.5, now + start + duration * 0.6);
      gain.gain.linearRampToValueAtTime(0, now + start + duration);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(now + start);
      osc.stop(now + start + duration);

      // Add harmonic overtone for richness
      const harmonic = ctx.createOscillator();
      const harmonicGain = ctx.createGain();
      
      harmonic.type = "triangle";
      harmonic.frequency.setValueAtTime(freq * 2, now + start);
      
      harmonicGain.gain.setValueAtTime(0, now + start);
      harmonicGain.gain.linearRampToValueAtTime(0.15, now + start + 0.05);
      harmonicGain.gain.linearRampToValueAtTime(0, now + start + duration);
      
      harmonic.connect(harmonicGain);
      harmonicGain.connect(masterGain);
      
      harmonic.start(now + start);
      harmonic.stop(now + start + duration);
    });

    // Shimmer effect (subtle high frequency sparkle)
    for (let i = 0; i < 8; i++) {
      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(2500 + Math.random() * 1500, now + 0.5 + i * 0.4);
      
      shimmerGain.gain.setValueAtTime(0, now + 0.5 + i * 0.4);
      shimmerGain.gain.linearRampToValueAtTime(0.03, now + 0.55 + i * 0.4);
      shimmerGain.gain.linearRampToValueAtTime(0, now + 0.8 + i * 0.4);
      
      shimmer.connect(shimmerGain);
      shimmerGain.connect(masterGain);
      
      shimmer.start(now + 0.5 + i * 0.4);
      shimmer.stop(now + 1.0 + i * 0.4);
    }

    // Fade out master at the end
    masterGain.gain.setValueAtTime(0.25, now + 4);
    masterGain.gain.linearRampToValueAtTime(0, now + 5);
  } catch {
    // Ignore errors (autoplay policy, etc.)
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
