import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the count of partner_offers with status = 'submitted'.
 * Updates in real-time via Supabase Realtime channel.
 */
export const usePendingOffersCount = () => {
  const [pendingCount, setPendingCount] = useState(0);

  const fetchCount = async () => {
    try {
      const { count, error } = await supabase
        .from('partner_offers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'submitted');
      if (!error) setPendingCount(count ?? 0);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchCount();

    const channel = supabase
      .channel('pending-offers-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_offers' }, fetchCount)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  return { pendingCount, refresh: fetchCount };
};
