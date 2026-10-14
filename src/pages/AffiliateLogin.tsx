import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthVisual.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Megaphone, ArrowLeft, Mail, Lock, Users, Coins } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

/**
 * Dedicated Affiliate login. Allows ONLY users with an affiliate_accounts record.
 * A pure partner or customer (no affiliate_accounts row) is signed out and shown
 * a clear message — never auto-redirected into the affiliate dashboard.
 * Multi-role accounts are allowed here as long as they HAVE an affiliate record.
 */
const AffiliateLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Vyplňte prosím e-mail a heslo');
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (authError) throw authError;

      const { data: affiliate, error: affErr } = await (supabase as any)
        .from('affiliate_accounts')
        .select('id, status')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (affErr || !affiliate) {
        await supabase.auth.signOut();
        toast.error('Tady zatím nemáte Affiliate účet. Pokud se chcete zapojit, nejdříve se zaregistrujte do Affiliate programu.');
        return;
      }

      toast.success('Úspěšně přihlášeno');
      navigate('/affiliate/dashboard');
    } catch (error: any) {
      console.error('Affiliate login error:', error);
      toast.error(error.message || 'Nepodařilo se přihlásit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF8EE] via-[#FFF4E7] to-white px-4 py-10 sm:py-14">
      {/* Ambient decorative glow — purely visual, does not affect layout flow */}
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

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center">
        {/* Logo medallion */}
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

        {/* Tagline */}
        <div className="om-auth-rise om-auth-rise-1 mb-5 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C2570A]">
            Affiliate program
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight text-[#1A1A1A] sm:text-[28px]">
            Doporučujte a vydělávejte s OneMil
          </h1>
        </div>

        {/* Benefit chips */}
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

        {/* Login card */}
        <div className="om-auth-rise om-auth-rise-3 w-full rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Megaphone className="h-7 w-7 text-[#C96A00]" />
            </div>
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Affiliate přihlášení</h2>
            <p className="mt-1 text-sm text-[#8A8A8A]">Přihlaste se do svého Affiliate účtu</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-[#2B2B2B]">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C7A97A]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="vas@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] pl-10 text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-[#2B2B2B]">Heslo</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C7A97A]" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-11 rounded-xl border-[#E7E1D8] bg-[#FCFAF7] pl-10 text-[#1A1A1A] placeholder:text-[#B4ACA0] focus-visible:border-[#FF8A00] focus-visible:ring-[#FF8A00]/25 focus-visible:ring-offset-white"
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
                  Přihlašování...
                </>
              ) : (
                'Přihlásit se'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-[#8A8A8A]">
              Nemáte Affiliate účet?{' '}
              <Link to="/affiliate/register" className="font-medium text-[#C2570A] hover:underline">
                Zaregistrovat se
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

export default AffiliateLogin;
