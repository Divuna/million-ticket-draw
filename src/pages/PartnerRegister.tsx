import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import './AuthVisual.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { toast } from 'sonner';
import { Loader2, Building2, ArrowLeft, CheckCircle, Handshake, TrendingUp, Zap } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

const inputClass =
  'h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white';

const AmbientBackdrop = () => (
  <>
    <div
      aria-hidden="true"
      className="om-auth-blob-a pointer-events-none absolute -top-20 -right-14 h-64 w-64 rounded-full bg-[#FF8A00]/25 blur-[90px] sm:h-80 sm:w-80"
    />
    <div
      aria-hidden="true"
      className="om-auth-blob-b pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#FFB547]/30 blur-[90px] sm:h-80 sm:w-80"
    />
    <div
      aria-hidden="true"
      className="om-auth-dotgrid pointer-events-none absolute inset-x-0 top-0 h-[420px]"
    />
  </>
);

const LogoMedallion = () => (
  <Link
    to="/"
    aria-label="Zpět na OneMil"
    className="om-auth-medallion om-auth-rise mb-5 block overflow-hidden rounded-[26px] shadow-[0_18px_40px_-14px_rgba(255,138,0,0.4)]"
  >
    <img
      src={logo}
      alt="OneMil — luxusní soutěže, skutečné výhry"
      className="h-24 w-24 object-cover sm:h-28 sm:w-28"
    />
  </Link>
);

