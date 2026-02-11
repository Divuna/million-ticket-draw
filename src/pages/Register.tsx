import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '@/components/ContestCard.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo-onemil.png';

const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dateOfBirthError, setDateOfBirthError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp, signInWithOAuth } = useAuth();
  const navigate = useNavigate();

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
    setDateOfBirthError('');
    
    if (!dateOfBirth) {
      setDateOfBirthError('Datum narození je povinné.');
      return;
    }

    if (!validateAge(dateOfBirth)) {
      setDateOfBirthError('Pro registraci musíte mít alespoň 15 let.');
      return;
    }
    
    if (!termsAccepted || !gdprAccepted) {
      toast({
        title: "Chyba",
        description: "Pro registraci musíte souhlasit s obchodními podmínkami a zásadami ochrany osobních údajů.",
        variant: "destructive"
      });
      return;
    }
    
    if (password !== confirmPassword) {
      toast({
        title: "Chyba",
        description: "Hesla se neshodují.",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Chyba",
        description: "Heslo musí mít alespoň 6 znaků.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password, marketingAccepted);
      
      if (error) {
        toast({
          title: "Chyba registrace",
          description: error.message,
          variant: "destructive"
        });
      } else {
        // Store date of birth in profiles table
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase
            .from('profiles')
            .upsert({
              id: newUser.id,
              date_of_birth: dateOfBirth
            }, { onConflict: 'id' });
        }
        navigate('/profile');
      }
    } catch (error) {
      toast({
        title: "Chyba",
        description: "Něco se pokazilo. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple' | 'facebook') => {
    try {
      await signInWithOAuth(provider);
    } catch (error) {
      toast({
        title: "Chyba registrace",
        description: "Registrace se nezdařila. Zkuste to znovu.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
      <div className="w-full max-w-md">
        <img
          src={logo}
          alt="OneMil logo"
          className="h-16 w-auto object-contain mx-auto mb-4 onemil-logo-animated"
        />
        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[hsl(40_30%_35%/0.5)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)]">
        <CardHeader>
          <CardTitle className="text-heading-gold">Registrace</CardTitle>
          <CardDescription>
            Vytvořte si nový účet OneMil
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="email"
                type="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Heslo
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Alespoň 6 znaků"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Potvrzení hesla
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Zopakujte heslo"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

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
                  setDateOfBirthError('');
                }}
                required
                max={new Date().toISOString().split('T')[0]}
              />
              {dateOfBirthError && (
                <p className="text-sm text-destructive">{dateOfBirthError}</p>
              )}
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              />
              <label htmlFor="terms" className="text-sm leading-tight cursor-pointer">
                Souhlasím s{' '}
                <Link 
                  to="/terms" 
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  Obchodními podmínkami
                </Link>
                {' '}*
              </label>
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox
                id="gdpr"
                checked={gdprAccepted}
                onCheckedChange={(checked) => setGdprAccepted(checked === true)}
              />
              <label htmlFor="gdpr" className="text-sm leading-tight cursor-pointer">
                Souhlasím se{' '}
                <Link 
                  to="/privacy" 
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  Zásadami ochrany osobních údajů
                </Link>
                {' '}*
              </label>
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox
                id="marketing"
                checked={marketingAccepted}
                onCheckedChange={(checked) => setMarketingAccepted(checked === true)}
              />
              <label htmlFor="marketing" className="text-sm leading-tight cursor-pointer text-muted-foreground">
                Souhlasím se zasíláním marketingových sdělení
              </label>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-secondary-foreground shadow-[0_2px_12px_hsl(45_80%_50%/0.25)] hover:shadow-[0_4px_16px_hsl(45_80%_50%/0.35)] hover:brightness-110 transition-all" 
              disabled={loading}
            >
              {loading ? 'Registruji...' : 'Zaregistrovat se'}
            </Button>
            
            <div className="flex flex-col space-y-2 w-full">
              <Button 
                type="button"
                variant="outline" 
                className="w-full border-[hsl(40_30%_35%/0.4)] hover:border-[hsl(40_40%_45%/0.6)] hover:bg-[hsl(40_30%_20%/0.15)]"
                onClick={() => handleOAuthSignIn('google')}
              >
                Registrovat se přes Google
              </Button>
              
              <Button 
                type="button"
                variant="outline" 
                className="w-full border-[hsl(40_30%_35%/0.4)] hover:border-[hsl(40_40%_45%/0.6)] hover:bg-[hsl(40_30%_20%/0.15)]"
                onClick={() => handleOAuthSignIn('apple')}
              >
                Registrovat se přes Apple
              </Button>

              <Button 
                type="button"
                variant="outline" 
                className="w-full border-[hsl(40_30%_35%/0.4)] hover:border-[hsl(40_40%_45%/0.6)] hover:bg-[hsl(40_30%_20%/0.15)]"
                onClick={() => handleOAuthSignIn('facebook')}
              >
                Registrovat se přes Facebook
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              Už máte účet?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Přihlaste se
              </Link>
            </p>
          </CardFooter>
        </form>
        </Card>
      </div>
    </div>
  );
};

export default Register;