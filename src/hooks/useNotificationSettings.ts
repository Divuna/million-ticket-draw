import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'notification_settings';

interface NotificationSettings {
  soundEnabled: boolean;
}

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
};

export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings(JSON.parse(stored));
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
    updateSettings({ soundEnabled: !settings.soundEnabled });
  }, [settings.soundEnabled, updateSettings]);

  return {
    settings,
    updateSettings,
    toggleSound,
    soundEnabled: settings.soundEnabled,
  };
};
