import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MegajackpotBanner {
  id: string;
  title: string;
  image_url: string;
  active: boolean;
  target_page: string;
  start_date: string | null;
  end_date: string | null;
}

export const useMegajackpotBanners = () => {
  const [banners, setBanners] = useState<MegajackpotBanner[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveBanners = async () => {
    try {
      setLoading(true);
      const now = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
      
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, active, target_page, start_date, end_date')
        .eq('active', true)
        .eq('target_page', 'homepage_customer')
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setBanners(data || []);
    } catch (error) {
      console.error('Error fetching active banners:', error);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveBanners();
  }, []);

  // Subscribe to banner changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('banner-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'banners' }, 
        () => {
          fetchActiveBanners(); // Refresh banners when any banner changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    banners,
    loading,
    refetch: fetchActiveBanners
  };
};