import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Star, ArrowLeft, CheckCircle, Clock } from 'lucide-react';

const CONTENT_CATEGORIES = [
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'fashion', label: 'Móda & Beauty' },
  { value: 'tech', label: 'Technologie & Gadgets' },
  { value: 'gaming', label: 'Gaming & Esport' },
  { value: 'fitness', label: 'Sport & Fitness' },
  { value: 'food', label: 'Jídlo & Recepty' },
  { value: 'travel', label: 'Cestování' },
  { value: 'finance', label: 'Finance & Byznys' },
  { value: 'entertainment', label: 'Zábava & Humor' },
  { value: 'other', label: 'Jiné' },
];

const FOLLOWER_RANGES = [
  { value: '1k-5k', label: '1 000 – 5 000' },
  { value: '5k-10k', label: '5 000 – 10 000' },
  { value: '10k-50k', label: '10 000 – 50 000' },
  { value: '50k-100k', label: '50 000 – 100 000' },
  { value: '100k+', label: '100 000+' },
];

const InfluencerRegister = () => {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    instagram: '',
    tiktok: '',
    youtube: '',
    facebook: '',
    mainPlatformUrl: '',
    followerRange: '',
    contentCategory: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.password || !formData.mainPlatformUrl) {
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
      const trimmedEmail = formData.email.trim();

      // Prepare influencer metadata for notes field
      const influencerMeta = {
        type: 'influencer',
        social_networks: {
          instagram: formData.instagram.trim() || null,
          tiktok: formData.tiktok.trim() || null,
          youtube: formData.youtube.trim() || null,
          facebook: formData.facebook.trim() || null,
        },
        follower_range: formData.followerRange || null,
        content_category: formData.contentCategory || null,
      };

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: formData.password,
        options: {
          data: {
            influencer_registration: true,
            name: formData.name.trim(),
          },
        },
      });

      if (authError) {
        if (authError.message?.includes('rate limit')) {
          throw new Error('Příliš mnoho pokusů. Zkuste to prosím později.');
        }
        if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
          throw new Error('Tento e-mail je již zaregistrován.');
        }
        throw new Error(authError.message || 'Nepodařilo se vytvořit účet.');
      }

      if (!authData?.user) {
        throw new Error('Nepodařilo se vytvořit uživatele.');
      }

      // Check for fake success (email already exists)
      if (!authData.user.identities || authData.user.identities.length === 0) {
        throw new Error('Tento e-mail je již zaregistrován.');
      }

      // 2. Insert into partners table with status=pending and influencer marker
      const { error: partnerError } = await supabase.from('partners').insert({
        auth_user_id: authData.user.id,
        name: formData.name.trim(),
        website_url: formData.mainPlatformUrl.trim(),
        contact_email: trimmedEmail,
        contact_phone: formData.phone.trim() || null,
        logo_url: 'https://placehold.co/100x100?text=INF',
        logo_status: 'pending',
        status: 'pending',
        notes: JSON.stringify(influencerMeta),
      });

      if (partnerError) {
        console.error('Partner insert error:', partnerError);
        // Don't throw - auth user is already created, admin can fix
        console.warn('Partner record creation failed, but auth user created successfully');
      }

      setSubmitted(true);
      toast.success('Registrace odeslána ke schválení');
    } catch (error: any) {
      console.error('Influencer registration error:', error);
      toast.error(error.message || 'Nepodařilo se zaregistrovat');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur text-center">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/30">
                <Clock className="w-10 h-10 text-secondary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Čeká se na schválení administrátorem</CardTitle>
            <CardDescription className="text-base">
              Vaše registrace byla úspěšně odeslána. Náš tým ji prověří a po schválení
              získáte přístup k influencer dashboardu a materiálům.
            </CardDescription>
            <CardDescription className="text-sm">
              O schválení vás budeme informovat e-mailem na adresu, kterou jste zadali.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zpět na hlavní stránku
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-10">
      <Card className="w-full max-w-lg border-border/50 bg-card/80 backdrop-blur">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/30">
              <Star className="w-8 h-8 text-secondary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Registrace influencera</CardTitle>
          <CardDescription>Vyplňte své údaje a začněte spolupracovat s OneMil</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Jméno / Přezdívka *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Váš influencer nick nebo jméno"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              {/* Email */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="vas@email.cz"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="+420 123 456 789"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              {/* Main platform URL */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mainPlatformUrl">Hlavní profil na sociální síti *</Label>
                <Input
                  id="mainPlatformUrl"
                  name="mainPlatformUrl"
                  placeholder="https://instagram.com/vas-profil"
                  value={formData.mainPlatformUrl}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              {/* Social Networks */}
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  name="instagram"
                  placeholder="@vas_instagram"
                  value={formData.instagram}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tiktok">TikTok</Label>
                <Input
                  id="tiktok"
                  name="tiktok"
                  placeholder="@vas_tiktok"
                  value={formData.tiktok}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtube">YouTube</Label>
                <Input
                  id="youtube"
                  name="youtube"
                  placeholder="youtube.com/c/kanal"
                  value={formData.youtube}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="facebook">Facebook</Label>
                <Input
                  id="facebook"
                  name="facebook"
                  placeholder="facebook.com/stranka"
                  value={formData.facebook}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              {/* Follower count */}
              <div className="space-y-2">
                <Label>Počet sledujících</Label>
                <Select
                  value={formData.followerRange}
                  onValueChange={(val) => setFormData({ ...formData, followerRange: val })}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte rozsah" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOWER_RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Content category */}
              <div className="space-y-2">
                <Label>Kategorie obsahu</Label>
                <Select
                  value={formData.contentCategory}
                  onValueChange={(val) => setFormData({ ...formData, contentCategory: val })}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte kategorii" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Password */}
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

            <Button type="submit" className="w-full" disabled={loading}>
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
            <Link
              to="/influencer"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Zpět na Pro influencery
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InfluencerRegister;
