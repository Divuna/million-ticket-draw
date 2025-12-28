import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DateOfBirthCheckResult {
  isLoading: boolean;
  hasDateOfBirth: boolean | null;
  dateOfBirth: string | null;
}

export const useDateOfBirthCheck = (): DateOfBirthCheckResult => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [hasDateOfBirth, setHasDateOfBirth] = useState<boolean | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);

  useEffect(() => {
    const checkDateOfBirth = async () => {
      if (!user?.id) {
        setIsLoading(false);
        setHasDateOfBirth(null);
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

  return { isLoading, hasDateOfBirth, dateOfBirth };
};
