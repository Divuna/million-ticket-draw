import React from 'react';
import { AuthContext, useAuthState } from '@/hooks/useAuth';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const auth = useAuthState();

  if (auth.loading) {
    // Block app render until Supabase session is loaded from storage.
    // Prevents refresh race condition where app renders "logged out" briefly.
    // (Do not redirect or sign out here.)
    return null;
  }

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};
