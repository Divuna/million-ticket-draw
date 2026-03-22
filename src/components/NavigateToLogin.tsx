import { Navigate, useLocation } from 'react-router-dom';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';

/** Sends user to /login with ?redirect= current path (for return after sign-in). */
export function NavigateToLogin() {
  const location = useLocation();
  return <Navigate to={buildLoginRedirectUrl(location.pathname + location.search)} replace />;
}
