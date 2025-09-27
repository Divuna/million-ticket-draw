import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface HomepageBanner {
  id: string;
  title: string;
  image_url: string;
  target_page: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export const useHomepageBanners = () => {
  const [voucherBanner, setVoucherBanner] = useState<HomepageBanner | null>(null);
  const [gamesBanner, setGamesBanner] = useState<HomepageBanner | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHomepageBanners = async () => {
    try {
      setLoading(true);
      const now = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
      
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, active, target_page, start_date, end_date')
        .eq('active', true)
        .in('target_page', ['vouchers', 'games'])
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('created_at', { ascending: false })
        .limit(2);

      if (error) throw error;

      // Separate banners by target page
      const vouchers = data?.filter(banner => banner.target_page === 'vouchers') || [];
      const games = data?.filter(banner => banner.target_page === 'games') || [];

      // Take max 1 banner per section
      setVoucherBanner(vouchers.length > 0 ? vouchers[0] : null);
      setGamesBanner(games.length > 0 ? games[0] : null);
    } catch (error) {
      console.error('Error fetching homepage banners:', error);
      setVoucherBanner(null);
      setGamesBanner(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomepageBanners();
  }, []);

  // Subscribe to banner changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('homepage-banner-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'banners' }, 
        () => {
          fetchHomepageBanners(); // Refresh banners when any banner changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    voucherBanner,
    gamesBanner,
    loading,
    refetch: fetchHomepageBanners
  };
};