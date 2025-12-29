import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DateOfBirthCheckResult {
  isLoading: boolean;
  hasDateOfBirth: boolean | null;
  dateOfBirth: string | null;
  setDateOfBirthOptimistic: (dob: string) => void;
}

const DateOfBirthContext = createContext<DateOfBirthCheckResult | null>(null);

export const DateOfBirthProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasDateOfBirth, setHasDateOfBirth] = useState<boolean | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const skipFetchRef = useRef(false);

  const setDateOfBirthOptimistic = useCallback((dob: string) => {
    skipFetchRef.current = true;
    setDateOfBirth(dob);
    setHasDateOfBirth(true);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const checkDateOfBirth = async () => {
      if (!user?.id) {
        setIsLoading(false);
        setHasDateOfBirth(null);
        return;
      }

      if (skipFetchRef.current) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('date_of_birth')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking date of birth:', error);
          setHasDateOfBirth(false);
        } else {
          const dob = (data as any)?.date_of_birth;
          setDateOfBirth(dob || null);
          setHasDateOfBirth(!!dob);
        }
      } catch (error) {
        console.error('Error:', error);
        setHasDateOfBirth(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkDateOfBirth();
  }, [user?.id]);

  return (
    <DateOfBirthContext.Provider value={{ isLoading, hasDateOfBirth, dateOfBirth, setDateOfBirthOptimistic }}>
      {children}
    </DateOfBirthContext.Provider>
  );
};

export const useDateOfBirthCheck = (): DateOfBirthCheckResult => {
  const context = useContext(DateOfBirthContext);
  if (!context) {
    throw new Error('useDateOfBirthCheck must be used within a DateOfBirthProvider');
  }
  return context;
};
