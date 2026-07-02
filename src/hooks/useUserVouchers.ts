import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserVoucher {
  id: string;
  voucher_id: string;
  created_at: string;
  redeemed: boolean;
  voucher_code_id: string | null;
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
    short_description: string | null;
    usage_description: string | null;
    terms_text: string | null;
    how_to_use_text: string | null;
  } | null;
  code: string | null;
}

const VOUCHER_SELECT_FULL =
  "id, name, image_url, banner_url, short_description, usage_description, terms_text, how_to_use_text";

const VOUCHER_SELECT_BASE = "id, name, image_url, banner_url";

const isOptionalVoucherTextColumnError = (error: unknown) => {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : "";

  return /short_description|usage_description|terms_text|how_to_use_text/i.test(message);
};

const withVoucherTextFallback = (voucher: any) => ({
  ...voucher,
  short_description: voucher.short_description ?? null,
  usage_description: voucher.usage_description ?? null,
  terms_text: voucher.terms_text ?? null,
  how_to_use_text: voucher.how_to_use_text ?? null,
});

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
        .select("id, voucher_id, created_at, redeemed, voucher_code_id")
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
        {
          id: string;
          name: string;
          image_url: string;
          banner_url: string | null;
          short_description: string | null;
          usage_description: string | null;
          terms_text: string | null;
          how_to_use_text: string | null;
        }
      >();

      if (rows.length > 0) {
        const voucherIds = [...new Set(rows.map((r) => r.voucher_id))];
        let { data: vData, error: vError } = await supabase
          .from("vouchers")
          .select(VOUCHER_SELECT_FULL)
          .in("id", voucherIds);

        if (vError && isOptionalVoucherTextColumnError(vError)) {
          const fallback = await supabase
            .from("vouchers")
            .select(VOUCHER_SELECT_BASE)
            .in("id", voucherIds);

          vData = fallback.data;
          vError = fallback.error;
        }

        if (vError) throw vError;

        for (const v of vData || []) {
          voucherMap.set(v.id, withVoucherTextFallback(v));
        }
      }

      const voucherCodeMap = new Map<string, string>();

      const voucherCodeIds = [
        ...new Set(
          rows
            .filter((r) => r.redeemed && r.voucher_code_id)
            .map((r) => r.voucher_code_id as string),
        ),
      ];

      if (voucherCodeIds.length > 0) {
        const { data: codeData, error: codeError } = await supabase
          .from("voucher_codes")
          .select("id, code")
          .in("id", voucherCodeIds);

        if (codeError) throw codeError;

        for (const codeRow of codeData || []) {
          voucherCodeMap.set(codeRow.id, codeRow.code);
        }
      }

      // ── Combine ──────────────────────────────────────────────────────────────
      const transformedData: UserVoucher[] = rows.map((item) => ({
        id: item.id,
        voucher_id: item.voucher_id,
        created_at: item.created_at,
        redeemed: item.redeemed,
        voucher_code_id: item.voucher_code_id,
        voucher: voucherMap.get(item.voucher_id) ?? null,
        code: item.voucher_code_id ? voucherCodeMap.get(item.voucher_code_id) ?? null : null,
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
      voucherData: {
        id: string;
        name: string;
        image_url: string;
        banner_url: string | null;
        short_description: string | null;
        usage_description: string | null;
        terms_text: string | null;
        how_to_use_text: string | null;
      } | null,
    ) => {
      const tempId = `fav-${Date.now()}`;

      const newEntry: UserVoucher = {
        id: tempId,
        voucher_id: voucherId,
        created_at: new Date().toISOString(),
        redeemed: false,
        voucher_code_id: null,
        voucher: voucherData,
        code: null,
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
