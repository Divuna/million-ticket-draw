import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Partner e-shop landing: pending partner attribution nonce captured from
 * /register?p=KOD (&c=CONNECTION_ID) via record_pending_partner_attribution_intent
 * (see Register.tsx). Kept separate from the legacy referral and affiliate
 * systems — different table, different RPC.
 */
export const PENDING_PARTNER_ATTRIBUTION_STORAGE_KEY = 'onemil_partner_attribution_nonce';

/**
 * Applies a pending partner attribution nonce (stored in sessionStorage by
 * Register.tsx) once a logged-in user is available — regardless of how the
 * session was established: immediate email/password signup, a signup that
 * required e-mail confirmation first, or a Google/Facebook OAuth redirect
 * return. This is the single mechanism that calls record_partner_customer_ref;
 * call once, globally, when userId becomes available (mirrors
 * useApplyPendingAffiliateRef / useApplyPendingReferral).
 *
 * The RPC is first-touch/idempotent server-side, so calling it more than
 * once for the same user is always safe.
 */
export function useApplyPendingPartnerRef(userId: string | undefined) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!userId || appliedRef.current) return;

    const pendingNonce = sessionStorage.getItem(PENDING_PARTNER_ATTRIBUTION_STORAGE_KEY);
    if (!pendingNonce) return;

    appliedRef.current = true;

    (async () => {
      try {
        const { error } = await (supabase as any).rpc('record_partner_customer_ref', {
          p_nonce: pendingNonce,
        });

        if (error) {
          // Transient / network-level failure calling the RPC itself — keep the
          // pending nonce so a later mount (reload, re-login) can retry. Must
          // never block or break the signed-in app.
          appliedRef.current = false;
          return;
        }

        // The RPC returned a definitive response — the server made its
        // decision, so the pending nonce is cleared either way.
        sessionStorage.removeItem(PENDING_PARTNER_ATTRIBUTION_STORAGE_KEY);
      } catch {
        // Non-blocking; do not clear so a later attempt can retry.
        appliedRef.current = false;
      }
    })();
  }, [userId]);
}
