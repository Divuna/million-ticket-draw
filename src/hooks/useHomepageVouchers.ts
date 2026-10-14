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
  short_description: string | null;
  usage_description: string | null;
  terms_text: string | null;
  how_to_use_text: string | null;
  user_id: string | null;
  is_public: boolean;
  available_code_count: number;
}

const withVoucherTextFallback = (voucher: HomepageVoucher): HomepageVoucher => ({
  ...voucher,
  short_description: voucher.short_description ?? null,
  usage_description: voucher.usage_description ?? null,
  terms_text: voucher.terms_text ?? null,
  how_to_use_text: voucher.how_to_use_text ?? null,
  available_code_count: Number(voucher.available_code_count ?? 0),
});

export const useHomepageVouchers = () => {
  const [vouchers, setVouchers] = useState<HomepageVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveVouchers = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc("get_public_available_vouchers");

      if (error) throw error;

      setVouchers((data || []).map(withVoucherTextFallback));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "voucher_codes" }, () => {
        fetchActiveVouchers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getRemainingCount = (voucher: HomepageVoucher) => {
    return Math.max(0, voucher.available_code_count);
  };

  const isVoucherAvailable = (voucher: HomepageVoucher) => {
    return voucher.is_public && voucher.available_code_count > 0;
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
