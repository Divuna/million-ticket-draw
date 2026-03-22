import React from 'react';
import { AuthContext, useAuthState } from '@/hooks/useAuth';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';

interface AuthProviderProps {
  children: React.ReactNode;
}

// Inner component to use hooks that depend on AuthContext
const PresenceTracker: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Track user's online presence for live "Online teď" indicator
  useOnlinePresence();
  return <>{children}</>;
};

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
      <PresenceTracker>
        {children}
      </PresenceTracker>
    </AuthContext.Provider>
  );
};