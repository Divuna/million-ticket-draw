import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDateOfBirthCheck } from '@/hooks/useDateOfBirthCheck';
import { useUserRole } from '@/hooks/useUserRole';

interface DateOfBirthGuardProps {
  children: React.ReactNode;
}

// Routes that don't require date of birth check
const EXEMPT_ROUTES = [
  '/login',
  '/register',
  '/onboarding/date-of-birth',
  '/unsubscribe/marketing',
  '/share/ticket',
  '/legal/',
  '/test-login'
];

export const DateOfBirthGuard: React.FC<DateOfBirthGuardProps> = ({ children }) => {
  const { user } = useAuth();
  const { isLoading, hasDateOfBirth } = useDateOfBirthCheck();
  const { role, loading: roleLoading } = useUserRole();
  const location = useLocation();

  // Check if current route is exempt
  const isExemptRoute = EXEMPT_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route)
  );

  // Also exempt content pages (legal documents etc.)
  const isContentPage = /^\/[^/]+\/[^/]+$/.test(location.pathname) && 
    !location.pathname.startsWith('/admin') &&
    !location.pathname.startsWith('/my-') &&
    !location.pathname.startsWith('/contest') &&
    !location.pathname.startsWith('/bonus') &&
    !location.pathname.startsWith('/messages') &&
    !location.pathname.startsWith('/payment');

  // If route is exempt, render children
  if (isExemptRoute || isContentPage) {
    return <>{children}</>;
  }

  // If no user, don't enforce (let other auth guards handle it)
  if (!user) {
    return <>{children}</>;
  }

  // Admin and superadmin users are always exempt from onboarding guards
  // (they must never be redirected to date-of-birth or other onboarding flows)
  if (!roleLoading && (role === 'admin' || role === 'superadmin')) {
    return <>{children}</>;
  }

  // If still loading, show loading state
  if (isLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user is logged in but has no date of birth, redirect to onboarding
  if (hasDateOfBirth === false) {
    return <Navigate to="/onboarding/date-of-birth" replace />;
  }

  return <>{children}</>;
};
