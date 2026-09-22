/**
 * AFFILIATE v2 — public self-service registration (/affiliate/register).
 * Creates a pending affiliate_accounts row via SECURITY DEFINER RPC
 * register_affiliate_account (bound to auth.uid()). Separate from the legacy
 * influencer signup and from the Partner portal. Does not touch customer
 * account, payments, tickets, contests, wallet, or buy_ticket_atomic.
 */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthVisual.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Megaphone, ArrowLeft, CheckCircle, Coins, Users } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

const inputClass =
  'rounded-xl border-[#E7E1D8] bg-[#FCFAF7] text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white';

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

const AffiliateRegister = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finalCode, setFinalCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [modeInfluencer, setModeInfluencer] = useState(true);
  const [modeSalesRep, setModeSalesRep] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.password) {
      toast.error('Vyplňte prosím jméno, e-mail a heslo'); return;
    }
    if (form.password !== form.confirmPassword) { toast.error('Hesla se neshodují'); return; }
    if (form.password.length < 6) { toast.error('Heslo musí mít alespoň 6 znaků'); return; }

    const modes: string[] = [];
    if (modeInfluencer) modes.push('influencer');
    if (modeSalesRep) modes.push('sales_rep');
    if (modes.length === 0) { toast.error('Vyberte alespoň jeden režim (Influencer nebo Obchodník)'); return; }

    setLoading(true);
    try {
      const email = form.email.trim();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: { data: { affiliate_registration: true, name: form.name.trim() } },
      });

      if (authError) {
        if (authError.message?.includes('rate limit')) throw new Error('Příliš mnoho pokusů. Zkuste to později.');
        if (authError.message?.includes('already')) throw new Error('Tento e-mail je již zaregistrován.');
        throw new Error(authError.message || 'Nepodařilo se vytvořit účet.');
      }
      if (!authData?.user) throw new Error('Nepodařilo se vytvořit uživatele.');
      if (!authData.user.identities || authData.user.identities.length === 0) {
        throw new Error('Tento e-mail je již zaregistrován.');
      }

      // Profile/social fields (website, Instagram, TikTok, YouTube, Facebook,
      // audience size, content categories) are no longer collected at
      // registration — they're filled in later in Affiliate dashboard -> Profil
      // (AffiliateProfileSection, via update_affiliate_own_profile). The
      // ref_code is likewise no longer user-entered: passing null lets the
      // server derive and dedupe it from the name automatically.
      let { data: rpcData, error: rpcError } = await (supabase as any).rpc('register_affiliate_account', {
        p_name: form.name.trim(),
        p_email: email,
        p_phone: form.phone.trim() || null,
        p_modes: modes,
        p_ref_code: null,
        p_website_url: null,
        p_instagram_url: null,
        p_tiktok_url: null,
        p_youtube_url: null,
        p_facebook_url: null,
        p_audience_size: null,
        p_content_categories: null,
      });

      if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find')) {
        const fallback = await (supabase as any).rpc('register_affiliate_account', {
          p_name: form.name.trim(),
          p_email: email,
          p_phone: form.phone.trim() || null,
          p_modes: modes,
          p_ref_code: null,
        });
        rpcData = fallback.data;
        rpcError = fallback.error;
      }

      if (rpcError) throw new Error(rpcError.message || 'Registrace affiliate účtu selhala.');

      const status = (rpcData as any)?.status;
      if (status === 'registered' || status === 'already_exists') {
        setFinalCode((rpcData as any)?.ref_code ?? null);
      } else if (status === 'unauthenticated') {
        throw new Error('Účet byl vytvořen, ale je potřeba potvrdit e-mail. Po přihlášení dokončíme registraci.');
      } else if (status === 'invalid_modes') {
        throw new Error('Neplatný výběr režimu.');
      } else {
        throw new Error('Registraci se nepodařilo dokončit.');
      }

      await supabase.auth.signOut();
      setSubmitted(true);
      toast.success('Registrace odeslána ke schválení');
    } catch (err: any) {
      console.error('Affiliate registration error:', err);
      toast.error(err.message || 'Nepodařilo se zaregistrovat');
    } finally {
      setLoading(false);
    }
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
              Váš affiliate účet byl vytvořen a čeká na schválení administrátorem.
              {finalCode && (
                <> Váš doporučovací kód: <span className="font-mono font-semibold text-[#1A1A1A]">{finalCode}</span>.</>
              )}
            </p>
            <Button
              className="om-auth-cta mt-6 h-12 w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-base font-semibold text-[#1A1200] shadow-[0_10px_30px_-8px_rgba(255,138,0,0.55)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(255,138,0,0.65)] hover:brightness-105 active:scale-[0.99]"
              onClick={() => navigate('/affiliate/login')}
            >
              Přejít na přihlášení
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF8EE] via-[#FFF4E7] to-white px-4 py-10 sm:py-14">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center">
        <LogoMedallion />

        <div className="om-auth-rise om-auth-rise-1 mb-5 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C2570A]">
            Affiliate program
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight text-[#1A1A1A] sm:text-[28px]">
            Doporučujte a vydělávejte s OneMil
          </h1>
        </div>

        <div className="om-auth-rise om-auth-rise-2 mb-6 grid w-full grid-cols-3 gap-2">
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Megaphone className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Doporučení</span>
          </div>
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Coins className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Odměny</span>
          </div>
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Users className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Síť</span>
          </div>
        </div>

        <div className="om-auth-rise om-auth-rise-3 w-full rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Megaphone className="h-7 w-7 text-[#C96A00]" />
            </div>
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Affiliate program</h2>
            <p className="mt-1 text-sm text-[#8A8A8A]">Vydělávejte na doporučení OneMil zákazníkům i firmám</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-[#2B2B2B]">Jméno / název *</Label>
              <Input id="name" name="name" value={form.name} onChange={onChange} required
                     className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-[#2B2B2B]">E-mail *</Label>
              <Input id="email" name="email" type="email" value={form.email} onChange={onChange} required
                     className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-[#2B2B2B]">Heslo *</Label>
                <Input id="password" name="password" type="password" value={form.password} onChange={onChange} required
                       className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#2B2B2B]">Heslo znovu *</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" value={form.confirmPassword} onChange={onChange} required
                       className={inputClass} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium text-[#2B2B2B]">Telefon</Label>
              <Input id="phone" name="phone" value={form.phone} onChange={onChange}
                     className={inputClass} />
            </div>

            <div className="space-y-2 rounded-2xl border border-[#F0E9DD] bg-[#FCFAF7] p-3.5">
              <Label className="text-sm font-medium text-[#2B2B2B]">Režim spolupráce *</Label>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="m_inf"
                  checked={modeInfluencer}
                  onCheckedChange={(v) => setModeInfluencer(!!v)}
                  className="border-[#D8C9AE] data-[state=checked]:border-[#FF8A00] data-[state=checked]:bg-[#FF8A00]"
                />
                <Label htmlFor="m_inf" className="cursor-pointer text-sm font-normal text-[#3A3A3A]">Influencer — přivádím zákazníky</Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="m_sales"
                  checked={modeSalesRep}
                  onCheckedChange={(v) => setModeSalesRep(!!v)}
                  className="border-[#D8C9AE] data-[state=checked]:border-[#FF8A00] data-[state=checked]:bg-[#FF8A00]"
                />
                <Label htmlFor="m_sales" className="cursor-pointer text-sm font-normal text-[#3A3A3A]">Obchodník — přivádím firmy / e-shopy</Label>
              </div>
            </div>

            <p className="text-xs text-[#8A8A8A]">
              Doporučovací kód a profilové/sociální odkazy si po schválení doplníte
              v Affiliate dashboardu v sekci Profil.
            </p>

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
                'Zaregistrovat se'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/affiliate/login" className="inline-flex items-center gap-1 text-sm font-medium text-[#C2570A] hover:underline">
              <ArrowLeft className="h-3 w-3" /> Už mám účet — přihlásit se
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AffiliateRegister;
