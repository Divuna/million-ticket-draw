import React, { useState, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface TestUser {
  id: string;
  email: string;
  name?: string;
}

interface TestAuthContextType {
  testUser: TestUser | null;
  testSignIn: (email: string) => Promise<{ error: any }>;
  testSignOut: () => void;
  isTestMode: boolean;
}

export const TestAuthContext = createContext<TestAuthContextType | undefined>(undefined);

export const useTestAuth = () => {
  const context = useContext(TestAuthContext);
  
  // Return a default object if context is not available (for safety)
  if (context === undefined) {
    return {
      testUser: null,
      testSignIn: async () => ({ error: { message: 'Test auth not available' } }),
      testSignOut: () => {},
      isTestMode: false,
    };
  }
  return context;
};

export const useTestAuthState = () => {
  const [testUser, setTestUser] = useState<TestUser | null>(() => {
    const stored = localStorage.getItem('testUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [isTestMode, setIsTestMode] = useState(() => {
    const stored = localStorage.getItem('isTestMode');
    return stored === 'true';
  });

  const testSignIn = async (email: string) => {
    try {
      // Check if user exists in the users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('email', email.toLowerCase())
        .single();

      if (userError || !userData) {
        return { 
          error: { 
            message: 'Uživatel s tímto emailem nebyl nalezen v systému.' 
          } 
        };
      }

      // Set test user state
      const user = {
        id: userData.id,
        email: userData.email,
        name: userData.name || undefined
      };
      setTestUser(user);
      setIsTestMode(true);
      
      // Persist to localStorage
      localStorage.setItem('testUser', JSON.stringify(user));
      localStorage.setItem('isTestMode', 'true');

      toast({
        title: "🧪 TEST REŽIM",
        description: `Přihlášen jako ${email} (POUZE PRO TESTOVÁNÍ)`,
        variant: "default"
      });

      return { error: null };
      
    } catch (error) {
      console.error('Test login error:', error);
      return { 
        error: { 
          message: 'Chyba při ověřování uživatele.' 
        } 
      };
    }
  };

  const testSignOut = () => {
    setTestUser(null);
    setIsTestMode(false);
    
    // Clear from localStorage
    localStorage.removeItem('testUser');
    localStorage.removeItem('isTestMode');
    
    toast({
      title: "🧪 TEST REŽIM",
      description: "Odhlášen z test režimu",
      variant: "default"
    });
  };

  return {
    testUser,
    testSignIn,
    testSignOut,
    isTestMode,
  };
};