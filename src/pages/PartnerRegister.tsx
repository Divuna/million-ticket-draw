import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '@/components/ContestCard.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, ArrowLeft, CheckCircle } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

const PartnerRegister = () => {
  const navigate = useNavigate();
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
        <div className="w-full max-w-md">
        <img src={logo} alt="OneMil logo" className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated" />
        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[hsl(40_30%_35%/0.5)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)] text-center">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-[hsl(140_40%_15%/0.3)] flex items-center justify-center border border-[hsl(140_50%_40%/0.4)]">
                <CheckCircle className="w-10 h-10 text-[hsl(140_50%_45%)]" />
              </div>
            </div>
            <CardTitle className="text-heading-gold text-2xl font-bold">Registrace odeslána</CardTitle>
            <CardDescription className="text-base">
              Registrace odeslána. Partnerský účet bude aktivován po schválení administrátorem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/">
              <Button variant="outline" className="w-full border-[hsl(40_30%_35%/0.4)] hover:border-[hsl(40_40%_45%/0.6)] hover:bg-[hsl(40_30%_20%/0.15)]">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zpět na hlavní stránku
              </Button>
            </Link>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4 py-10">
      <div className="w-full max-w-lg">
        <img src={logo} alt="OneMil logo" className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated" />
        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[hsl(40_30%_35%/0.5)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)]">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-[hsl(40_30%_15%/0.3)] flex items-center justify-center border border-[hsl(40_40%_45%/0.4)]">
              <Building2 className="w-8 h-8 text-[hsl(40_60%_55%)]" />
            </div>
          </div>
          <CardTitle className="text-heading-gold text-2xl font-bold">Registrace e-shopu</CardTitle>
          <CardDescription>Staňte se partnerem OneMil a nabízejte MioCoiny</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="companyName">Název společnosti *</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="Můj E-shop s.r.o."
                  value={formData.companyName}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="websiteUrl">URL webu *</Label>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  placeholder="https://www.muj-eshop.cz"
                  value={formData.websiteUrl}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ico">IČO</Label>
                <Input
                  id="ico"
                  name="ico"
                  placeholder="12345678"
                  value={formData.ico}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dic">DIČ</Label>
                <Input
                  id="dic"
                  name="dic"
                  placeholder="CZ12345678"
                  value={formData.dic}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email">Kontaktní e-mail *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="partner@eshop.cz"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contactPhone">Kontaktní telefon</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  placeholder="+420 123 456 789"
                  value={formData.contactPhone}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Heslo *</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Potvrdit heslo *</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </div>

            <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-secondary-foreground shadow-[0_2px_12px_hsl(45_80%_50%/0.25)] hover:shadow-[0_4px_16px_hsl(45_80%_50%/0.35)] hover:brightness-110 transition-all" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Odesílání...
                </>
              ) : (
                'Odeslat registraci'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Již máte partnerský účet?{' '}
              <Link to="/partner/login" className="text-primary hover:underline">
                Přihlásit se
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

export default PartnerRegister;
