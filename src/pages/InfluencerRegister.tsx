import { Navigate, useLocation } from 'react-router-dom';

/**
 * Legacy URL — kept only for backward compatibility (old bookmarks / marketing
 * links). The duplicate legacy registration form (direct insert into
 * `partners` with notes.type='influencer') has been retired: it bypassed the
 * canonical Affiliate v2 system (`affiliate_accounts` +
 * `register_affiliate_account` RPC) entirely.
 *
 * /influencer/register -> /affiliate/register (any query string preserved,
 * e.g. a future ?ref=/?via= style param — AffiliateRegister.tsx itself does
 * not currently read any, this is a harmless forward-compat pass-through).
 *
 * Pure client-side redirect only. Does not read/write any table, does not
 * call any Supabase function, does not duplicate or replace the existing
 * register_affiliate_account attribution flow.
 */
const InfluencerRegister = () => {
  const location = useLocation();
  return <Navigate to={`/affiliate/register${location.search}`} replace />;
};

export default InfluencerRegister;
