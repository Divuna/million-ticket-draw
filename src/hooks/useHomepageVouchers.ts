import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface HomepageVoucher {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
  max_quantity: number | null;
  redeemed_count: number;
  start_date: string | null;
  end_date: string | null;
  user_id: string | null;
}

export const useHomepageVouchers = () => {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<HomepageVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveVouchers = async () => {
    try {
      setLoading(true);
      
      // Build query to fetch vouchers that are either unassigned (user_id IS NULL) 
      // or assigned to the current user
      let query = supabase
        .from('vouchers')
        .select('id, name, image_url, banner_url, max_quantity, redeemed_count, start_date, end_date, user_id')
        .order('created_at', { ascending: false });

      // Filter by user assignment - unassigned or assigned to current user
      if (user) {
        query = query.or(`user_id.is.null,user_id.eq.${user.id}`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter vouchers to only include those within valid date range
      const now = new Date();
      const activeVouchers = (data || []).filter(voucher => {
        const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
        const endDate = voucher.end_date ? new Date(voucher.end_date) : null;
        
        // Check if voucher is within date range
        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;
        
        // Include voucher if it's active within date range
        return true;
      });

      setVouchers(activeVouchers);
    } catch (error) {
      console.error('Error fetching active vouchers:', error);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveVouchers();
  }, [user?.id]);

  // Subscribe to voucher changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('voucher-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'vouchers' }, 
        () => {
          fetchActiveVouchers(); // Refresh vouchers when any voucher changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const getRemainingCount = (voucher: HomepageVoucher) => {
    if (!voucher.max_quantity) return 'Neomezeně';
    const remaining = voucher.max_quantity - voucher.redeemed_count;
    return remaining > 0 ? remaining : 0;
  };

  const isVoucherAvailable = (voucher: HomepageVoucher) => {
    const now = new Date();
    const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
    const endDate = voucher.end_date ? new Date(voucher.end_date) : null;
    
    // Check date validity
    if (startDate && now < startDate) return false;
    if (endDate && now > endDate) return false;
    
    // Check quantity availability
    if (voucher.max_quantity && voucher.redeemed_count >= voucher.max_quantity) return false;
    
    return true;
  };

  // Filter to only show available vouchers in homepage
  const availableVouchers = vouchers.filter(isVoucherAvailable);

  return {
    vouchers: availableVouchers,
    loading,
    getRemainingCount,
    isVoucherAvailable,
    refetch: fetchActiveVouchers
  };
};