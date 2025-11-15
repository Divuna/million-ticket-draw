import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, useAuthState } from "@/hooks/useAuth";

// Initialize Supabase client globally
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
  console.log('✅ Supabase client initialized globally');
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Verify supabase client is working
    const checkClient = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('❌ Supabase client error:', error);
        } else {
          console.log('✅ Supabase client working, session:', data.session ? 'active' : 'none');
        }
      } catch (err) {
        console.error('❌ Supabase client check failed:', err);
      }
    };
    checkClient();
  }, []);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}
