import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '@/components/ContestCard.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Megaphone, ArrowLeft } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
      <div className="w-full max-w-md">
        <img src={logo} alt="OneMil logo" className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated" />
        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[hsl(40_30%_35%/0.5)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)]">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[hsl(40_30%_15%/0.3)] flex items-center justify-center border border-[hsl(40_40%_45%/0.4)]">
                <Megaphone className="w-8 h-8 text-[hsl(40_60%_55%)]" />
              </div>
            </div>
            <CardTitle className="text-heading-gold text-2xl font-bold">Affiliate přihlášení</CardTitle>
            <CardDescription>Přihlaste se do svého Affiliate účtu</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="vas@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-secondary-foreground shadow-[0_2px_12px_hsl(45_80%_50%/0.25)] hover:shadow-[0_4px_16px_hsl(45_80%_50%/0.35)] hover:brightness-110 transition-all" disabled={loading}>
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
              <p className="text-sm text-muted-foreground">
                Nemáte Affiliate účet?{' '}
                <Link to="/affiliate/register" className="text-primary hover:underline">
                  Zaregistrovat se
                </Link>
              </p>
              <Link
                to="/"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
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

export default AffiliateLogin;
