import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface HomepageVideoSettings {
  homepage_youtube_url: string | null;
  homepage_video_active: boolean;
}

export const useHomepageVideoSimple = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideoSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('banners')
        .select('homepage_youtube_url, homepage_video_active')
        .not('homepage_youtube_url', 'is', null)
        .eq('homepage_video_active', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      if (data) {
        setVideoUrl(data.homepage_youtube_url);
        setIsActive(data.homepage_video_active);
      } else {
        setVideoUrl(null);
        setIsActive(false);
      }
    } catch (error: any) {
      console.error('Error fetching homepage video settings:', error);
      setError(error.message);
      setVideoUrl(null);
      setIsActive(false);
    } finally {
      setLoading(false);
    }
  };

  const updateVideoSettings = async (url: string, active: boolean) => {
    try {
      setError(null);
      
      // First, deactivate all existing video settings
      const { error: deactivateError } = await supabase
        .from('banners')
        .update({ homepage_video_active: false })
        .not('homepage_youtube_url', 'is', null);

      if (deactivateError) throw deactivateError;

      // Then update or insert the new settings
      const { error: upsertError } = await supabase
        .from('banners')
        .upsert({
          id: 'homepage-video-settings',
          title: 'Homepage Video Settings',
          image_url: '/placeholder.svg',
          target_page: 'homepage_video_settings',
          active: true,
          homepage_youtube_url: url,
          homepage_video_active: active
        });

      if (upsertError) throw upsertError;

      // Update local state
      setVideoUrl(active ? url : null);
      setIsActive(active);
      
      return { success: true };
    } catch (error: any) {
      console.error('Error updating homepage video settings:', error);
      setError(error.message);
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    fetchVideoSettings();

    // Subscribe to banner changes
    const channel = supabase
      .channel('homepage-video-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'banners',
          filter: 'homepage_youtube_url=not.is.null'
        }, 
        () => {
          fetchVideoSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    videoUrl,
    isActive,
    loading,
    error,
    updateVideoSettings,
    refetch: fetchVideoSettings
  };
};