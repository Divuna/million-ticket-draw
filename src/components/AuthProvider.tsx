import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, useAuthState } from "@/hooks/useAuth";

// Initialize Supabase client globally and ensure it's always available
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
  console.log('✅ Supabase client exposed globally as window.supabase');
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Verify supabase client is working correctly
    const verifyClient = async () => {
      try {
        console.log('🔍 Verifying Supabase client...');
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Supabase client verification failed:', error);
        } else {
          console.log('✅ Supabase client verified, session status:', data.session ? 'active' : 'none');
        }
        
        // Ensure window.supabase is still available
        if (typeof window !== 'undefined' && !(window as any).supabase) {
          console.warn('⚠️ window.supabase was cleared, restoring...');
          (window as any).supabase = supabase;
        }
      } catch (err) {
        console.error('❌ Supabase client check exception:', err);
      }
    };
    
    verifyClient();
    
    // Periodically verify the client is still available
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && !(window as any).supabase) {
        console.warn('⚠️ window.supabase was cleared, restoring...');
        (window as any).supabase = supabase;
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();

  useEffect(() => {
    console.log('🔐 AuthProvider mounted, current user:', authState.user?.email || 'none');
  }, [authState.user]);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}
