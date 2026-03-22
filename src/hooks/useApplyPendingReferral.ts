import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const PENDING_REFERRAL_STORAGE_KEY = 'onemil_referral_ref';

/**
 * Applies a referral code stored in sessionStorage (e.g. from /register?ref=CODE)
 * when user lands after OAuth. Call once when user becomes available.
 */
export function useApplyPendingReferral(userId: string | undefined) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!userId || appliedRef.current) return;

    const pendingRef = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
    if (!pendingRef) return;

    appliedRef.current = true;

    (async () => {
      try {
        const { data: result } = await supabase.rpc('set_my_referrer_by_code', {
          p_code: pendingRef,
          p_source: 'signup',
        });
        sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
        if (result === 'accepted') {
          // Optional: toast can be shown by the caller or a global toast
          console.log('[Referral] Code applied from signup link');
        }
      } catch {
        // non-blocking
      }
    })();
  }, [userId]);
}
