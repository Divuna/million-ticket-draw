import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/** Same-origin path only (open-redirect safe). Mirrors Login.tsx safeRedirectPath. */
function safeRedirectPath(raw: string | null): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)) return null;
  return decoded;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True when Supabase fired PASSWORD_RECOVERY (one-time setup/reset link clicked).
   *  Stays true until the user navigates away or completes the password update.
   *  Route guards must not redirect while this is true. */
  isPasswordRecovery: boolean;
  signUp: (email: string, password: string, marketingConsent?: boolean) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple' | 'facebook', redirectAfterLogin?: string | null) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthSession = () => {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // All setX calls here are batched by React 18 into a single re-render,
        // so isPasswordRecovery=true and user are visible together on the same render.
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
        if (event === 'USER_UPDATED') {
          // Password was successfully updated — recovery flow complete
          setIsPasswordRecovery(false);
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, marketingConsent: boolean = false) => {
    const normalizedEmail = email.trim().toLowerCase();
    const redirectUrl = `${import.meta.env.VITE_APP_URL || window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    if (!error && data.user) {
      // Store required legal acceptances
      const acceptances = [
        {
          user_id: data.user.id,
          document_slug: 'obchodni-podminky',
          document_version: '1.0'
        },
        {
          user_id: data.user.id,
          document_slug: 'gdpr',
          document_version: '1.0'
        },
        {
          user_id: data.user.id,
          document_slug: 'terms',
          document_version: '1.0'
        }
      ];
      
      // Add marketing consent only if accepted
      if (marketingConsent) {
        acceptances.push({
          user_id: data.user.id,
          document_slug: 'marketing',
          document_version: '1.0'
        });
      }
      
      await supabase.from('user_legal_acceptances').insert(acceptances);
      
      toast({
        title: "Registrace úspěšná",
        description: "Váš účet byl úspěšně vytvořen."
      });
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (!error && data.session) {
      // Apply session immediately so consumers (Login redirect, useUserRole) are not blocked
      // waiting for onAuthStateChange, which can lag one tick behind signInWithPassword.
      setSession(data.session);
      setUser(data.session.user);
      setLoading(false);
      toast({
        title: "Přihlášeno",
        description: "Úspěšně jste se přihlásili."
      });
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Odhlášeno",
      description: "Úspěšně jste se odhlásili."
    });
  };

  const signInWithOAuth = async (
    provider: 'google' | 'apple' | 'facebook',
    redirectAfterLogin?: string | null
  ) => {
    const base = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
    const safe = safeRedirectPath(redirectAfterLogin ?? null);
    // Return to /login?redirect=… so session + query survive OAuth callback; same validation as email login.
    const redirectTo = safe
      ? `${base}/login?redirect=${encodeURIComponent(safe)}`
      : `${base}/`;

    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined
      }
    });
  };

  return {
    user,
    session,
    loading,
    isPasswordRecovery,
    signUp,
    signIn,
    signOut,
    signInWithOAuth,
  };
};