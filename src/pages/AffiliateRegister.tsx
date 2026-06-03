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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
        <div className="w-full max-w-md">
          <img src={logo} alt="OneMil logo" className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated" />
          <Card className="w-full rounded-[20px] border border-border text-center">
            <CardHeader className="space-y-4">
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">Registrace odeslána</CardTitle>
              <CardDescription className="text-base">
                Váš affiliate účet byl vytvořen a čeká na schválení administrátorem.
                {finalCode && (
                  <> Váš doporučovací kód: <span className="font-mono font-semibold">{finalCode}</span>.</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate('/login')}>Přejít na přihlášení</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
      <div className="w-full max-w-2xl">
        <img src={logo} alt="OneMil logo" className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated" />
        <Card className="w-full rounded-[20px] border border-border">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/30">
                <Megaphone className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Affiliate program</CardTitle>
            <CardDescription>Vydělávejte na doporučení OneMil zákazníkům i firmám</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Jméno / název *</Label>
                <Input id="name" name="name" value={form.name} onChange={onChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" name="email" type="email" value={form.email} onChange={onChange} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="password">Heslo *</Label>
                  <Input id="password" name="password" type="password" value={form.password} onChange={onChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Heslo znovu *</Label>
                  <Input id="confirmPassword" name="confirmPassword" type="password" value={form.confirmPassword} onChange={onChange} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" name="phone" value={form.phone} onChange={onChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Hlavní kanál / web / profil</Label>
                <Input id="websiteUrl" name="websiteUrl" value={form.websiteUrl} onChange={onChange}
                       placeholder="https://..." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="instagramUrl">Instagram</Label>
                  <Input id="instagramUrl" name="instagramUrl" value={form.instagramUrl} onChange={onChange}
                         placeholder="https://instagram.com/..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tiktokUrl">TikTok</Label>
                  <Input id="tiktokUrl" name="tiktokUrl" value={form.tiktokUrl} onChange={onChange}
                         placeholder="https://tiktok.com/@..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="youtubeUrl">YouTube</Label>
                  <Input id="youtubeUrl" name="youtubeUrl" value={form.youtubeUrl} onChange={onChange}
                         placeholder="https://youtube.com/..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facebookUrl">Facebook</Label>
                  <Input id="facebookUrl" name="facebookUrl" value={form.facebookUrl} onChange={onChange}
                         placeholder="https://facebook.com/..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="audienceSize">Velikost publika / dosah</Label>
                <Input id="audienceSize" name="audienceSize" value={form.audienceSize} onChange={onChange}
                       placeholder="např. 25 000 sledujících, 100 000 měsíční dosah" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contentCategories">Kategorie obsahu</Label>
                <Textarea id="contentCategories" name="contentCategories" value={form.contentCategories}
                          onChange={onTextAreaChange}
                          placeholder="např. lifestyle, luxusní produkty, cestování, automotive, e-commerce..." />
              </div>

              <div className="space-y-2">
                <Label>Režim spolupráce *</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="m_inf" checked={modeInfluencer} onCheckedChange={(v) => setModeInfluencer(!!v)} />
                  <Label htmlFor="m_inf" className="font-normal">Influencer — přivádím zákazníky</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="m_sales" checked={modeSalesRep} onCheckedChange={(v) => setModeSalesRep(!!v)} />
                  <Label htmlFor="m_sales" className="font-normal">Obchodník — přivádím firmy / e-shopy</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refCode">Doporučovací kód (návrh)</Label>
                <Input id="refCode" name="refCode" value={form.refCode} onChange={onChange}
                       placeholder="např. JANNOVAK" className="font-mono" />
                <p className="text-xs text-muted-foreground">
                  Kód použijete v odkazech. Pokud je obsazený, systém ho upraví.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Zaregistrovat se
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link to="/login" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
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
