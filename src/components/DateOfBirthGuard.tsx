import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDateOfBirthCheck } from '@/hooks/useDateOfBirthCheck';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

interface DateOfBirthGuardProps {
  children: React.ReactNode;
}

// Routes that don't require email confirmation or date of birth check
const EXEMPT_ROUTES = [
  '/login',
  '/register',
  '/onboarding/date-of-birth',
  '/unsubscribe/marketing',
  '/share/ticket',
  '/legal/',
  '/admin',
  '/influencer',
  '/partner',
];

const EmailNotConfirmed: React.FC<{ email: string | undefined }> = ({ email }) => {
  const { signOut } = useAuth();
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/`,
        },
      });
      setSent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Potvrďte svůj e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Na adresu <strong>{email}</strong> jsme vám zaslali potvrzovací odkaz.
          Klikněte na něj a pokračujte do aplikace.
        </p>
        <Button
          variant="outline"
          className="w-full"
          disabled={resending || sent}
          onClick={handleResend}
        >
          {sent ? 'E-mail odeslán' : resending ? 'Odesílám...' : 'Znovu odeslat e-mail'}
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
          Odhlásit se
        </Button>
      </div>
    </div>
  );
};

export const DateOfBirthGuard: React.FC<DateOfBirthGuardProps> = ({ children }) => {
  const { user } = useAuth();
  const { isLoading } = useDateOfBirthCheck();
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

  // Email must be confirmed before anything else
  if (!user.email_confirmed_at) {
    return <EmailNotConfirmed email={user.email} />;
  }

  // If still loading, show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
};
