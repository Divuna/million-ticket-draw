import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signUp: (email: string, password: string, marketingConsent?: boolean) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple' | 'facebook') => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, marketingConsent: boolean = false) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
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

  const signInWithOAuth = async (provider: 'google' | 'apple' | 'facebook') => {
    // OAuth will redirect to origin, then we handle admin check in auth state change
    const redirectUrl = `${window.location.origin}/`;
    
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined
      }
    });
  };

  return {
    user,
    session,
    signUp,
    signIn,
    signOut,
    signInWithOAuth,
  };
};