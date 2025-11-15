import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, useAuthState } from "@/hooks/useAuth";

// Make supabase available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
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
