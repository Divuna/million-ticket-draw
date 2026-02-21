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
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [playing, setPlaying] = useState(false);

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

    if (playing) {
      // Fade out then pause
      fadeVolume(audio.volume, 0, () => {
        audio.pause();
        setPlaying(false);
        setEnabled(false);
      });
    } else {
      // Start playing with fade in
      audio.volume = 0;
      audio.play().then(() => {
        setPlaying(true);
        setEnabled(true);
        fadeVolume(0, TARGET_VOLUME);
      }).catch(() => {
        // Browser blocked autoplay — user needs to interact again
      });
    }
  }, [playing, fadeVolume]);

  // If enabled from localStorage and user interacts anywhere, try to resume
  useEffect(() => {
    if (!enabled || playing) return;

    const tryPlay = () => {
      const audio = audioRef.current;
      if (!audio || playing) return;
      audio.volume = 0;
      audio.play().then(() => {
        setPlaying(true);
        fadeVolume(0, TARGET_VOLUME);
      }).catch(() => {});
    };

    document.addEventListener('click', tryPlay, { once: true });
    return () => document.removeEventListener('click', tryPlay);
  }, [enabled, playing, fadeVolume]);

  return (
    <>
      <audio
        ref={audioRef}
        src="/sounds/onemil.mp3"
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
