import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VideoBanner {
  id: string;
  title: string;
  image_url: string; // This will contain the YouTube URL for video banners
  active: boolean;
  target_page: string;
  start_date: string | null;
  end_date: string | null;
}

export const useHomepageVideo = () => {
  const [videoBanner, setVideoBanner] = useState<VideoBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideoBanner = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, active, target_page, start_date, end_date')
        .eq('target_page', 'homepage_video')
        .eq('active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      // Check if banner is within date range
      if (data) {
        const now = new Date();
        const startDate = data.start_date ? new Date(data.start_date) : null;
        const endDate = data.end_date ? new Date(data.end_date) : null;

        const isValid = (!startDate || now >= startDate) && (!endDate || now <= endDate);
        
        if (isValid) {
          setVideoBanner(data);
        } else {
          setVideoBanner(null);
        }
      } else {
        setVideoBanner(null);
      }
    } catch (error: any) {
      console.error('Error fetching video banner:', error);
      setError(error.message);
      setVideoBanner(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoBanner();

    // Subscribe to banner changes
    const channel = supabase
      .channel('video-banner-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'banners',
          filter: 'target_page=eq.homepage_video'
        }, 
        () => {
          fetchVideoBanner();
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
    error,
    refetch: fetchVideoBanner
  };
};