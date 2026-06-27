import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Partner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  created_at: string;
  updated_at: string;
  status: string;
  logo_status: string;
}

/**
 * Hook for fetching partners that should be displayed publicly (e.g., homepage).
 * Only returns partners with:
 * - status = 'approved'
 * - logo_status = 'approved'
 * - logo_url IS NOT NULL
 */
export const usePartners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const { data, error } = await supabase
          .from('public_partners' as never)
          .select('id, name, logo_url, website_url, created_at, updated_at, status, logo_status')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPartners((data || []) as Partner[]);
      } catch (error) {
        console.error('Error fetching partners:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPartners();
  }, []);

  return { partners, loading };
};
