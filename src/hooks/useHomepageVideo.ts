import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface HomepageVideoBanner {
  id: string;
  title: string;
  image_url: string; // This will contain the YouTube URL for video banners
  active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export const useHomepageVideo = () => {
  const [videoBanner, setVideoBanner] = useState<HomepageVideoBanner | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHomepageVideo = async () => {
    try {
      setLoading(true);
      const now = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
      
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, active, start_date, end_date')
        .eq('active', true)
        .eq('target_page', 'homepage_video')
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setVideoBanner(data);
    } catch (error) {
      console.error('Error fetching homepage video:', error);
      setVideoBanner(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomepageVideo();
  }, []);

  // Subscribe to banner changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('homepage-video-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'banners' }, 
        () => {
          fetchHomepageVideo(); // Refresh video when any banner changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    videoBanner,
    loading,
    refetch: fetchHomepageVideo
  };
};