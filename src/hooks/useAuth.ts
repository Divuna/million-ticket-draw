import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  signInWithOAuth: (provider: "google" | "apple") => Promise<any>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔄 Setting up auth state listener...');
    
    // Set up auth listener FIRST - this handles all auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('🔔 Auth state changed:', event, newSession ? 'session exists' : 'no session');
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      // Clear loading on any auth state change after initial load
      if (loading) {
        setLoading(false);
      }
    });

    // Then fetch the current session
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('❌ Error loading session:', error);
      } else {
        console.log('✅ Initial session loaded:', data.session ? 'active' : 'none');
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => {
      console.log('🧹 Cleaning up auth subscription');
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('🔐 Attempting sign in...');
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      console.error('❌ Sign in error:', result.error);
    } else {
      console.log('✅ Sign in successful');
    }
    return result;
  };

  const signUp = async (email: string, password: string) => {
    console.log('📝 Attempting sign up...');
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (result.error) {
      console.error('❌ Sign up error:', result.error);
    } else {
      console.log('✅ Sign up successful');
    }
    return result;
  };

  const signOut = async () => {
    console.log('👋 Signing out...');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.error('❌ Sign out error:', error);
      } else {
        console.log('✅ Sign out successful');
      }
    } finally {
      // Always clear local state
      setSession(null);
      setUser(null);
    }
  };

  const signInWithOAuth = async (provider: "google" | "apple") => {
    console.log('🔗 Attempting OAuth sign in with:', provider);
    const result = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (result.error) {
      console.error('❌ OAuth sign in error:', result.error);
    }
    return result;
  };

  return { user, session, loading, signIn, signUp, signOut, signInWithOAuth };
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
