import React from 'react';
import { TestAuthContext, useTestAuthState } from '@/hooks/useTestAuth';

interface TestAuthProviderProps {
  children: React.ReactNode;
}

const TestAuthProvider: React.FC<TestAuthProviderProps> = ({ children }) => {
  const testAuthState = useTestAuthState();

  return (
    <TestAuthContext.Provider value={testAuthState}>
      {children}
    </TestAuthContext.Provider>
  );
};

export default TestAuthProvider;