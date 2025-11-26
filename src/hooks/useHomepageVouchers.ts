import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  is_public: boolean;
}

export const useHomepageVouchers = () => {
  const [vouchers, setVouchers] = useState<HomepageVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveVouchers = async () => {
    try {
      setLoading(true);

      // Fetch ALL public vouchers visible to everyone (including anon)
      const { data, error } = await supabase
        .from("vouchers")
        .select(
          "id, name, image_url, banner_url, max_quantity, redeemed_count, start_date, end_date, user_id, is_public",
        )
        .eq("is_public", true) // show public vouchers for everyone
        .order("created_at", { ascending: false });

      if (error) throw error;

      const now = new Date();

      // Filter active vouchers (date range)
      const activeVouchers = (data || []).filter((voucher) => {
        const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
        const endDate = voucher.end_date ? new Date(voucher.end_date) : null;

        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;

        return true;
      });

      setVouchers(activeVouchers);
    } catch (error) {
      console.error("Error fetching active vouchers:", error);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveVouchers();
  }, []);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("voucher-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "vouchers" }, () => {
        fetchActiveVouchers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calculate remaining count
  const getRemainingCount = (voucher: HomepageVoucher) => {
    if (!voucher.max_quantity) return "Neomezeně";
    const remaining = voucher.max_quantity - voucher.redeemed_count;
    return remaining > 0 ? remaining : 0;
  };

  // Check voucher availability
  const isVoucherAvailable = (voucher: HomepageVoucher) => {
    const now = new Date();
    const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
    const endDate = voucher.end_date ? new Date(voucher.end_date) : null;

    if (startDate && now < startDate) return false;
    if (endDate && now > endDate) return false;

    if (voucher.max_quantity && voucher.redeemed_count >= voucher.max_quantity) return false;

    return true;
  };

  const availableVouchers = vouchers.filter(isVoucherAvailable);

  return {
    vouchers: availableVouchers,
    loading,
    getRemainingCount,
    isVoucherAvailable,
    refetch: fetchActiveVouchers,
  };
};
