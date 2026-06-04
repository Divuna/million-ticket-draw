import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global Bob (AI chat) on/off flag.
 *
 * Source of truth: settings.bob_enabled ('true' | 'false'), read via the
 * SECURITY DEFINER RPC get_bob_enabled() which exposes ONLY this boolean —
 * never any other settings row or secret. Defaults to true.
 *
 * - Customers call get_bob_enabled() (RPC) to decide whether to route to Bob.
 * - Admins additionally use setBobEnabledRemote() to flip the flag (admins have
 *   write RLS on public.settings; customers do not).
 */
export function useBobEnabled() {
  const [bobEnabled, setBobEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  const refetch = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("get_bob_enabled");
    if (!error && typeof data === "boolean") setBobEnabled(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /** Admin-only: persist the flag, then update local state. */
  const setBobEnabledRemote = useCallback(async (value: boolean) => {
    const { error } = await (supabase as any)
      .from("settings")
      .upsert(
        { key: "bob_enabled", value: value ? "true" : "false", updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (!error) setBobEnabled(value);
    return { error };
  }, []);

  return { bobEnabled, loading, refetch, setBobEnabledRemote };
}
