/**
 * AFFILIATE v2 — public self-service registration (/affiliate/register).
 * Creates a pending affiliate_accounts row via SECURITY DEFINER RPC
 * register_affiliate_account (bound to auth.uid()). Separate from the legacy
 * influencer signup and from the Partner portal. Does not touch customer
 * account, payments, tickets, contests, wallet, or buy_ticket_atomic.
 */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Megaphone, ArrowLeft, CheckCircle } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

const proposeRefCode = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);

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
    websiteUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    youtubeUrl: '',
    facebookUrl: '',
    audienceSize: '',
    contentCategories: '',
    refCode: '',
  });
  const [modeInfluencer, setModeInfluencer] = useState(true);
  const [modeSalesRep, setModeSalesRep] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...form, [e.target.name]: e.target.value };
    if (e.target.name === 'name' && !form.refCode) next.refCode = proposeRefCode(e.target.value);
    setForm(next);
  };

  const onTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

      let { data: rpcData, error: rpcError } = await (supabase as any).rpc('register_affiliate_account', {
        p_name: form.name.trim(),
        p_email: email,
        p_phone: form.phone.trim() || null,
        p_modes: modes,
        p_ref_code: form.refCode.trim() || null,
        p_website_url: form.websiteUrl.trim() || null,
        p_instagram_url: form.instagramUrl.trim() || null,
        p_tiktok_url: form.tiktokUrl.trim() || null,
        p_youtube_url: form.youtubeUrl.trim() || null,
        p_facebook_url: form.facebookUrl.trim() || null,
        p_audience_size: form.audienceSize.trim() || null,
        p_content_categories: form.contentCategories.trim() || null,
      });

      if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find')) {
        const fallback = await (supabase as any).rpc('register_affiliate_account', {
          p_name: form.name.trim(),
          p_email: email,
          p_phone: form.phone.trim() || null,
          p_modes: modes,
          p_ref_code: form.refCode.trim() || null,
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
      <div className="relative min-h-screen flex items-center justify-center bg-[#F6F7F9] p-4 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(900px_420px_at_50%_-10%,rgba(255,138,0,0.10),transparent_65%)]" />
        <div className="relative w-full max-w-md">
          <img src={logo} alt="OneMil logo" className="h-14 w-auto mx-auto mb-4 object-contain rounded-lg bg-[#0A0B0F] p-1.5" />
          <Card className="w-full rounded-[20px] bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_28px_60px_-28px_rgba(16,23,34,0.22)] text-[#12161C] text-center">
            <CardHeader className="space-y-4">
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-[#EAF7EF] flex items-center justify-center border border-[#BEE6CC]">
                  <CheckCircle className="w-10 h-10 text-[#2E9E56]" />
                </div>
              </div>
              <CardTitle className="font-heading text-2xl font-bold text-[#12161C]">Registrace odeslána</CardTitle>
              <CardDescription className="text-base text-[#5B6572]">
                Váš affiliate účet byl vytvořen a čeká na schválení administrátorem.
                {finalCode && (
                  <> Váš doporučovací kód: <span className="font-mono font-semibold text-[#12161C]">{finalCode}</span>.</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFA333] text-white shadow-[0_10px_24px_-10px_rgba(255,138,0,0.75)] hover:from-[#F07F00] hover:to-[#FF9A1F] transition-colors"
                onClick={() => navigate('/affiliate/login')}
              >
                Přejít na přihlášení
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#F6F7F9] p-4 py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(900px_420px_at_50%_-10%,rgba(255,138,0,0.10),transparent_65%)]" />
      <div className="relative w-full max-w-2xl">
        <img src={logo} alt="OneMil logo" className="h-14 w-auto mx-auto mb-4 object-contain rounded-lg bg-[#0A0B0F] p-1.5" />
        <Card className="w-full rounded-[20px] bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_28px_60px_-28px_rgba(16,23,34,0.22)] text-[#12161C]">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <div className="w-16 h-16 rounded-full bg-[#FFF1DF] flex items-center justify-center border border-[#FFD9A6]">
                <Megaphone className="w-8 h-8 text-[#C96A00]" />
              </div>
            </div>
            <CardTitle className="font-heading text-2xl font-bold text-[#12161C]">Affiliate program</CardTitle>
            <CardDescription className="text-[#5B6572]">Vydělávejte na doporučení OneMil zákazníkům i firmám</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[#12161C]">Jméno / název *</Label>
                <Input id="name" name="name" value={form.name} onChange={onChange} required
                       className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#12161C]">E-mail *</Label>
                <Input id="email" name="email" type="email" value={form.email} onChange={onChange} required
                       className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#12161C]">Heslo *</Label>
                  <Input id="password" name="password" type="password" value={form.password} onChange={onChange} required
                         className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-[#12161C]">Heslo znovu *</Label>
                  <Input id="confirmPassword" name="confirmPassword" type="password" value={form.confirmPassword} onChange={onChange} required
                         className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[#12161C]">Telefon</Label>
                <Input id="phone" name="phone" value={form.phone} onChange={onChange}
                       className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl" className="text-[#12161C]">Hlavní kanál / web / profil</Label>
                <Input id="websiteUrl" name="websiteUrl" value={form.websiteUrl} onChange={onChange}
                       placeholder="https://..."
                       className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="instagramUrl" className="text-[#12161C]">Instagram</Label>
                  <Input id="instagramUrl" name="instagramUrl" value={form.instagramUrl} onChange={onChange}
                         placeholder="https://instagram.com/..."
                         className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tiktokUrl" className="text-[#12161C]">TikTok</Label>
                  <Input id="tiktokUrl" name="tiktokUrl" value={form.tiktokUrl} onChange={onChange}
                         placeholder="https://tiktok.com/@..."
                         className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="youtubeUrl" className="text-[#12161C]">YouTube</Label>
                  <Input id="youtubeUrl" name="youtubeUrl" value={form.youtubeUrl} onChange={onChange}
                         placeholder="https://youtube.com/..."
                         className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facebookUrl" className="text-[#12161C]">Facebook</Label>
                  <Input id="facebookUrl" name="facebookUrl" value={form.facebookUrl} onChange={onChange}
                         placeholder="https://facebook.com/..."
                         className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="audienceSize" className="text-[#12161C]">Velikost publika / dosah</Label>
                <Input id="audienceSize" name="audienceSize" value={form.audienceSize} onChange={onChange}
                       placeholder="např. 25 000 sledujících, 100 000 měsíční dosah"
                       className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contentCategories" className="text-[#12161C]">Kategorie obsahu</Label>
                <Textarea id="contentCategories" name="contentCategories" value={form.contentCategories}
                          onChange={onTextAreaChange}
                          placeholder="např. lifestyle, luxusní produkty, cestování, automotive, e-commerce..."
                          className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
              </div>

              <div className="space-y-2">
                <Label className="text-[#12161C]">Režim spolupráce *</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="m_inf" checked={modeInfluencer} onCheckedChange={(v) => setModeInfluencer(!!v)} />
                  <Label htmlFor="m_inf" className="font-normal text-[#12161C]">Influencer — přivádím zákazníky</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="m_sales" checked={modeSalesRep} onCheckedChange={(v) => setModeSalesRep(!!v)} />
                  <Label htmlFor="m_sales" className="font-normal text-[#12161C]">Obchodník — přivádím firmy / e-shopy</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refCode" className="text-[#12161C]">Doporučovací kód (návrh)</Label>
                <Input id="refCode" name="refCode" value={form.refCode} onChange={onChange}
                       placeholder="např. JANNOVAK"
                       className="font-mono bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white" />
                <p className="text-xs text-[#8E98A6]">
                  Kód použijete v odkazech. Pokud je obsazený, systém ho upraví.
                </p>
              </div>

              <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFA333] text-white shadow-[0_10px_24px_-10px_rgba(255,138,0,0.75)] hover:from-[#F07F00] hover:to-[#FF9A1F] transition-colors" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Zaregistrovat se
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link to="/affiliate/login" className="text-sm text-[#C96A00] hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Už mám účet — přihlásit se
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AffiliateRegister;
