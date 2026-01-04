import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PlacementBanner {
  id: string;
  title: string;
  image_url: string;
  target_page: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
}

// Map placement keys to target_page values
export const PLACEMENT_OPTIONS = {
  'miocoin_50': 'MioCoin balíček – 50',
  'miocoin_310': 'MioCoin balíček – 310',
  'miocoin_525': 'MioCoin balíček – 525',
  'miocoin_1280': 'MioCoin balíček – 1280',
  'probihajici_souteze': 'Probíhající soutěže',
  'koupit_voucher': 'Koupit voucher se slevou',
  'posledni_vyherci': 'Poslední výherci',
  'homepage_posledni_vyherci': 'Úvodní stránka – Poslední výherci',
} as const;

export type PlacementKey = keyof typeof PLACEMENT_OPTIONS;

export const usePlacementBanners = (placements: PlacementKey[]) => {
  const [banners, setBanners] = useState<Record<PlacementKey, PlacementBanner | null>>(
    {} as Record<PlacementKey, PlacementBanner | null>
  );
  const [loading, setLoading] = useState(true);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const now = new Date().toISOString().split('T')[0];
      
      // Get target_page values for requested placements
      const targetPages = placements.map(p => PLACEMENT_OPTIONS[p]);
      
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, target_page, active, start_date, end_date')
        .eq('active', true)
        .in('target_page', targetPages)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map results back to placement keys
      const result: Record<PlacementKey, PlacementBanner | null> = {} as Record<PlacementKey, PlacementBanner | null>;
      
      for (const placement of placements) {
        const targetPage = PLACEMENT_OPTIONS[placement];
        const banner = data?.find(b => b.target_page === targetPage) || null;
        result[placement] = banner;
      }

      setBanners(result);
    } catch (error) {
      console.error('Error fetching placement banners:', error);
      // Initialize with nulls on error
      const result: Record<PlacementKey, PlacementBanner | null> = {} as Record<PlacementKey, PlacementBanner | null>;
      for (const placement of placements) {
        result[placement] = null;
      }
      setBanners(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, [placements.join(',')]);

  // Subscribe to banner changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('placement-banner-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'banners' }, 
        () => {
          fetchBanners();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [placements.join(',')]);

  return {
    banners,
    loading,
    refetch: fetchBanners
  };
};
