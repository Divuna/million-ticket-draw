import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import '@/components/ContestCard.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useDateOfBirthCheck } from '@/hooks/useDateOfBirthCheck';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo-onemil.png';
import { PENDING_REFERRAL_STORAGE_KEY } from '@/hooks/useApplyPendingReferral';
import { analytics } from '@/lib/analytics';
import { ENABLED_OAUTH_PROVIDERS, type OAuthProvider } from '@/config/socialAuth';

const GoogleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

const FacebookIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 shrink-0">
    <circle cx="12" cy="12" r="11" fill="#1877F2" />
    <path fill="#FFFFFF" d="M15.25 12.65l.35-2.29h-2.2V8.88c0-.63.31-1.24 1.29-1.24h1V5.69s-.91-.16-1.78-.16c-1.82 0-3.01 1.1-3.01 3.1v1.73H8.88v2.29h2.02v5.53h2.5v-5.53h1.85z" />
  </svg>
);

const Register: React.FC = () => {
  const [searchParams] = useSearchParams();
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
  const { setDateOfBirthOptimistic } = useDateOfBirthCheck();
  const navigate = useNavigate();

  // Persist referral code from URL so it can be applied after signup (or after OAuth return)
  useEffect(() => {
    const ref = searchParams.get('ref')?.trim();
    if (ref) {
      try {
        sessionStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, ref);
      } catch {
        // ignore storage errors
      }
    }
  }, [searchParams]);

  const validateAge = (dob: string): boolean => {
    if (!dob) return false;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDateOfBirthError('');
    
    if (!dateOfBirth) {
      setDateOfBirthError('Datum narození je povinné.');
      return;
    }

    if (!validateAge(dateOfBirth)) {
      setDateOfBirthError('Pro registraci musíte mít alespoň 18 let.');
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
          const { error: dobError } = await supabase
            .from('profiles')
            .update({ date_of_birth: dateOfBirth })
            .eq('id', newUser.id);

          if (dobError) {
            console.error('Error saving date of birth during registration:', dobError);
          } else {
            // Mark DOB as present in context immediately so DateOfBirthGuard
            // does not redirect to onboarding before the DB check catches up.
            setDateOfBirthOptimistic(dateOfBirth);
          }

          // Apply referral code from URL if present (e.g. /register?ref=CODE)
          try {
            const pendingRef = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
            if (pendingRef) {
              const { data: result } = await supabase.rpc('set_my_referrer_by_code', {
                p_code: pendingRef,
                p_source: 'signup',
              });
              sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
              if (result === 'accepted') {
                toast({ title: 'Úspěch', description: 'Doporučovací kód byl aktivován. Děkujeme!' });
              }
            }
          } catch {
            // non-blocking; user can add code later in Profile
          }

        }
        analytics.registrationCompleted();
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

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    try {
      await signInWithOAuth(provider, searchParams.get('redirect'));
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
        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[rgba(255,138,0,0.15)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)]">
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
              className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black shadow-[0_2px_12px_rgba(255,138,0,0.25)] hover:shadow-[0_4px_16px_rgba(255,138,0,0.35)] hover:brightness-110 transition-all"
              disabled={loading}
            >
              {loading ? 'Registruji...' : 'Zaregistrovat se'}
            </Button>
            
            {ENABLED_OAUTH_PROVIDERS.length > 0 && (
              <div className="flex flex-col space-y-2 w-full">
                {ENABLED_OAUTH_PROVIDERS.includes('google') && (
                  <Button 
                    type="button"
                    variant="outline" 
                    className="relative w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]"
                    onClick={() => handleOAuthSignIn('google')}
                  >
                    <span className="absolute left-4 top-1/2 -translate-y-1/2"><GoogleIcon /></span>
                    <span>Registrovat se přes Google</span>
                  </Button>
                )}
              
                {ENABLED_OAUTH_PROVIDERS.includes('apple') && (
                  <Button 
                    type="button"
                    variant="outline" 
                    className="w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]"
                    onClick={() => handleOAuthSignIn('apple')}
                  >
                    Registrovat se přes Apple
                  </Button>
                )}

                {ENABLED_OAUTH_PROVIDERS.includes('facebook') && (
                  <Button 
                    type="button"
                    variant="outline" 
                    className="relative w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]"
                    onClick={() => handleOAuthSignIn('facebook')}
                  >
                    <span className="absolute left-4 top-1/2 -translate-y-1/2"><FacebookIcon /></span>
                    <span>Registrovat se přes Facebook</span>
                  </Button>
                )}
              </div>
            )}
            
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
