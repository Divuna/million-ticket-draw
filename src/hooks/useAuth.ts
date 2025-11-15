import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: "google" | "apple") => Promise<any>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    console.log('🔄 Initializing auth state...');
    
    // Set up auth listener FIRST - this handles all auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('🔔 Auth event:', event, newSession ? '✅ session active' : '❌ no session');
      
      // Update state based on the new session
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      // Handle specific events
      if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out, clearing state');
        setSession(null);
        setUser(null);
        setIsSigningOut(false);
      } else if (event === 'SIGNED_IN') {
        console.log('✅ User signed in');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
      }
      
      // Clear loading state after first event
      if (loading) {
        setLoading(false);
      }
    });

    // Then fetch the current session
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('❌ Error loading initial session:', error);
      } else {
        console.log('📋 Initial session check:', data.session ? '✅ active' : '❌ none');
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch((err) => {
      console.error('❌ Fatal error loading session:', err);
      setLoading(false);
    });

    return () => {
      console.log('🧹 Cleaning up auth subscription');
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('🔐 Attempting sign in for:', email);
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        console.error('❌ Sign in error:', result.error.message);
      } else {
        console.log('✅ Sign in successful');
      }
      return result;
    } catch (err) {
      console.error('❌ Sign in exception:', err);
      throw err;
    }
  };

  const signUp = async (email: string, password: string) => {
    console.log('📝 Attempting sign up for:', email);
    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (result.error) {
        console.error('❌ Sign up error:', result.error.message);
      } else {
        console.log('✅ Sign up successful');
      }
      return result;
    } catch (err) {
      console.error('❌ Sign up exception:', err);
      throw err;
    }
  };

  const signOut = async () => {
    // Prevent multiple simultaneous logout attempts
    if (isSigningOut) {
      console.log('⚠️ Sign out already in progress, skipping');
      return;
    }

    console.log('👋 Initiating sign out...');
    setIsSigningOut(true);

    try {
      // Check if there's actually a session to sign out
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        console.log('ℹ️ No active session found, clearing local state only');
        setSession(null);
        setUser(null);
        setIsSigningOut(false);
        return;
      }

      console.log('📤 Signing out active session...');
      
      // Attempt to sign out with global scope
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      
      if (error) {
        // If error is about session not found, it's already signed out
        if (error.message.includes('session_not_found') || error.message.includes('Session not found')) {
          console.log('ℹ️ Session already cleared on server, clearing local state');
        } else {
          console.error('❌ Sign out error:', error.message);
        }
      } else {
        console.log('✅ Sign out successful');
      }
    } catch (err: any) {
      console.error('❌ Sign out exception:', err);
      // Even on error, clear local state
    } finally {
      // Always clear local state regardless of server response
      console.log('🧹 Clearing local auth state');
      setSession(null);
      setUser(null);
      setIsSigningOut(false);
    }
  };

  const signInWithOAuth = async (provider: "google" | "apple") => {
    console.log('🔗 Attempting OAuth sign in with:', provider);
    try {
      const result = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (result.error) {
        console.error('❌ OAuth error:', result.error.message);
      } else {
        console.log('✅ OAuth redirect initiated');
      }
      return result;
    } catch (err) {
      console.error('❌ OAuth exception:', err);
      throw err;
    }
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
