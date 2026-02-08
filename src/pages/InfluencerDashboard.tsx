import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2,
  Star,
  ArrowLeft,
  Clock,
  CheckCircle,
  Globe,
  Mail,
  User,
  CalendarDays,
  Link2,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface InfluencerData {
  id: string;
  name: string;
  company_name: string | null;
  contact_email: string | null;
  website_url: string;
  status: string;
  notes: string | null;
  created_at: string;
}

const InfluencerDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [influencer, setInfluencer] = useState<InfluencerData | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  useEffect(() => {
    const loadInfluencerData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.user) {
          setNotLoggedIn(true);
          setLoading(false);
          return;
        }

        const userId = sessionData.session.user.id;

        const { data, error } = await supabase
          .from('partners')
          .select('id, name, company_name, contact_email, website_url, status, notes, created_at')
          .eq('auth_user_id', userId)
          .ilike('notes', '%influencer%')
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setAccessDenied(true);
        } else {
          setInfluencer(data as InfluencerData);
        }
      } catch (error) {
        console.error('Error loading influencer data:', error);
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    };

    loadInfluencerData();
  }, []);

  /* ===================== LOADING ===================== */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  /* ===================== NOT LOGGED IN ===================== */

  if (notLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <User className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Přihlášení vyžadováno</h2>
            <p className="text-muted-foreground text-sm">
              Pro přístup k influencer dashboardu se musíte nejdříve přihlásit.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm text-primary hover:underline mt-2"
            >
              Přejít na přihlášení →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ===================== ACCESS DENIED ===================== */

  if (accessDenied || !influencer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Clock className="w-12 h-12 mx-auto text-amber-500" />
            <h2 className="text-xl font-semibold">Přístup zamítnut</h2>
            <p className="text-muted-foreground text-sm">
              Váš influencer účet nebyl nalezen nebo nemáte oprávnění k přístupu.
            </p>
            <Link
              to="/"
              className="inline-flex items-center text-sm text-primary hover:underline mt-2"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Zpět na hlavní stránku
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ===================== PENDING ===================== */

  if (influencer.status !== 'approved') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Zpět na hlavní stránku
          </Link>

          <Card className="text-center">
            <CardContent className="pt-10 pb-10 space-y-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mx-auto">
                <Clock className="w-8 h-8 text-amber-500" />
              </div>
              <h1 className="text-2xl font-bold">Čeká se na schválení administrátorem</h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Vaše registrace jako influencer byla přijata. Jakmile ji administrátor
                schválí, budete mít přístup k vašemu dashboardu a všem materiálům.
              </p>
              <Badge variant="secondary" className="text-sm">
                <Clock className="w-3.5 h-3.5 mr-1" />
                Stav: {influencer.status === 'pending' ? 'Čeká na schválení' : 'Zamítnuto'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ===================== APPROVED DASHBOARD ===================== */

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Zpět na hlavní stránku
          </Link>

          <div className="flex items-center gap-3 mb-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-secondary/30 bg-secondary/5">
              <Star className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-secondary">Influencer</span>
            </div>
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="w-3 h-3 mr-1" />
              Aktivní
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-3">
            Vítejte, {influencer.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Váš influencer dashboard
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Account Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                Přehled účtu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Jméno</Label>
                <p className="text-sm font-medium">{influencer.name}</p>
              </div>

              {influencer.company_name && (
                <div>
                  <Label className="text-xs text-muted-foreground">Společnost</Label>
                  <p className="text-sm">{influencer.company_name}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="w-3 h-3" /> E-mail
                </Label>
                <p className="text-sm">{influencer.contact_email || '—'}</p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Web / Sociální sítě
                </Label>
                {influencer.website_url ? (
                  <a
                    href={influencer.website_url.startsWith('http') ? influencer.website_url : `https://${influencer.website_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {influencer.website_url}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Registrace
                </Label>
                <p className="text-sm">
                  {format(new Date(influencer.created_at), 'd. MMMM yyyy', { locale: cs })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Referral Placeholder */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Referral program
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center text-center py-6 space-y-3">
                <div className="p-3 rounded-full bg-primary/10">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Zde se zobrazí váš referral odkaz a statistiky (bude doplněno v další fázi).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes (raw, read-only) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Poznámky</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={influencer.notes || ''}
              readOnly
              className="text-xs font-mono bg-muted/50 resize-none"
              rows={5}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InfluencerDashboard;
