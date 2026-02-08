import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, ArrowLeft } from 'lucide-react';

const PartnerLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isInfluencerLogin = searchParams.get('role') === 'influencer';
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
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Check if user is a partner
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, status, notes')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (partnerError || !partner) {
        await supabase.auth.signOut();
        toast.error(isInfluencerLogin ? 'Tento účet nemá influencer přístup' : 'Tento účet nemá partnerský přístup');
        return;
      }

      const isInfluencer = partner.notes && partner.notes.toLowerCase().includes('influencer');

      if (isInfluencerLogin || isInfluencer) {
        if (partner.status !== 'approved') {
          await supabase.auth.signOut();
          toast.error('Váš influencer účet čeká na schválení administrátorem.');
          return;
        }
        toast.success('Úspěšně přihlášeno');
        navigate('/influencer/dashboard');
      } else {
        if (partner.status !== 'approved') {
          await supabase.auth.signOut();
          toast.error('Váš partnerský účet čeká na schválení');
          return;
        }
        toast.success('Úspěšně přihlášeno');
        navigate('/partner/dashboard');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Nepodařilo se přihlásit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/30">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{isInfluencerLogin ? 'Influencer portál' : 'Partnerský portál'}</CardTitle>
          <CardDescription>{isInfluencerLogin ? 'Přihlaste se do svého influencer účtu' : 'Přihlaste se do svého partnerského účtu'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="partner@eshop.cz"
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
            <Button type="submit" className="w-full" disabled={loading}>
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
              Nemáte partnerský účet?{' '}
              <Link to="/partner/register" className="text-primary hover:underline">
                Registrovat e-shop
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
  );
};

export default PartnerLogin;
