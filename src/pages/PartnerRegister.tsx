import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
              Registrace odeslána. Partnerský účet bude aktivován po schválení administrátorem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/">
              <Button variant="outline" className="w-full rounded-xl border-[#DDE2E8] text-[#12161C] hover:border-[#C6CCD4] hover:bg-[#FAFBFC]">
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
    <div className="relative min-h-screen flex items-center justify-center bg-[#F6F7F9] p-4 py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(900px_420px_at_50%_-10%,rgba(255,138,0,0.10),transparent_65%)]" />
      <div className="relative w-full max-w-lg">
        <img src={logo} alt="OneMil logo" className="h-14 w-auto mx-auto mb-4 object-contain rounded-lg bg-[#0A0B0F] p-1.5" />
        <Card className="w-full rounded-[20px] bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_28px_60px_-28px_rgba(16,23,34,0.22)] text-[#12161C]">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-[#FFF1DF] flex items-center justify-center border border-[#FFD9A6]">
              <Building2 className="w-8 h-8 text-[#C96A00]" />
            </div>
          </div>
          <CardTitle className="font-heading text-2xl font-bold text-[#12161C]">Registrace e-shopu</CardTitle>
          <CardDescription className="text-[#5B6572]">Staňte se partnerem OneMil a nabízejte MioCoiny</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="companyName" className="text-[#12161C]">Název společnosti *</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="Můj E-shop s.r.o."
                  value={formData.companyName}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="websiteUrl" className="text-[#12161C]">URL webu *</Label>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  placeholder="https://www.muj-eshop.cz"
                  value={formData.websiteUrl}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ico" className="text-[#12161C]">IČO</Label>
                <Input
                  id="ico"
                  name="ico"
                  placeholder="12345678"
                  value={formData.ico}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dic" className="text-[#12161C]">DIČ</Label>
                <Input
                  id="dic"
                  name="dic"
                  placeholder="CZ12345678"
                  value={formData.dic}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email" className="text-[#12161C]">Kontaktní e-mail *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="partner@eshop.cz"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contactPhone" className="text-[#12161C]">Kontaktní telefon</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  placeholder="+420 123 456 789"
                  value={formData.contactPhone}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#12161C]">Heslo *</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[#12161C]">Potvrdit heslo *</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                  className="bg-white border-[#DDE2E8] text-[#12161C] placeholder:text-[#B0B8C2] focus-visible:ring-[#FF8A00] focus-visible:ring-offset-white"
                />
              </div>
            </div>

            <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFA333] text-white shadow-[0_10px_24px_-10px_rgba(255,138,0,0.75)] hover:from-[#F07F00] hover:to-[#FF9A1F] transition-colors" disabled={loading}>
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
            <p className="text-sm text-[#5B6572]">
              Již máte partnerský účet?{' '}
              <Link to="/partner/login" className="text-[#C96A00] hover:underline">
                Přihlásit se
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

export default PartnerRegister;
