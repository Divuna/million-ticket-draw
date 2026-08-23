import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Affiliate v2: pending customer ref_code captured from ?ref= on /register
 * (see Register.tsx). Kept separate from the legacy PENDING_REFERRAL_STORAGE_KEY
 * (useApplyPendingReferral) — different table, different RPC.
 */
export const PENDING_AFFILIATE_REF_STORAGE_KEY = 'onemil_affiliate_ref';

/**
 * Applies a pending Affiliate customer ref_code (stored in sessionStorage by
 * Register.tsx) once a logged-in user is available — regardless of how the
 * session was established: immediate email/password signup, a signup that
 * required e-mail confirmation first, or a Google/Facebook OAuth redirect
 * return. This is the single mechanism that calls
 * record_affiliate_customer_ref; call once, globally, when userId becomes
 * available (mirrors useApplyPendingReferral for the legacy referral system).
 *
 * The RPC is first-touch/idempotent server-side, so calling it more than
 * once for the same user is always safe and never overwrites an existing
 * attribution.
 */
export function useApplyPendingAffiliateRef(userId: string | undefined) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!userId || appliedRef.current) return;

    const pendingRef = sessionStorage.getItem(PENDING_AFFILIATE_REF_STORAGE_KEY);
    if (!pendingRef) return;

    appliedRef.current = true;

    (async () => {
      try {
        const { error } = await (supabase as any).rpc('record_affiliate_customer_ref', {
          p_ref_code: pendingRef,
        });

        if (error) {
          // Transient / network-level failure calling the RPC itself — keep the
          // pending code so a later mount (reload, re-login) can retry. Must
          // never block or break the signed-in app.
          appliedRef.current = false;
          return;
        }

        // The RPC always returns a definitive jsonb status (recorded /
        // already_attributed / invalid_code / not_eligible / self_referral /
        // unauthenticated) once it actually runs — any of those means the
        // server made its decision, so the pending code is cleared either way.
        sessionStorage.removeItem(PENDING_AFFILIATE_REF_STORAGE_KEY);
      } catch {
        // Non-blocking; do not clear so a later attempt can retry.
        appliedRef.current = false;
      }
    })();
  }, [userId]);
}
