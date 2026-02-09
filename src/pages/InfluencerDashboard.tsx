import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInfluencerData } from '@/hooks/useInfluencerData';
import {
  Loader2,
  Star,
  Users,
  UserCheck,
  UserPlus,
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
  Percent,
  Wallet,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';

/* ─── Status helpers ─── */

const commissionStatusLabel = (status: string) => {
  switch (status) {
    case 'paid': return 'Vyplaceno';
    case 'approved': return 'Schváleno';
    case 'calculated': return 'Čeká na schválení';
    default: return status;
  }
};

const commissionStatusVariant = (status: string): 'default' | 'secondary' | 'outline' => {
  switch (status) {
    case 'paid': return 'default';
    case 'approved': return 'secondary';
    default: return 'outline';
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
  const { stats, commissions, campaigns, referralLink, currentRewardPerUser } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-secondary/30 bg-secondary/5">
            <Star className="w-4 h-4 text-secondary" />
            <span className="text-sm font-medium text-secondary">Influencer</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-3">
            Vítejte, {data.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Váš influencer přehled</p>
        </div>

        {/* ── 1. Statistics ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={UserPlus} label="Registrace dnes" value={stats.todayReferrals} />
          <StatCard icon={Users} label="Registrace tento měsíc" value={stats.thisMonthReferrals} />
          <StatCard icon={UserCheck} label="Aktivní (30 dní)" value={stats.activeReferrals} />
          <StatCard icon={Percent} label="Konverze (registrace → platba)" value={stats.conversionRate} suffix="%" />
          <StatCard icon={Banknote} label="Celkem vyděláno" value={stats.totalEarnedCzk.toLocaleString('cs-CZ')} suffix="Kč" />
          <StatCard icon={TrendingUp} label="Tento měsíc" value={stats.currentMonthCzk.toLocaleString('cs-CZ')} suffix="Kč" />
        </div>

        {/* ── 2. Referral Link ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Váš referral odkaz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {/* How it works */}
            <div className="rounded-lg border border-border/40 bg-muted/30 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Jak to funguje?</p>
                  <p>Sdílejte tento odkaz se svými sledujícími. Každý nový uživatel, který se přes váš odkaz zaregistruje, bude automaticky přiřazen k vašemu účtu.</p>
                  <p>Za každého uživatele, který provede platbu, získáváte provizi, která se automaticky počítá a vyplácí měsíčně.</p>
                </div>
              </div>
            </div>

            {/* Current reward */}
            {currentRewardPerUser !== null && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Banknote className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm">
                  Aktuální odměna z aktivní kampaně:{' '}
                  <span className="font-bold text-primary">
                    {currentRewardPerUser.toLocaleString('cs-CZ')} Kč
                  </span>{' '}
                  za nového uživatele
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 3. Commissions & Payouts ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Provize a výplaty
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pending payout summary */}
            {stats.pendingPayoutCzk > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-secondary/20 bg-secondary/5 px-4 py-3">
                <span className="text-sm text-muted-foreground">Čeká na výplatu</span>
                <span className="text-lg font-bold tabular-nums">
                  {stats.pendingPayoutCzk.toLocaleString('cs-CZ')} Kč
                </span>
              </div>
            )}

            {commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Zatím žádné provize. Jakmile přivedete první uživatele, provize se zde zobrazí.
              </p>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Měsíc</TableHead>
                      <TableHead className="text-right">Částka</TableHead>
                      <TableHead className="text-right">Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                            {format(new Date(c.period_month), 'LLLL yyyy', { locale: cs })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {Number(c.amount_czk).toLocaleString('cs-CZ')} Kč
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={commissionStatusVariant(c.status)}>
                            {commissionStatusLabel(c.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 4. Campaigns ── */}
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div className="rounded bg-muted/40 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide mb-0.5">Bonus za registraci</span>
                        <span className="font-semibold text-foreground">
                          {Number(camp.bonus_czk_per_new_user).toLocaleString('cs-CZ')} Kč
                        </span>
                      </div>
                      <div className="rounded bg-muted/40 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide mb-0.5">Bonus pro uživatele</span>
                        <span className="font-semibold text-foreground">
                          {Number(camp.bonus_mc_for_user)} MC
                        </span>
                      </div>
                      <div className="rounded bg-muted/40 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wide mb-0.5">Platnost</span>
                        <span className="font-semibold text-foreground">
                          {format(new Date(camp.starts_at), 'd. M. yyyy', { locale: cs })} – {format(new Date(camp.ends_at), 'd. M. yyyy', { locale: cs })}
                        </span>
                      </div>
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
