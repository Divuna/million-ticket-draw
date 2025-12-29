import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'notification_settings';

interface NotificationSettings {
  soundEnabled: boolean;
  messageSoundEnabled: boolean;
  winSoundEnabled: boolean;
}

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
  messageSoundEnabled: true,
  winSoundEnabled: true,
};

export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration: if old format, convert to new
        setSettings({
          soundEnabled: parsed.soundEnabled ?? true,
          messageSoundEnabled: parsed.messageSoundEnabled ?? parsed.soundEnabled ?? true,
          winSoundEnabled: parsed.winSoundEnabled ?? parsed.soundEnabled ?? true,
        });
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving notification settings:', error);
      }
      return updated;
    });
  }, []);

  const toggleSound = useCallback(() => {
    const newValue = !settings.soundEnabled;
    updateSettings({ 
      soundEnabled: newValue,
      messageSoundEnabled: newValue,
      winSoundEnabled: newValue,
    });
  }, [settings.soundEnabled, updateSettings]);

  const toggleMessageSound = useCallback(() => {
    updateSettings({ messageSoundEnabled: !settings.messageSoundEnabled });
  }, [settings.messageSoundEnabled, updateSettings]);

  const toggleWinSound = useCallback(() => {
    updateSettings({ winSoundEnabled: !settings.winSoundEnabled });
  }, [settings.winSoundEnabled, updateSettings]);

  return {
    settings,
    updateSettings,
    toggleSound,
    toggleMessageSound,
    toggleWinSound,
    soundEnabled: settings.soundEnabled,
    messageSoundEnabled: settings.messageSoundEnabled,
    winSoundEnabled: settings.winSoundEnabled,
  };
};