const PartnerRegister = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Affiliate v2: optional sales_rep referral code from /partner/register?via=KOD.
  // Stored in signUp metadata; admin attributes the company after approval.
  const viaCode = (searchParams.get('via') || '').trim();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    websiteUrl: '',
    contactPhone: '',
    ico: '',
    dic: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.password || !formData.companyName || !formData.websiteUrl) {
      toast.error('Vyplňte prosím všechna povinná pole');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Hesla se neshodují');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Heslo musí mít alespoň 6 znaků');
      return;
    }

    setLoading(true);

    try {
      // Trim email before sending to Supabase
      const trimmedEmail = formData.email.trim();

      // Create auth user only - partner record will be created by admin after approval
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: formData.password,
        options: {
          data: {
            partner_registration: true,
            company_name: formData.companyName,
            website_url: formData.websiteUrl,
            contact_phone: formData.contactPhone || null,
            ico: formData.ico || null,
            dic: formData.dic || null,
            affiliate_via_code: viaCode || null,
          },
        },
      });

      // Strict error check
      if (authError) {
        console.error('SignUp auth error:', authError);
        // Map common errors to Czech messages
        if (authError.message?.includes('rate limit')) {
          throw new Error('Příliš mnoho pokusů. Zkuste to prosím později.');
        }
        if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
          throw new Error('Tento e-mail je již zaregistrován.');
        }
        throw new Error(authError.message || 'Nepodařilo se vytvořit účet.');
      }

      // Check if user object exists
      if (!authData?.user) {
        console.error('SignUp returned no user object');
        throw new Error('Nepodařilo se vytvořit uživatele.');
      }

      // CRITICAL: Check for fake success (user exists but no new identity created)
      // Supabase returns user with empty identities[] if email already exists
      if (!authData.user.identities || authData.user.identities.length === 0) {
        console.error('SignUp returned user with no identities - email already exists');
        throw new Error('Tento e-mail je již zaregistrován.');
      }

      // Verify metadata was saved
      if (authData.user.user_metadata?.partner_registration !== true) {
        console.warn('partner_registration metadata not set correctly:', authData.user.user_metadata);
      }

      console.log('Partner registration successful:', {
        userId: authData.user.id,
        email: authData.user.email,
        hasPartnerFlag: authData.user.user_metadata?.partner_registration === true,
      });

      // Registration successful - show success message
      analytics.partnerRegistrationCompleted();
      setSubmitted(true);
      toast.success('Registrace odeslána ke schválení');
    } catch (error: any) {
      console.error('Registration error:', error);
      setLoading(false);
      toast.error(error.message || 'Nepodařilo se zaregistrovat');
      return; // Don't set submitted, stay on form
    }

    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF8EE] via-[#FFF4E7] to-white px-4 py-10 sm:py-14">
        <AmbientBackdrop />
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center justify-center py-10">
          <LogoMedallion />
          <div className="om-auth-rise om-auth-rise-3 w-full rounded-[28px] border border-[#F3E4CF] bg-white p-6 text-center shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
            <div className="mb-4 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#BEE6CC] bg-[#EAF7EF]">
                <CheckCircle className="h-10 w-10 text-[#2E9E56]" />
              </div>
            </div>
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Registrace odeslána</h2>
            <p className="mt-2 text-sm text-[#5B6572]">
              Registrace odeslána. Partnerský účet bude aktivován po schválení administrátorem.
            </p>
            <Link to="/" className="mt-6 block">
              <Button
                variant="outline"
                className="w-full rounded-xl border-[#E7E1D8] bg-white text-[#2B2B2B] hover:border-[#FF8A00]/50 hover:bg-[#FFF7EC] hover:text-[#2B2B2B]"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zpět na hlavní stránku
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF8EE] via-[#FFF4E7] to-white px-4 py-10 sm:py-14">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center">
        <LogoMedallion />

        <div className="om-auth-rise om-auth-rise-1 mb-5 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C2570A]">
            Partnerský portál
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight text-[#1A1A1A] sm:text-[28px]">
            Propojte svůj e-shop s OneMil
          </h1>
        </div>

        <div className="om-auth-rise om-auth-rise-2 mb-6 grid w-full grid-cols-3 gap-2">
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Handshake className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Partnerství</span>
          </div>
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <TrendingUp className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Růst</span>
          </div>
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Zap className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Propojení</span>
          </div>
        </div>

        <div className="om-auth-rise om-auth-rise-3 w-full rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Building2 className="h-7 w-7 text-[#C96A00]" />
            </div>
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Registrace e-shopu</h2>
            <p className="mt-1 text-sm text-[#8A8A8A]">Staňte se partnerem OneMil a nabízejte MIO</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="companyName" className="text-sm font-medium text-[#2B2B2B]">Název společnosti *</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="Můj E-shop s.r.o."
                  value={formData.companyName}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="websiteUrl" className="text-sm font-medium text-[#2B2B2B]">URL webu *</Label>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  placeholder="https://www.muj-eshop.cz"
                  value={formData.websiteUrl}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ico" className="text-sm font-medium text-[#2B2B2B]">IČO</Label>
                <Input
                  id="ico"
                  name="ico"
                  placeholder="12345678"
                  value={formData.ico}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dic" className="text-sm font-medium text-[#2B2B2B]">DIČ</Label>
                <Input
                  id="dic"
                  name="dic"
                  placeholder="CZ12345678"
                  value={formData.dic}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="email" className="text-sm font-medium text-[#2B2B2B]">Kontaktní e-mail *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="partner@eshop.cz"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contactPhone" className="text-sm font-medium text-[#2B2B2B]">Kontaktní telefon</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  placeholder="+420 123 456 789"
                  value={formData.contactPhone}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-[#2B2B2B]">Heslo *</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#2B2B2B]">Potvrdit heslo *</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="om-auth-cta h-12 w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-base font-semibold text-[#1A1200] shadow-[0_10px_30px_-8px_rgba(255,138,0,0.55)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(255,138,0,0.65)] hover:brightness-105 active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Odesílání...
                </>
              ) : (
                'Odeslat registraci'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-[#8A8A8A]">
              Již máte partnerský účet?{' '}
              <Link to="/partner/login" className="font-medium text-[#C2570A] hover:underline">
                Přihlásit se
              </Link>
            </p>
            <Link
              to="/"
              className="inline-flex items-center text-sm text-[#8A8A8A] transition-colors hover:text-[#1A1A1A]"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Zpět na hlavní stránku
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerRegister;
