import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ComingSoonBanner {
  id: string;
  image_url: string;
  title: string | null;
  created_at: string;
}

export const useComingSoonBanners = () => {
  const [banners, setBanners] = useState<ComingSoonBanner[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coming_soon_banners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setBanners(data || []);
    } catch (error) {
      console.error('Error fetching coming soon banners:', error);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  return {
    banners,
    loading,
    refetch: fetchBanners
  };
};
