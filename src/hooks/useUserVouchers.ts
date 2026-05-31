import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserVoucher {
  id: string;
  voucher_id: string;
  created_at: string;
  redeemed: boolean;
  /**
   * Voucher detail fetched in a separate query.
   * Null when the vouchers lookup returns no row (e.g. RLS edge-case) — UI
   * handles this gracefully; card still renders with the "Uplatnit voucher"
   * button because expiration is derived from `created_at`, not voucher data.
   */
  voucher: {
    id: string;
    name: string;
    image_url: string;
    banner_url: string | null;
  } | null;
  code: string;
}

export const useUserVouchers = () => {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch all vouchers for user.
   *
   * Uses two explicit queries instead of a single PostgREST embedded join.
   *
   * Why: the embedded join syntax
   *   `voucher:vouchers!user_vouchers_voucher_id_fkey(...)`
   * relies on the FK constraint name being identical to what PostgREST sees in
   * its schema cache. On environments where the constraint name differs (e.g.
   * a staging database restored from a dump) PostgREST returns a 400 that is
   * silently caught here, resulting in setVouchers([]) — an empty purchased
   * tab even though the DB row exists. Two separate queries are robust across
   * all environments and require no FK name assumptions.
   */
  const fetchUserVouchers = async () => {
    if (!user) {
      setVouchers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // ── Query 1: user_vouchers rows (no join) ────────────────────────────────
      const { data: uvData, error: uvError } = await supabase
        .from("user_vouchers")
        .select("id, voucher_id, created_at, redeemed")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (uvError) throw uvError;

      const rows = uvData || [];

      // ── Query 2: voucher details for the returned IDs ────────────────────────
      // If this query fails or RLS returns nothing the cards still render:
      // `expiration.isExpired` in Vouchers.tsx uses `created_at` from
      // user_vouchers only, so the "Uplatnit voucher" button is always visible
      // for a freshly purchased, non-expired voucher.
      const voucherMap = new Map<
        string,
        { id: string; name: string; image_url: string; banner_url: string | null }
      >();

      if (rows.length > 0) {
        const voucherIds = [...new Set(rows.map((r) => r.voucher_id))];
        const { data: vData } = await supabase
          .from("vouchers")
          .select("id, name, image_url, banner_url")
          .in("id", voucherIds);

        for (const v of vData || []) {
          voucherMap.set(v.id, v);
        }
      }

      // ── Combine ──────────────────────────────────────────────────────────────
      const transformedData: UserVoucher[] = rows.map((item) => ({
        id: item.id,
        voucher_id: item.voucher_id,
        created_at: item.created_at,
        redeemed: item.redeemed,
        voucher: voucherMap.get(item.voucher_id) ?? null,
        code: `OMV-${item.id.substring(0, 8).toUpperCase()}`,
      }));

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
   * Optimistic add — adds temporary favorite to local state.
   * voucherData may be null when voucher details are unavailable.
   */
  const optimisticAddFavorite = useCallback(
    (
      voucherId: string,
      voucherData: { id: string; name: string; image_url: string; banner_url: string | null } | null,
    ) => {
      const tempId = `fav-${Date.now()}`;

      const newEntry: UserVoucher = {
        id: tempId,
        voucher_id: voucherId,
        created_at: new Date().toISOString(),
        redeemed: false,
        voucher: voucherData,
        code: `OMV-${tempId.substring(0, 8).toUpperCase()}`,
      };

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
