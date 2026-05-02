import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'onemil_music_enabled';
const TARGET_VOLUME = 0.25;
const FADE_MS = 300;
const FADE_STEPS = 15;

export const GlobalMusicPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [playing, setPlaying] = useState(false);

  // Keep ref in sync
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Save preference
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {}
  }, [enabled]);

  const fadeVolume = useCallback((from: number, to: number, then?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeRef.current) cancelAnimationFrame(fadeRef.current);

    let step = 0;
    const diff = to - from;
    const stepDuration = FADE_MS / FADE_STEPS;
    let last = performance.now();

    const tick = (now: number) => {
      if (now - last >= stepDuration) {
        step++;
        last = now;
        audio.volume = Math.max(0, Math.min(1, from + diff * (step / FADE_STEPS)));
      }
      if (step < FADE_STEPS) {
        fadeRef.current = requestAnimationFrame(tick);
      } else {
        audio.volume = to;
        then?.();
      }
    };
    fadeRef.current = requestAnimationFrame(tick);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingRef.current) {
      fadeVolume(audio.volume, 0, () => {
        audio.pause();
        setPlaying(false);
        setEnabled(false);
      });
    } else {
      audio.volume = 0;
      audio.play().then(() => {
        setPlaying(true);
        setEnabled(true);
        fadeVolume(0, TARGET_VOLUME);
      }).catch(() => {});
    }
  }, [fadeVolume]);

  // Mount-only: if enabled, attach a single pointerdown listener to auto-start
  useEffect(() => {
    const isEnabled = localStorage.getItem(STORAGE_KEY) === '1';
    if (!isEnabled) return;

    const handler = () => {
      if (playingRef.current) return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = 0;
      audio.play().then(() => {
        setPlaying(true);
        fadeVolume(0, TARGET_VOLUME);
        document.removeEventListener('pointerdown', handler);
      }).catch(() => {});
    };

    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause on visibility hidden, resume on visible
  useEffect(() => {
    const onVisChange = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.visibilityState === 'hidden') {
        if (playingRef.current) audio.pause();
      } else if (document.visibilityState === 'visible') {
        if (playingRef.current) audio.play().catch(() => {});
      }
    };
    const onPageHide = () => {
      const audio = audioRef.current;
      if (audio && playingRef.current) audio.pause();
    };

    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  return (
    <>
      <audio
        ref={audioRef}
        src="/sounds/onemil.mp3?v=2"
        loop
        preload="auto"
      />
      <button
        onClick={toggle}
        className={cn(
          "fixed top-20 right-4 z-50 h-10 w-10 rounded-full flex items-center justify-center",
          "bg-background/80 backdrop-blur-md border border-border/50 shadow-lg",
          "hover:bg-background hover:scale-105 active:scale-95",
          "transition-all duration-200"
        )}
        title={playing ? 'Vypnout hudbu' : 'Zapnout hudbu'}
        aria-label={playing ? 'Vypnout hudbu' : 'Zapnout hudbu'}
      >
        {playing ? (
          <Volume2 className="h-4 w-4 text-primary" />
        ) : (
          <VolumeX className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </>
  );
};
