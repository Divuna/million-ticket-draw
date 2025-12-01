import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserVoucher {
  id: string;
  voucher_id: string;
  created_at: string;
  redeemed: boolean;
  voucher: {
    id: string;
    name: string;
    image_url: string;
    banner_url: string | null;
  };
  code: string;
}

export const useUserVouchers = () => {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch all vouchers for user
   */
  const fetchUserVouchers = async () => {
    if (!user) {
      setVouchers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("user_vouchers")
        .select(
          `
          id,
          voucher_id,
          created_at,
          redeemed,
          voucher:vouchers(id, name, image_url, banner_url)
        `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const transformedData = (data || []).map((item) => ({
        ...item,
        voucher: Array.isArray(item.voucher) ? item.voucher[0] : item.voucher,
        code: `OMV-${item.id.substring(0, 8).toUpperCase()}`,
      })) as UserVoucher[];

      setVouchers(transformedData);
    } catch (error) {
      console.error("Error fetching user vouchers:", error);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Optimistic remove — removes ONLY favorites (redeemed=false)
   */
  const optimisticRemoveByVoucherId = useCallback((voucherId: string) => {
    setVouchers((prev) => prev.filter((v) => !(v.voucher_id === voucherId && v.redeemed === false)));
  }, []);

  /**
   * Optimistic add — adds temporary favorite to local state
   */
  const optimisticAddFavorite = useCallback(
    (voucherId: string, voucherData: { id: string; name: string; image_url: string; banner_url: string | null }) => {
      const tempId = `fav-${Date.now()}`;

      const newEntry: UserVoucher = {
        id: tempId,
        voucher_id: voucherId,
        created_at: new Date().toISOString(),
        redeemed: false,
        voucher: voucherData,
        code: `OMV-${tempId.substring(0, 8).toUpperCase()}`,
      };

      // Add to list
      setVouchers((prev) => [newEntry, ...prev]);
    },
    [],
  );

  /**
   * Fetch vouchers on mount and when user changes
   */
  useEffect(() => {
    fetchUserVouchers();
  }, [user?.id]);

  /**
   * Realtime sync
   */
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("user-voucher-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_vouchers",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUserVouchers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    vouchers,
    loading,
    refetch: fetchUserVouchers,
    optimisticRemoveByVoucherId,
    optimisticAddFavorite,
  };
};
