import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '@/components/ContestCard.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, ArrowLeft } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

const PartnerLogin = () => {
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

      // Check if user is a partner
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, status, notes')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (partnerError || !partner) {
        await supabase.auth.signOut();
        toast.error('Tady zatím nemáte firemní Partner účet. Pokud chcete zapojit firmu, nejdříve ji zaregistrujte.');
        return;
      }

      // Legacy influencers / affiliates are ALSO stored in `partners` (notes.type =
      // 'influencer'), but they are NOT company partners. Only a real company /
      // e-shop partner may enter the partner portal — influencers use /affiliate/login.
      const notesStr =
        typeof partner.notes === 'string'
          ? partner.notes
          : partner.notes ? JSON.stringify(partner.notes) : '';
      const isInfluencer = notesStr.toLowerCase().includes('influencer');
      if (isInfluencer) {
        await supabase.auth.signOut();
        toast.error('Tady zatím nemáte firemní Partner účet. Pokud chcete zapojit firmu, nejdříve ji zaregistrujte.');
        return;
      }

      if (partner.status !== 'approved') {
        await supabase.auth.signOut();
        toast.error('Váš partnerský účet čeká na schválení');
        return;
      }

      toast.success('Úspěšně přihlášeno');
      navigate('/partner/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Nepodařilo se přihlásit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#F6F7F9] p-4 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(900px_420px_at_50%_-10%,rgba(255,138,0,0.10),transparent_65%)]" />
      <div className="relative w-full max-w-md">
        <img src={logo} alt="OneMil logo" className="h-14 w-auto mx-auto mb-4 object-contain rounded-lg bg-[#0A0B0F] p-1.5" />
        <Card className="w-full rounded-[20px] bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_28px_60px_-28px_rgba(16,23,34,0.22)] text-[#12161C]">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-[#FFF1DF] flex items-center justify-center border border-[#FFD9A6]">
              <Building2 className="w-8 h-8 text-[#C96A00]" />
            </div>
          </div>
          <CardTitle className="font-heading text-2xl font-bold text-[#12161C]">Partnerský portál</CardTitle>
          <CardDescription className="text-[#5B6572]">Přihlaste se do svého partnerského účtu</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#12161C]">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="partner@eshop.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#12161C]">Heslo</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
              />
            </div>
            <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFA333] text-white shadow-[0_10px_24px_-10px_rgba(255,138,0,0.75)] hover:from-[#F07F00] hover:to-[#FF9A1F] transition-colors" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Přihlašování...
                </>
              ) : (
                'Přihlásit se'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-[#5B6572]">
              Nemáte partnerský účet?{' '}
              <Link to="/partner/register" className="text-[#C96A00] hover:underline">
                Registrovat e-shop
              </Link>
            </p>
            <Link
              to="/"
              className="inline-flex items-center text-sm text-[#5B6572] hover:text-[#12161C] transition-colors"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Zpět na hlavní stránku
            </Link>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PartnerLogin;
