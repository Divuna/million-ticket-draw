import { Navigate, useParams } from 'react-router-dom';

/**
 * Short public alias for the Affiliate "Influencer" customer link.
 *
 * /i/:refCode -> /?ref=:refCode
 *
 * Pure client-side redirect only. Does not read/write any Affiliate table,
 * does not call any Supabase function, and does not duplicate or replace
 * the existing customer `ref` attribution logic (useApplyPendingReferral /
 * ensure_referral_code / set_my_referrer_by_code). The existing long-form
 * link (/?ref=KOD) keeps working unchanged.
 */
const InfluencerShortLink = () => {
  const { refCode } = useParams<{ refCode: string }>();
  const trimmedCode = (refCode || '').trim();

  if (!trimmedCode) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/?ref=${encodeURIComponent(trimmedCode)}`} replace />;
};

export default InfluencerShortLink;
