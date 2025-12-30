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

  return (
    <AuthContext.Provider value={auth}>
      <PresenceTracker>
        {children}
      </PresenceTracker>
    </AuthContext.Provider>
  );
};