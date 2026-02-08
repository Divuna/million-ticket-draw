import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInfluencerData } from '@/hooks/useInfluencerData';
import {
  Loader2,
  Star,
  Users,
  UserCheck,
  Banknote,
  CalendarDays,
  Copy,
  Check,
  Link2,
  TrendingUp,
  ArrowLeft,
  Clock,
  User,
  Megaphone,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';

/* ─── Status helpers ─── */

const commissionStatusLabel = (status: string) => {
  switch (status) {
    case 'paid':
      return 'Vyplaceno';
    case 'approved':
      return 'Schváleno';
    case 'calculated':
      return 'Vypočteno';
    default:
      return status;
  }
};

const commissionStatusVariant = (status: string): 'default' | 'secondary' | 'outline' => {
  switch (status) {
    case 'paid':
      return 'default';
    case 'approved':
      return 'secondary';
    default:
      return 'outline';
  }
};

/* ─── Sub-components ─── */

const StatCard = ({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  suffix?: string;
}) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold tabular-nums">
            {value}
            {suffix && <span className="text-sm font-medium ml-1">{suffix}</span>}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
);

/* ─── Main page ─── */

const InfluencerDashboard = () => {
  const { data, loading, error } = useInfluencerData();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      toast.success('Odkaz zkopírován do schránky');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Nepodařilo se zkopírovat odkaz');
    }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  /* ── Not logged in ── */
  if (error === 'not_authenticated') {
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
              to="/partner/login"
              className="inline-block text-sm text-primary hover:underline mt-2"
            >
              Přejít na přihlášení →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Access denied ── */
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
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

  /* ── Dashboard ── */
  const { stats, commissions, campaigns, referralLink } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-secondary/30 bg-secondary/5">
              <Star className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-secondary">Influencer</span>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-3">
            Vítejte, {data.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Váš influencer přehled</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Celkem přivedených" value={stats.totalReferrals} />
          <StatCard icon={UserCheck} label="Aktivních (30 dní)" value={stats.activeReferrals} />
          <StatCard icon={Banknote} label="Celkem vyděláno" value={stats.totalEarnedCzk} suffix="Kč" />
          <StatCard icon={TrendingUp} label="Tento měsíc" value={stats.currentMonthCzk} suffix="Kč" />
        </div>

        {/* Referral Link */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Váš referral odkaz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={referralLink}
                readOnly
                className="font-mono text-sm bg-muted/50"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
                aria-label="Kopírovat odkaz"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-primary" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Sdílejte tento odkaz se svými sledujícími. Každý nový uživatel bude automaticky přiřazen k vašemu účtu.
            </p>
          </CardContent>
        </Card>

        {/* Commissions / Payouts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              Provize a výplaty
            </CardTitle>
          </CardHeader>
          <CardContent>
            {commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Zatím žádné provize. Jakmile přivedete první uživatele, provize se zde zobrazí.
              </p>
            ) : (
              <div className="space-y-3">
                {commissions.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">
                        {format(new Date(c.period_month), 'LLLL yyyy', { locale: cs })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums">
                        {Number(c.amount_czk).toLocaleString('cs-CZ')} Kč
                      </span>
                      <Badge variant={commissionStatusVariant(c.status)}>
                        {commissionStatusLabel(c.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Campaigns */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              Kampaně
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Momentálně nejste zařazeni do žádné kampaně.
              </p>
            ) : (
              <div className="space-y-3">
                {campaigns.map((camp) => (
                  <div
                    key={camp.id}
                    className="rounded-lg border border-border/40 px-4 py-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{camp.name}</span>
                      <Badge variant={camp.active ? 'default' : 'secondary'}>
                        {camp.active ? 'Aktivní' : 'Ukončená'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Odměna: {Number(camp.bonus_czk_per_new_user).toLocaleString('cs-CZ')} Kč / uživatel
                      </span>
                      <span>
                        Bonus pro uživatele: {Number(camp.bonus_mc_for_user)} MC
                      </span>
                      <span>
                        {format(new Date(camp.starts_at), 'd. M. yyyy', { locale: cs })} – {format(new Date(camp.ends_at), 'd. M. yyyy', { locale: cs })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InfluencerDashboard;
