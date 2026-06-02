import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const PENDING_AFFILIATE_STORAGE_KEY = 'onemil_affiliate_aff';

// Server-side regex (record_affiliate_customer_attribution): ^[A-Z0-9][A-Z0-9_-]{2,31}$
const AFFILIATE_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/**
 * Normalizes a raw affiliate code candidate (uppercase + trim) and validates it
 * against the same regex the RPC enforces. Returns the normalized code, or null
 * if it is empty / invalid. Never throws.
 */
export function normalizeAffiliateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!AFFILIATE_CODE_REGEX.test(code)) return null;
  return code;
}

/**
 * Captures an `aff` affiliate code from the current URL into sessionStorage so it
 * can be applied once the user is authenticated.
 *
 * Strict separation from the legacy `ref` referral system:
 * - The legacy `ref` code ALWAYS wins. If the URL contains `ref`, the `aff` code is
 *   ignored and NOT stored (no mixing of the two systems).
 * - Only valid, normalized affiliate codes are stored.
 * - Never overwrites an already stored pending affiliate code.
 *
 * @returns true if an affiliate code was stored, false otherwise.
 */
export function capturePendingAffiliateFromUrl(search: string): boolean {
  try {
    const params = new URLSearchParams(search);

    // Legacy ref has priority — if ref is present, ignore aff entirely.
    const ref = params.get('ref')?.trim();
    if (ref) return false;

    const code = normalizeAffiliateCode(params.get('aff'));
    if (!code) return false;

    // First-touch: do not overwrite an already captured pending code.
    if (sessionStorage.getItem(PENDING_AFFILIATE_STORAGE_KEY)) return false;

    sessionStorage.setItem(PENDING_AFFILIATE_STORAGE_KEY, code);
    return true;
  } catch {
    // sessionStorage unavailable / SSR — non-blocking.
    return false;
  }
}

/**
 * Applies a pending affiliate code (captured from `/?aff=CODE`) once the user is
 * authenticated, by calling the `record_affiliate_customer_attribution` RPC.
 *
 * Mirrors useApplyPendingReferral but is fully independent:
 * - Separate sessionStorage key (`onemil_affiliate_aff`).
 * - Separate RPC (`record_affiliate_customer_attribution`).
 * - First-touch attribution wins; the RPC never overwrites existing attribution.
 * - Unknown / inactive codes are silently ignored (logged to console only).
 * - Must never break registration or login — all errors are swallowed.
 *
 * No link whatsoever to Stripe, payments, wallet, commissions or the legacy
 * influencer/referral system.
 */
export function useApplyPendingAffiliate(userId: string | undefined) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!userId || appliedRef.current) return;

    let pendingAff: string | null = null;
    try {
      pendingAff = sessionStorage.getItem(PENDING_AFFILIATE_STORAGE_KEY);
    } catch {
      return;
    }
    if (!pendingAff) return;

    const code = normalizeAffiliateCode(pendingAff);
    if (!code) {
      // Stored value somehow invalid — clear it and stop.
      try {
        sessionStorage.removeItem(PENDING_AFFILIATE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    appliedRef.current = true;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('record_affiliate_customer_attribution', {
          p_affiliate_code: code,
          p_source: 'direct_link',
          p_landing_url:
            typeof window !== 'undefined' ? window.location.href.slice(0, 2000) : null,
          p_metadata: { captured_via: 'aff_url' },
        });

        // Clear storage regardless of outcome so we don't retry an unknown/inactive code.
        try {
          sessionStorage.removeItem(PENDING_AFFILIATE_STORAGE_KEY);
        } catch {
          /* ignore */
        }

        if (error) {
          // Unknown / inactive / invalid code — silently ignore, just log.
          console.log('[Affiliate] aff attribution not recorded:', error.message);
          return;
        }
        console.log('[Affiliate] aff attribution result:', data);
      } catch (err) {
        // Non-blocking — never break the auth flow.
        console.log('[Affiliate] aff attribution failed (non-blocking):', err);
      }
    })();
  }, [userId]);
}
