import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Register.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useDateOfBirthCheck } from '@/hooks/useDateOfBirthCheck';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo-onemil.png';
import { PENDING_REFERRAL_STORAGE_KEY } from '@/hooks/useApplyPendingReferral';
import { analytics } from '@/lib/analytics';
import { ENABLED_OAUTH_PROVIDERS, type OAuthProvider } from '@/config/socialAuth';
import { Mail, Lock, CalendarDays, Loader2, ShieldCheck } from 'lucide-react';
import { OneMilTrophyIcon, OneMilWinIcon, OneMilVoucherIcon } from '@/components/icons/OneMilIcons';

// Affiliate v2: pending affiliate ref code captured from ?ref= (separate from legacy referral).
const PENDING_AFFILIATE_REF_KEY = 'onemil_affiliate_ref';

const GoogleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

const FacebookIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
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
        // Affiliate v2: same ?ref= value may also be an affiliate ref_code.
        // Stored separately; legacy player-referral flow is untouched.
        sessionStorage.setItem(PENDING_AFFILIATE_REF_KEY, ref);
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

          // Affiliate v2: attribute customer to an affiliate (first-touch). Fully
          // non-fatal — invalid_code / already_attributed / not_eligible / errors
          // must never break registration. Separate from the legacy referral above.
          try {
            const pendingAff = sessionStorage.getItem(PENDING_AFFILIATE_REF_KEY);
            if (pendingAff) {
              await (supabase as any).rpc('record_affiliate_customer_ref', { p_ref_code: pendingAff });
              sessionStorage.removeItem(PENDING_AFFILIATE_REF_KEY);
            }
          } catch {
            // non-blocking; affiliate attribution must never break registration
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
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF8EE] via-[#FFF4E7] to-white px-4 py-10 sm:py-14">
      {/* Ambient decorative glow — purely visual, does not affect layout flow */}
      <div
        aria-hidden="true"
        className="om-register-blob-a pointer-events-none absolute -top-20 -right-14 h-64 w-64 rounded-full bg-[#FF8A00]/25 blur-[90px] sm:h-80 sm:w-80"
      />
      <div
        aria-hidden="true"
        className="om-register-blob-b pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#FFB547]/30 blur-[90px] sm:h-80 sm:w-80"
      />
      <div
        aria-hidden="true"
        className="om-register-dotgrid pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center">
        {/* Logo medallion */}
        <Link
          to="/"
          aria-label="Zpět na OneMil"
          className="om-register-medallion om-register-rise mb-5 block overflow-hidden rounded-[26px] shadow-[0_18px_40px_-14px_rgba(255,138,0,0.4)]"
        >
          <img
            src={logo}
            alt="OneMil — luxusní soutěže, skutečné výhry"
            className="h-24 w-24 object-cover sm:h-28 sm:w-28"
          />
        </Link>

        {/* Tagline */}
        <div className="om-register-rise om-register-rise-1 mb-5 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C2570A]">
            Vítejte v OneMil
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight text-[#1A1A1A] sm:text-[28px]">
            Otevřete si cestu k luxusním soutěžím
          </h1>
        </div>

        {/* Benefit chips */}
        <div className="om-register-rise om-register-rise-2 mb-6 grid w-full grid-cols-3 gap-2">
          <div className="om-register-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <OneMilTrophyIcon active size={20} />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Soutěže</span>
          </div>
          <div className="om-register-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <OneMilWinIcon active size={20} />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Výhry</span>
          </div>
          <div className="om-register-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <OneMilVoucherIcon active size={20} />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Vouchery</span>
          </div>
        </div>

        {/* Registration card */}
        <div className="om-register-rise om-register-rise-3 w-full rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Registrace</h2>
            <p className="mt-1 text-sm text-[#8A8A8A]">Vytvořte si nový účet OneMil</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-[#2B2B2B]">
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C7A97A]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="vas@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] pl-10 text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-[#2B2B2B]">
                Heslo
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C7A97A]" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Alespoň 6 znaků"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] pl-10 text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-[#2B2B2B]">
                Potvrzení hesla
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C7A97A]" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Zopakujte heslo"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] pl-10 text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dateOfBirth" className="text-sm font-medium text-[#2B2B2B]">
                Datum narození *
              </label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C7A97A]" />
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
                  className="h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] pl-10 text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white"
                />
              </div>
              {dateOfBirthError && (
                <p className="text-sm text-red-600">{dateOfBirthError}</p>
              )}
            </div>

            <div className="space-y-2.5 rounded-2xl border border-[#F0E9DD] bg-[#FCFAF7] p-3.5">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  className="mt-0.5 border-[#D8C9AE] data-[state=checked]:border-[#FF8A00] data-[state=checked]:bg-[#FF8A00]"
                />
                <label htmlFor="terms" className="cursor-pointer text-sm leading-snug text-[#3A3A3A]">
                  Souhlasím s{' '}
                  <Link
                    to="/vop"
                    className="font-medium text-[#C2570A] hover:underline"
                    target="_blank"
                  >
                    Obchodními podmínkami
                  </Link>
                  {' '}*
                </label>
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="gdpr"
                  checked={gdprAccepted}
                  onCheckedChange={(checked) => setGdprAccepted(checked === true)}
                  className="mt-0.5 border-[#D8C9AE] data-[state=checked]:border-[#FF8A00] data-[state=checked]:bg-[#FF8A00]"
                />
                <label htmlFor="gdpr" className="cursor-pointer text-sm leading-snug text-[#3A3A3A]">
                  Souhlasím se{' '}
                  <Link
                    to="/gdpr"
                    className="font-medium text-[#C2570A] hover:underline"
                    target="_blank"
                  >
                    Zásadami ochrany osobních údajů
                  </Link>
                  {' '}*
                </label>
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="marketing"
                  checked={marketingAccepted}
                  onCheckedChange={(checked) => setMarketingAccepted(checked === true)}
                  className="mt-0.5 border-[#D8C9AE] data-[state=checked]:border-[#FF8A00] data-[state=checked]:bg-[#FF8A00]"
                />
                <label htmlFor="marketing" className="cursor-pointer text-sm leading-snug text-[#8A8A8A]">
                  Souhlasím se zasíláním marketingových sdělení
                </label>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="om-register-cta h-12 w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-base font-semibold text-[#1A1200] shadow-[0_10px_30px_-8px_rgba(255,138,0,0.55)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(255,138,0,0.65)] hover:brightness-105 active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registruji...
                </>
              ) : (
                'Zaregistrovat se'
              )}
            </Button>

            {ENABLED_OAUTH_PROVIDERS.length > 0 && (
              <>
                <div className="relative py-1 text-center">
                  <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#EFE7DA]" />
                  <span className="relative bg-white px-3 text-xs uppercase tracking-wide text-[#B4ACA0]">
                    nebo
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {ENABLED_OAUTH_PROVIDERS.includes('google') && (
                    <Button
                      type="button"
                      variant="outline"
                      className="relative h-11 w-full justify-center border-[#E7E1D8] bg-white text-[#2B2B2B] hover:border-[#FF8A00]/50 hover:bg-[#FFF7EC] hover:text-[#2B2B2B]"
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
                      className="h-11 w-full justify-center border-[#E7E1D8] bg-white text-[#2B2B2B] hover:border-[#FF8A00]/50 hover:bg-[#FFF7EC] hover:text-[#2B2B2B]"
                      onClick={() => handleOAuthSignIn('apple')}
                    >
                      Registrovat se přes Apple
                    </Button>
                  )}

                  {ENABLED_OAUTH_PROVIDERS.includes('facebook') && (
                    <Button
                      type="button"
                      variant="outline"
                      className="relative h-11 w-full justify-center border-[#E7E1D8] bg-white text-[#2B2B2B] hover:border-[#FF8A00]/50 hover:bg-[#FFF7EC] hover:text-[#2B2B2B]"
                      onClick={() => handleOAuthSignIn('facebook')}
                    >
                      <span className="absolute left-4 top-1/2 -translate-y-1/2"><FacebookIcon /></span>
                      <span>Registrovat se přes Facebook</span>
                    </Button>
                  )}
                </div>
              </>
            )}

            <p className="pt-1 text-center text-sm text-[#8A8A8A]">
              Už máte účet?{' '}
              <Link to="/login" className="font-medium text-[#C2570A] hover:underline">
                Přihlaste se
              </Link>
            </p>
          </form>
        </div>

        <p className="om-register-rise om-register-rise-4 mt-5 flex items-center justify-center gap-1.5 text-xs text-[#A79A82]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#C2570A]" />
          Bezpečná registrace · pouze 18+
        </p>
      </div>
    </div>
  );
};

export default Register;
