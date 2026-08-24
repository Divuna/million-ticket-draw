import { Navigate, useParams } from 'react-router-dom';

/**
 * Short public alias for the player/customer referral link shown in
 * ReferralSection.tsx (/profile).
 *
 * /r/:refCode -> /register?ref=:refCode
 *
 * Pure client-side redirect only — mirrors InfluencerShortLink.tsx /
 * AffiliateShortLink.tsx. Does not read/write any table, does not call any
 * Supabase function, and does not duplicate or replace the existing `ref`
 * capture/attribution logic in Register.tsx / useApplyPendingReferral /
 * useApplyPendingAffiliateRef / set_my_referrer_by_code /
 * record_affiliate_customer_ref. The existing long-form link
 * (/register?ref=KOD) keeps working unchanged.
 *
 * Only the refCode path segment is forwarded — a deliberate whitelist, not a
 * blind pass-through of the current query string, so nothing else can leak
 * into the ?ref= param.
 */
const CustomerReferralShortLink = () => {
  const { refCode } = useParams<{ refCode: string }>();
  const trimmedCode = (refCode || '').trim();

  if (!trimmedCode) {
    return <Navigate to="/register" replace />;
  }

  return <Navigate to={`/register?ref=${encodeURIComponent(trimmedCode)}`} replace />;
};

export default CustomerReferralShortLink;
