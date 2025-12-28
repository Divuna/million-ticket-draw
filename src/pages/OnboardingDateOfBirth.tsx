import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useDateOfBirthCheck } from '@/hooks/useDateOfBirthCheck';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import logo from '@/assets/logo-onemil.png';

const OnboardingDateOfBirth: React.FC = () => {
  const { user } = useAuth();
  const { isLoading: checkLoading, hasDateOfBirth } = useDateOfBirthCheck();
  const navigate = useNavigate();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if user already has date of birth or is not logged in
  useEffect(() => {
    if (!checkLoading) {
      if (!user) {
        navigate('/login');
      } else if (hasDateOfBirth) {
        navigate('/');
      }
    }
  }, [checkLoading, user, hasDateOfBirth, navigate]);

  const validateAge = (dob: string): boolean => {
    if (!dob) return false;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 15;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!dateOfBirth) {
      setError('Datum narození je povinné.');
      return;
    }

    if (!validateAge(dateOfBirth)) {
      setError('Pro registraci musíte mít alespoň 15 let.');
      return;
    }

    if (!user?.id) {
      setError('Uživatel není přihlášen.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          date_of_birth: dateOfBirth
        }, { onConflict: 'id' });

      if (updateError) throw updateError;

      toast({
        title: "Úspěch",
        description: "Datum narození bylo uloženo."
      });

      navigate('/');
    } catch (err: any) {
      console.error('Error saving date of birth:', err);
      setError('Nepodařilo se uložit datum narození. Zkuste to znovu.');
    } finally {
      setLoading(false);
    }
  };

  if (checkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <img
          src={logo}
          alt="OneMil logo"
          className="h-16 w-auto object-contain mx-auto mb-4 onemil-logo-animated"
        />
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Dokončení registrace</CardTitle>
            <CardDescription>
              Pro pokračování potřebujeme znát vaše datum narození.
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="dateOfBirth" className="text-sm font-medium">
                  Datum narození *
                </label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => {
                    setDateOfBirth(e.target.value);
                    setError('');
                  }}
                  required
                  max={new Date().toISOString().split('T')[0]}
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Musíte mít alespoň 15 let pro používání aplikace.
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Ukládám...' : 'Pokračovat'}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingDateOfBirth;
