import { Navigate, useParams } from 'react-router-dom';

/**
 * Short public alias for the Affiliate "Obchodník" company link.
 *
 * /a/:refCode -> /partner/register?via=:refCode
 *
 * Pure client-side redirect only. Does not read/write any Affiliate table,
 * does not call any Supabase function, and does not duplicate or replace
 * the existing `via` attribution logic in PartnerRegister.tsx /
 * record_affiliate_company_ref. The existing long-form link
 * (/partner/register?via=KOD) keeps working unchanged.
 */
const AffiliateShortLink = () => {
  const { refCode } = useParams<{ refCode: string }>();
  const trimmedCode = (refCode || '').trim();

  if (!trimmedCode) {
    return <Navigate to="/partner/register" replace />;
  }

  return <Navigate to={`/partner/register?via=${encodeURIComponent(trimmedCode)}`} replace />;
};

export default AffiliateShortLink;
