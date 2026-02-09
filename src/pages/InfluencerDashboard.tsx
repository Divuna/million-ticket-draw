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
  Sparkles,
  Zap,
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

const commissionStatusColor = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]';
    case 'approved': return 'bg-[hsl(43_90%_55%/0.15)] text-[hsl(43_90%_55%)] border-[hsl(43_90%_55%/0.3)]';
    default: return 'bg-[hsl(215_15%_70%/0.1)] text-[hsl(215_15%_70%)] border-[hsl(215_15%_70%/0.2)]';
  }
};

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--neon-gold))]" />
      </div>
    );
  }

  if (error === 'not_authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="luxury-card max-w-md w-full text-center p-8 space-y-4">
          <User className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold text-[hsl(var(--text-silver))]">Přihlášení vyžadováno</h2>
          <p className="text-muted-foreground text-sm">
            Pro přístup k influencer dashboardu se musíte nejdříve přihlásit.
          </p>
          <Link to="/partner/login" className="inline-block text-sm text-[hsl(var(--neon-gold))] hover:underline mt-2">
            Přejít na přihlášení →
          </Link>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="luxury-card max-w-md w-full text-center p-8 space-y-4">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold text-[hsl(var(--text-silver))]">Přístup zamítnut</h2>
          <p className="text-muted-foreground text-sm">
            Váš influencer účet nebyl nalezen nebo nemáte oprávnění.
          </p>
          <Link to="/" className="inline-flex items-center text-sm text-[hsl(var(--neon-gold))] hover:underline mt-2">
            <ArrowLeft className="mr-1 h-4 w-4" /> Zpět na hlavní stránku
          </Link>
        </div>
      </div>
    );
  }

  const { stats, commissions, campaigns, referralLink, currentRewardPerUser, nextPayoutDate } = data;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">

        {/* ══════ HERO ══════ */}
        <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--neon-gold)/0.25)] p-6 sm:p-8"
          style={{
            background: 'linear-gradient(135deg, hsl(222 47% 8%) 0%, hsl(222 40% 12%) 50%, hsl(43 30% 12%) 100%)',
          }}
        >
          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, hsl(43 90% 55%), transparent 70%)' }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[hsl(var(--neon-gold)/0.4)] bg-[hsl(var(--neon-gold)/0.1)]">
                <Star className="w-3.5 h-3.5 text-[hsl(var(--neon-gold))]" />
                <span className="text-xs font-semibold tracking-wide uppercase text-[hsl(var(--neon-gold))]">
                  Aktivní influencer
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-heading-gold !text-[hsl(var(--heading-gold))]">
                Vydělávejte s OneMil
              </h1>
              <p className="text-sm text-[hsl(var(--text-muted-gray))] max-w-md">
                Sdílejte svůj odkaz, přivádějte nové hráče a sledujte své výdělky v reálném čase.
              </p>
            </div>

            {/* Hero earning highlight */}
            <div className="shrink-0 rounded-xl border border-[hsl(var(--neon-gold)/0.3)] bg-[hsl(var(--neon-gold)/0.08)] px-6 py-4 text-center sm:text-right">
              <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--neon-gold)/0.7)] mb-1">Tento měsíc</p>
              <p className="text-3xl font-extrabold tabular-nums text-[hsl(var(--neon-gold))]">
                {stats.currentMonthCzk.toLocaleString('cs-CZ')} <span className="text-lg">Kč</span>
              </p>
            </div>
          </div>
        </div>

        {/* ══════ STAT CARDS ══════ */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Banknote, label: 'Celkem vyděláno', value: `${stats.totalEarnedCzk.toLocaleString('cs-CZ')} Kč`, accent: true },
            { icon: TrendingUp, label: 'Tento měsíc', value: `${stats.currentMonthCzk.toLocaleString('cs-CZ')} Kč`, accent: true },
            { icon: Percent, label: 'Konverze', value: `${stats.conversionRate} %`, accent: false },
            { icon: UserPlus, label: 'Registrace dnes', value: stats.todayReferrals, accent: false },
            { icon: Users, label: 'Registrace tento měsíc', value: stats.thisMonthReferrals, accent: false },
            { icon: UserCheck, label: 'Registrace (30 dní)', value: stats.activeReferrals, accent: false },
          ].map((s, i) => (
            <div key={i} className="luxury-card p-5 group hover:border-[hsl(var(--neon-gold)/0.3)] transition-all">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${s.accent ? 'bg-[hsl(var(--neon-gold)/0.12)] border border-[hsl(var(--neon-gold)/0.2)]' : 'bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border)/0.4)]'}`}>
                  <s.icon className={`w-5 h-5 ${s.accent ? 'text-[hsl(var(--neon-gold))]' : 'text-[hsl(var(--text-muted-gray))]'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] mb-0.5">{s.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${s.accent ? 'text-[hsl(var(--neon-gold))]' : 'text-[hsl(var(--text-silver))]'}`}>
                    {s.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ══════ REFERRAL LINK ══════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Váš referral odkaz</h3>
            </div>

            <div className="flex gap-2">
              <Input
                value={referralLink}
                readOnly
                className="font-mono text-sm bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)]"
              />
              <Button
                onClick={handleCopy}
                className="shrink-0 gap-2 bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Zkopírováno' : 'Kopírovat'}
              </Button>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] p-4 space-y-2">
              <p className="text-sm font-medium text-[hsl(var(--text-silver))] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[hsl(var(--neon-gold))]" />
                Jak to funguje?
              </p>
              <p className="text-sm text-[hsl(var(--text-muted-gray))] leading-relaxed">
                Sdílejte tento odkaz se svými sledujícími. Za každého nového uživatele, který se přes váš odkaz zaregistruje a provede platbu, získáváte provizi. Provize se automaticky počítají a vyplácejí měsíčně.
              </p>
            </div>

            {/* Current campaign reward */}
            {currentRewardPerUser !== null && (
              <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--neon-gold)/0.25)] bg-[hsl(var(--neon-gold)/0.06)] px-4 py-3">
                <Zap className="w-5 h-5 text-[hsl(var(--neon-gold))] shrink-0" />
                <span className="text-sm text-[hsl(var(--text-silver))]">
                  Aktuální odměna z aktivní kampaně:{' '}
                  <span className="font-bold text-[hsl(var(--neon-gold))]">
                    {currentRewardPerUser.toLocaleString('cs-CZ')} Kč
                  </span>{' '}
                  za nového uživatele
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ══════ COMMISSIONS & PAYOUTS ══════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Provize a výplaty</h3>
            </div>

            {/* Payout summary row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stats.pendingPayoutCzk > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--neon-gold)/0.2)] bg-[hsl(var(--neon-gold)/0.06)] px-4 py-3">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Čeká na výplatu</span>
                  <span className="text-lg font-bold tabular-nums text-[hsl(var(--neon-gold))]">
                    {stats.pendingPayoutCzk.toLocaleString('cs-CZ')} Kč
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                <span className="text-sm text-[hsl(var(--text-muted-gray))]">Další výplata</span>
                <span className="text-sm font-semibold text-[hsl(var(--text-silver))]">
                  {format(new Date(nextPayoutDate), 'd. MMMM yyyy', { locale: cs })}
                </span>
              </div>
            </div>

            {commissions.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Banknote className="w-10 h-10 mx-auto text-[hsl(var(--text-muted-gray)/0.4)]" />
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Zatím žádné provize. Sdílejte svůj odkaz a začněte vydělávat!
                </p>
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border border-[hsl(var(--border)/0.3)]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[hsl(var(--border)/0.3)] hover:bg-transparent">
                      <TableHead className="text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Měsíc</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Částka</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((c) => (
                      <TableRow key={c.id} className="border-b border-[hsl(var(--border)/0.15)] hover:bg-[hsl(var(--muted)/0.2)]">
                        <TableCell className="font-medium text-[hsl(var(--text-silver))]">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-[hsl(var(--text-muted-gray))] shrink-0" />
                            {format(new Date(c.period_month), 'LLLL yyyy', { locale: cs })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-[hsl(var(--text-silver))]">
                          {Number(c.amount_czk).toLocaleString('cs-CZ')} Kč
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${commissionStatusColor(c.status)}`}>
                            {commissionStatusLabel(c.status)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* ══════ CAMPAIGNS ══════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Kampaně</h3>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Megaphone className="w-10 h-10 mx-auto text-[hsl(var(--text-muted-gray)/0.4)]" />
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Momentálně nejste zařazeni do žádné kampaně.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((camp) => {
                  const isActive = camp.active && new Date() >= new Date(camp.starts_at) && new Date() <= new Date(camp.ends_at);
                  return (
                    <div
                      key={camp.id}
                      className={`rounded-xl border p-4 space-y-3 transition-all ${isActive
                          ? 'border-[hsl(var(--neon-gold)/0.3)] bg-[hsl(var(--neon-gold)/0.04)]'
                          : 'border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)]'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[hsl(var(--text-silver))]">{camp.name}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${isActive
                            ? 'bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]'
                            : 'bg-[hsl(215_15%_70%/0.1)] text-[hsl(215_15%_70%)] border-[hsl(215_15%_70%/0.2)]'
                          }`}>
                          {isActive ? 'Aktivní' : 'Ukončená'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { label: 'Bonus za registraci', value: `${Number(camp.bonus_czk_per_new_user).toLocaleString('cs-CZ')} Kč` },
                          { label: 'Bonus pro uživatele', value: `${Number(camp.bonus_mc_for_user)} MC` },
                          { label: 'Platnost', value: `${format(new Date(camp.starts_at), 'd. M. yyyy', { locale: cs })} – ${format(new Date(camp.ends_at), 'd. M. yyyy', { locale: cs })}` },
                        ].map((item, idx) => (
                          <div key={idx} className="rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-3 py-2.5">
                            <span className="block text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))] mb-0.5">{item.label}</span>
                            <span className="font-semibold text-sm text-[hsl(var(--text-silver))]">{item.value}</span>
                          </div>
                        ))}
                      </div>
                      {isActive && (
                        <p className="text-xs text-[hsl(var(--neon-gold)/0.7)] flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          Tato kampaň je právě aktivní — každý nový uživatel se vám počítá!
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfluencerDashboard;
