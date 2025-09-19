import { useState, createContext, useContext } from 'react';
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
  if (context === undefined) {
    throw new Error('useTestAuth must be used within a TestAuthProvider');
  }
  return context;
};

export const useTestAuthState = () => {
  const [testUser, setTestUser] = useState<TestUser | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);

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
      setTestUser({
        id: userData.id,
        email: userData.email,
        name: userData.name || undefined
      });
      setIsTestMode(true);

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