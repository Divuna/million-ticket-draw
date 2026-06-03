/**
 * AFFILIATE v2 — Uživatelský dashboard (/affiliate/dashboard).
 *
 * Přepínač prostředí: Influencer | Obchodník
 * Volba se ukládá do localStorage → otevře se naposledy zvolené prostředí.
 * Pokud má účet jen jednu roli, druhá je zobrazena jako nedostupná.
 *
 * Data:
 *  - affiliate_accounts      WHERE auth_user_id = uid()
 *  - affiliate_customer_refs WHERE affiliate_id = id  → influencer statistiky
 *  - affiliate_company_refs  WHERE affiliate_id = id  → sales_rep statistiky
 *  - affiliate_commissions   WHERE affiliate_id = id  → provize
 *  - partners                WHERE id IN (...)        → názvy firem (graceful)
 *
 * Bezpečnost: RLS, read-only, žádný service role ve frontendu.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2, Star, Users, UserPlus, Banknote, CalendarDays,
  Copy, Check, Link2, TrendingUp, Clock, User,
  Megaphone, Briefcase, Wallet, Sparkles, Zap,
  LogOut, Building2, ChevronRight, MessageCircle,
} from 'lucide-react';
import { format, isToday, isThisMonth, subDays } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';

/* ── Types ───────────────────────────────────────────────────────────────────── */

type ActiveMode = 'influencer' | 'sales_rep';

interface AffiliateAccount {
  id: string;
  name: string;
  email: string;
  ref_code: string;
  modes: string[];
  status: string;
  commission_rate_customer: number;
  commission_rate_company: number;
  is_vat_payer: boolean;
}

interface CommissionRow {
  id: string;
  commission_type: string;
  period_month: string | null;
  amount_base_czk: number;
  vat_rate: number;
  amount_total_czk: number;
  status: string;
  paid_at: string | null;
}

interface CustomerRef { id: string; created_at: string; }
interface CompanyRef  { id: string; partner_id: string; created_at: string; }
interface PartnerInfo { id: string; name: string; company_name: string | null; }

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'affiliate_active_mode';

const czk = (n: number) =>
  `${(n ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč`;

const thirtyDaysAgo = () => subDays(new Date(), 30);

function commissionStatusBadge(status: string) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold';
  switch (status) {
    case 'paid':       return <span className={`${base} bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]`}>Vyplaceno</span>;
    case 'approved':   return <span className={`${base} bg-[hsl(43_90%_55%/0.15)] text-[hsl(43_90%_55%)] border-[hsl(43_90%_55%/0.3)]`}>Schváleno</span>;
    case 'calculated': return <span className={`${base} bg-[hsl(215_15%_70%/0.1)] text-[hsl(215_15%_70%)] border-[hsl(215_15%_70%/0.2)]`}>Čeká na schválení</span>;
    default:           return <span className={`${base} bg-muted text-muted-foreground border-border`}>{status}</span>;
  }
}

function accountStatusBadge(status: string) {
  switch (status) {
    case 'approved':  return <Badge className="bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]">Aktivní</Badge>;
    case 'pending':   return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">Čeká na schválení</Badge>;
    case 'rejected':  return <Badge variant="destructive">Zamítnutý</Badge>;
    case 'suspended': return <Badge variant="outline">Pozastavený</Badge>;
    default:          return <Badge variant="outline">{status}</Badge>;
  }
}

/* ── CopyInput ───────────────────────────────────────────────────────────────── */

function CopyInput({ value, testId }: { value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Odkaz zkopírován do schránky');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Nepodařilo se zkopírovat odkaz'); }
  };
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        readOnly
        data-testid={testId}
        className="font-mono text-sm bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] text-[hsl(var(--text-silver))]"
      />
      <Button
        onClick={handleCopy}
        className="shrink-0 gap-2 bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Zkopírováno' : 'Kopírovat'}
      </Button>
    </div>
  );
}

/* ── StatCard ────────────────────────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, accent = false }: {
  icon: React.ElementType; label: string; value: string | number; accent?: boolean;
}) {
  return (
    <div className={`luxury-card p-5 group hover:border-[hsl(var(--neon-gold)/0.3)] transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${accent
          ? 'bg-[hsl(var(--neon-gold)/0.12)] border border-[hsl(var(--neon-gold)/0.2)]'
          : 'bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border)/0.4)]'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-[hsl(var(--neon-gold))]' : 'text-[hsl(var(--text-muted-gray))]'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] mb-0.5">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${accent ? 'text-[hsl(var(--neon-gold))]' : 'text-[hsl(var(--text-silver))]'}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Mode switcher ───────────────────────────────────────────────────────────── */

function ModeSwitcher({
  account, activeMode, onSwitch,
}: { account: AffiliateAccount; activeMode: ActiveMode; onSwitch: (m: ActiveMode) => void }) {
  const modes: { id: ActiveMode; label: string; Icon: React.ElementType }[] = [
    { id: 'influencer', label: 'Influencer', Icon: Megaphone },
    { id: 'sales_rep',  label: 'Obchodník',  Icon: Briefcase },
  ];
  return (
    <div className="flex gap-1 rounded-xl border border-[hsl(var(--border)/0.5)] p-1 bg-black/30 w-fit" data-testid="mode-switcher">
      {modes.map(({ id, label, Icon }) => {
        const hasRole = account.modes.includes(id);
        const isActive = activeMode === id;
        return (
          <button
            key={id}
            onClick={() => hasRole && onSwitch(id)}
            disabled={!hasRole}
            data-testid={`mode-btn-${id}`}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all
              ${isActive
                ? 'bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] shadow-sm'
                : hasRole
                  ? 'text-[hsl(var(--text-muted-gray))] hover:text-[hsl(var(--text-silver))] hover:bg-white/5'
                  : 'text-[hsl(var(--text-muted-gray)/0.35)] cursor-not-allowed'}`}
            title={!hasRole ? `${label} — tento režim nemáte aktivní` : undefined}
          >
            <Icon className="w-4 h-4" />
            {label}
            {!hasRole && <span className="text-[10px] opacity-60 font-normal">(není aktivní)</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Empty state for pending/rejected ───────────────────────────────────────── */

function StatusBlock({ status, onLogout }: { status: string; onLogout: () => void }) {
  if (status === 'pending') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="luxury-card max-w-md w-full text-center p-8 space-y-4">
        <Clock className="w-12 h-12 mx-auto text-amber-500" />
        <h2 className="text-xl font-semibold text-[hsl(var(--text-silver))]">Žádost ve schvalování</h2>
        <p className="text-[hsl(var(--text-muted-gray))] text-sm">Vaše žádost o Affiliate účet je ve schvalování. O výsledku vás budeme informovat e-mailem.</p>
        <Button variant="outline" size="sm" onClick={onLogout} className="gap-2 mt-2"><LogOut className="w-4 h-4" />Odhlásit se</Button>
      </div>
    </div>
  );
  if (status === 'rejected') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="luxury-card max-w-md w-full text-center p-8 space-y-4">
        <User className="w-12 h-12 mx-auto text-destructive" />
        <h2 className="text-xl font-semibold text-[hsl(var(--text-silver))]">Žádost zamítnuta</h2>
        <p className="text-[hsl(var(--text-muted-gray))] text-sm">Kontaktujte nás na <a href="mailto:podpora@onemil.cz" className="text-[hsl(var(--neon-gold))] hover:underline">podpora@onemil.cz</a>.</p>
        <Button variant="outline" size="sm" onClick={onLogout} className="gap-2 mt-2"><LogOut className="w-4 h-4" />Odhlásit se</Button>
      </div>
    </div>
  );
  return null;
}

/* ── Main component ──────────────────────────────────────────────────────────── */

const AffiliateDashboard = () => {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [account,      setAccount]      = useState<AffiliateAccount | null>(null);
  const [commissions,  setCommissions]  = useState<CommissionRow[]>([]);
  const [customerRefs, setCustomerRefs] = useState<CustomerRef[]>([]);
  const [companyRefs,  setCompanyRefs]  = useState<CompanyRef[]>([]);
  const [partnerNames, setPartnerNames] = useState<PartnerInfo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [notAffiliate, setNotAffiliate] = useState(false);
  const [activeMode,   setActiveMode]   = useState<ActiveMode>('influencer');

  /* ── Load ── */

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: acc, error: accErr } = await (supabase as any)
        .from('affiliate_accounts')
        .select('id,name,email,ref_code,modes,status,commission_rate_customer,commission_rate_company,is_vat_payer')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (accErr) throw accErr;
      if (!acc) { setNotAffiliate(true); setLoading(false); return; }
      setAccount(acc as AffiliateAccount);

      const aid = (acc as AffiliateAccount).id;

      // Restore saved mode
      const saved = localStorage.getItem(STORAGE_KEY) as ActiveMode | null;
      const modes = (acc as AffiliateAccount).modes;
      if (saved && modes.includes(saved)) setActiveMode(saved);
      else if (modes.includes('influencer')) setActiveMode('influencer');
      else if (modes.includes('sales_rep'))  setActiveMode('sales_rep');

      const [custR, compR, commR] = await Promise.all([
        (supabase as any).from('affiliate_customer_refs').select('id,created_at').eq('affiliate_id', aid).order('created_at', { ascending: false }),
        (supabase as any).from('affiliate_company_refs').select('id,partner_id,created_at').eq('affiliate_id', aid).order('created_at', { ascending: false }),
        (supabase as any).from('affiliate_commissions').select('id,commission_type,period_month,amount_base_czk,vat_rate,amount_total_czk,status,paid_at').eq('affiliate_id', aid).order('period_month', { ascending: false }),
      ]);

      setCustomerRefs((custR.data || []) as CustomerRef[]);
      setCompanyRefs((compR.data || []) as CompanyRef[]);
      setCommissions((commR.data || []) as CommissionRow[]);

      // Try partner names (graceful)
      const partnerIds = (compR.data || []).map((r: CompanyRef) => r.partner_id).filter(Boolean);
      if (partnerIds.length > 0) {
        try {
          const { data: pData } = await supabase.from('partners').select('id,name,company_name').in('id', partnerIds);
          setPartnerNames((pData || []) as PartnerInfo[]);
        } catch { /* RLS blocks — silently ignore */ }
      }
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se načíst affiliate data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleModeSwitch = (mode: ActiveMode) => {
    setActiveMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/'); };

  /* ── Guards ── */

  if (!user) return <NavigateToLogin />;
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--neon-gold))]" />
    </div>
  );
  if (notAffiliate) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="luxury-card max-w-md w-full text-center p-8 space-y-4">
        <Megaphone className="w-12 h-12 mx-auto text-[hsl(var(--neon-gold)/0.5)]" />
        <h1 className="text-2xl font-bold text-[hsl(var(--heading-gold))]">Affiliate program</h1>
        <p className="text-[hsl(var(--text-muted-gray))] text-sm">Nemáte zatím affiliate účet. Zaregistrujte se a začněte vydělávat provize.</p>
        <Button onClick={() => navigate('/affiliate/register')} className="bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold">
          Zaregistrovat se
        </Button>
      </div>
    </div>
  );

  const a = account!;

  // Show status block for non-approved
  if (a.status !== 'approved' && a.status !== 'suspended') {
    const block = <StatusBlock status={a.status} onLogout={handleLogout} />;
    if (block) return block;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://onemil.cz';
  const customerLink = `${origin}/?ref=${a.ref_code}`;
  const companyLink  = `${origin}/partner/register?via=${a.ref_code}`;

  const isInfluencer = a.modes.includes('influencer');
  const isSalesRep   = a.modes.includes('sales_rep');

  /* ── Stats ── */

  const ago30 = thirtyDaysAgo();
  const custToday    = customerRefs.filter(r => isToday(new Date(r.created_at))).length;
  const custThisMonth= customerRefs.filter(r => isThisMonth(new Date(r.created_at))).length;
  const cust30d      = customerRefs.filter(r => new Date(r.created_at) >= ago30).length;
  const compToday    = companyRefs.filter(r => isToday(new Date(r.created_at))).length;
  const comp30d      = companyRefs.filter(r => new Date(r.created_at) >= ago30).length;

  /* ── Commission totals ── */

  const totals = {
    calculated: commissions.filter(c => c.status === 'calculated').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    approved:   commissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    paid:       commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
  };

  // Current month earnings
  const thisMonthPfx = new Date().toISOString().slice(0, 7);
  const currentMonthCzk = commissions
    .filter(c => c.period_month?.startsWith(thisMonthPfx))
    .reduce((s, c) => s + Number(c.amount_total_czk || 0), 0);

  const totalEarnedCzk = totals.paid + totals.approved + totals.calculated;

  // Mode-filtered commissions
  const modeCommissions = commissions.filter(c =>
    activeMode === 'influencer' ? c.commission_type === 'customer_payments' : c.commission_type === 'company_invoice'
  );

  // Partner name map
  const partnerMap = new Map(partnerNames.map(p => [p.id, p]));

  /* ── Render ── */

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <div
          className="relative overflow-hidden rounded-2xl border border-[hsl(var(--neon-gold)/0.25)] p-6 sm:p-8"
          style={{ background: 'linear-gradient(135deg, hsl(222 47% 8%) 0%, hsl(222 40% 12%) 50%, hsl(43 30% 12%) 100%)' }}
        >
          {/* Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, hsl(43 90% 55%), transparent 70%)' }} />

          <div className="relative z-10 space-y-4">
            {/* Top row: badge + logout */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[hsl(var(--neon-gold)/0.4)] bg-[hsl(var(--neon-gold)/0.1)]">
                <Star className="w-3.5 h-3.5 text-[hsl(var(--neon-gold))]" />
                <span className="text-xs font-semibold tracking-wide uppercase text-[hsl(var(--neon-gold))]">
                  Aktivní Affiliate partner
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/influencer/messages">
                  <Button variant="outline" size="sm" className="gap-2 border-[hsl(var(--border)/0.5)] text-[hsl(var(--text-muted-gray))] hover:text-[hsl(var(--text-silver))]">
                    <MessageCircle className="w-4 h-4" /><span className="hidden sm:inline">Zprávy</span>
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={handleLogout}
                  className="gap-2 border-[hsl(var(--border)/0.5)] text-[hsl(var(--text-muted-gray))] hover:text-[hsl(var(--text-silver))]">
                  <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Odhlásit se</span>
                </Button>
              </div>
            </div>

            {/* Title + mode switcher + monthly highlight */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-heading-gold !text-[hsl(var(--heading-gold))]">
                  Vydělávejte s OneMil
                </h1>
                <p className="text-sm text-[hsl(var(--text-muted-gray))] max-w-md">
                  {activeMode === 'influencer'
                    ? 'Sdílejte svůj Affiliate odkaz, přivádějte nové zákazníky a sledujte své provize.'
                    : 'Doporučujte OneMil firmám a e-shopům a získávejte provize z jejich fakturace.'}
                </p>
                <ModeSwitcher account={a} activeMode={activeMode} onSwitch={handleModeSwitch} />
              </div>

              {/* Current month highlight */}
              <div className="shrink-0 rounded-xl border border-[hsl(var(--neon-gold)/0.3)] bg-[hsl(var(--neon-gold)/0.08)] px-6 py-4 text-center sm:text-right">
                <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--neon-gold)/0.7)] mb-1">Tento měsíc</p>
                <p className="text-3xl font-extrabold tabular-nums text-[hsl(var(--neon-gold))]">
                  {currentMonthCzk.toLocaleString('cs-CZ')} <span className="text-lg">Kč</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Suspended warning */}
        {a.status === 'suspended' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">Váš účet je pozastaven. Kontaktujte podporu OneMil.</p>
          </div>
        )}

        {/* ══ STAT CARDS (mode-specific) ═══════════════════════════════════ */}
        {activeMode === 'influencer' ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={Banknote}   label="Celkem vyděláno"        value={czk(totalEarnedCzk)}   accent />
            <StatCard icon={TrendingUp} label="Tento měsíc"            value={czk(currentMonthCzk)}  accent />
            <StatCard icon={UserPlus}   label="Registrace dnes"        value={custToday}              />
            <StatCard icon={Users}      label="Registrace tento měsíc" value={custThisMonth}          />
            <StatCard icon={Users}      label="Registrace (30 dní)"    value={cust30d}                />
            <StatCard icon={Users}      label="Celkem zákazníků"       value={customerRefs.length}    />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={Banknote}   label="Celkem vyděláno"    value={czk(totalEarnedCzk)}  accent />
            <StatCard icon={TrendingUp} label="Tento měsíc"        value={czk(currentMonthCzk)} accent />
            <StatCard icon={Building2}  label="Firmy dnes"         value={compToday}             />
            <StatCard icon={Building2}  label="Firmy (30 dní)"     value={comp30d}               />
            <StatCard icon={Building2}  label="Celkem firem"       value={companyRefs.length}    />
            <StatCard icon={Wallet}     label="Schváleno k výplatě" value={czk(totals.approved)} />
          </div>
        )}

        {/* ══ AFFILIATE ODKAZ ══════════════════════════════════════════════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">
                {activeMode === 'influencer' ? 'Váš Affiliate odkaz pro zákazníky' : 'Váš odkaz pro firmy a e-shopy'}
              </h3>
            </div>

            <CopyInput
              value={activeMode === 'influencer' ? customerLink : companyLink}
              testId={activeMode === 'influencer' ? 'affiliate-customer-link' : 'affiliate-company-link'}
            />

            {/* QR kód */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pt-2">
              <div className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-white p-3 shadow-sm">
                <QRCodeSVG
                  value={activeMode === 'influencer' ? customerLink : companyLink}
                  size={140}
                  data-testid="affiliate-qr-code"
                />
              </div>
              <div className="rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] p-4 space-y-2 flex-1">
                <p className="text-sm font-medium text-[hsl(var(--text-silver))] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[hsl(var(--neon-gold))]" />
                  {activeMode === 'influencer' ? 'Jak funguje Influencer odkaz?' : 'Jak funguje Obchodník odkaz?'}
                </p>
                <p className="text-sm text-[hsl(var(--text-muted-gray))] leading-relaxed">
                  {activeMode === 'influencer'
                    ? 'Sdílejte tento odkaz se svým publikem. Zákazník, který se zaregistruje přes váš odkaz, zůstane k vašemu účtu přiřazen trvale (first-touch). Z jeho placených dobití MioCoinů budete dostávat provizi.'
                    : 'Sdílejte tento odkaz s firmami a e-shopy. Pokud se firma zaregistruje jako partner přes váš odkaz a admin ji schválí, budete z její fakturace OneMil dostávat provizi po celou dobu spolupráce.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ══ VÝSLEDKY (mode-specific) ═════════════════════════════════════ */}
        {activeMode === 'influencer' && customerRefs.length > 0 && (
          <div className="luxury-card overflow-hidden">
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Přivedení zákazníci</h3>
                <Badge className="bg-[hsl(var(--neon-gold)/0.15)] text-[hsl(var(--neon-gold))] border-[hsl(var(--neon-gold)/0.3)]">
                  {customerRefs.length}
                </Badge>
              </div>
              {customerRefs[0] && (
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Poslední registrace: {format(new Date(customerRefs[0].created_at), 'd. MMMM yyyy', { locale: cs })}
                </p>
              )}
            </div>
          </div>
        )}

        {activeMode === 'sales_rep' && companyRefs.length > 0 && (
          <div className="luxury-card overflow-hidden">
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Moje firmy</h3>
                <Badge className="bg-[hsl(var(--neon-gold)/0.15)] text-[hsl(var(--neon-gold))] border-[hsl(var(--neon-gold)/0.3)]">
                  {companyRefs.length}
                </Badge>
              </div>
              <ul className="space-y-2" data-testid="company-list">
                {companyRefs.map(cr => {
                  const p = partnerMap.get(cr.partner_id);
                  return (
                    <li key={cr.id} className="flex items-center gap-2 text-sm rounded-lg border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-3 py-2">
                      <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--text-muted-gray))] shrink-0" />
                      <span className="flex-1 text-[hsl(var(--text-silver))]">
                        {p ? (p.company_name || p.name) : `Firma ${cr.partner_id.slice(0, 8)}…`}
                      </span>
                      <span className="text-xs text-[hsl(var(--text-muted-gray))]">
                        {format(new Date(cr.created_at), 'd. M. yyyy', { locale: cs })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* ══ PROVIZE ══════════════════════════════════════════════════════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Provize a výplaty</h3>
            </div>

            {/* Payout summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {totals.calculated > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Čeká na schválení</span>
                  <span className="text-base font-bold tabular-nums text-[hsl(var(--text-silver))]">{czk(totals.calculated)}</span>
                </div>
              )}
              {totals.approved > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--neon-gold)/0.2)] bg-[hsl(var(--neon-gold)/0.06)] px-4 py-3">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Ke výplatě</span>
                  <span className="text-base font-bold tabular-nums text-[hsl(var(--neon-gold))]">{czk(totals.approved)}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                <span className="text-sm text-[hsl(var(--text-muted-gray))]">Celkem vyplaceno</span>
                <span className="text-base font-bold tabular-nums text-[hsl(var(--text-silver))]">{czk(totals.paid)}</span>
              </div>
            </div>

            {/* Commission table (mode-filtered) */}
            {modeCommissions.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Banknote className="w-10 h-10 mx-auto text-[hsl(var(--text-muted-gray)/0.4)]" />
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Zatím žádné provize. Sdílejte svůj odkaz a začněte přivádět{' '}
                  {activeMode === 'influencer' ? 'zákazníky' : 'firmy'}.
                </p>
                <p className="text-xs text-[hsl(var(--text-muted-gray)/0.6)] max-w-sm mx-auto">
                  Jakmile vznikne placená aktivita přivedených {activeMode === 'influencer' ? 'zákazníků' : 'firem'},
                  systém automaticky vypočítá vaši provizi.
                </p>
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border border-[hsl(var(--border)/0.3)]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[hsl(var(--border)/0.3)] hover:bg-transparent">
                      <TableHead className="text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Měsíc</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Základ</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">DPH</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Celkem</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modeCommissions.map(c => (
                      <TableRow key={c.id} className="border-b border-[hsl(var(--border)/0.15)] hover:bg-[hsl(var(--muted)/0.2)]">
                        <TableCell className="font-medium text-[hsl(var(--text-silver))]">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-[hsl(var(--text-muted-gray))] shrink-0" />
                            {c.period_month ? format(new Date(c.period_month), 'LLLL yyyy', { locale: cs }) : '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-[hsl(var(--text-silver))]">{czk(c.amount_base_czk)}</TableCell>
                        <TableCell className="text-right tabular-nums text-[hsl(var(--text-muted-gray))]">
                          {c.vat_rate ? `${c.vat_rate} %` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-[hsl(var(--text-silver))]">{czk(c.amount_total_czk)}</TableCell>
                        <TableCell className="text-right">{commissionStatusBadge(c.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* ══ KAMPANĚ (placeholder) ════════════════════════════════════════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Affiliate kampaně</h3>
            </div>
            <div className="text-center py-8 space-y-2">
              <Zap className="w-10 h-10 mx-auto text-[hsl(var(--neon-gold)/0.3)]" />
              <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                Kampaně pro Affiliate v2 budou dostupné brzy.
              </p>
              <p className="text-xs text-[hsl(var(--text-muted-gray)/0.6)]">
                Speciální odměny za přivedené uživatele v rámci kampaní OneMil.
              </p>
            </div>
          </div>
        </div>

        {/* ══ FOOTER info ══════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-5 py-4 text-sm text-[hsl(var(--text-muted-gray))]">
          <span>
            Váš doporučovací kód:{' '}
            <span className="font-mono font-semibold text-[hsl(var(--text-silver))]">{a.ref_code}</span>
          </span>
          <span className="flex items-center gap-2">
            {accountStatusBadge(a.status)}
            <span>·</span>
            <span>Sazba zákazníci: <strong className="text-[hsl(var(--text-silver))]">{a.commission_rate_customer} %</strong></span>
            <span>·</span>
            <span>Firmy: <strong className="text-[hsl(var(--text-silver))]">{a.commission_rate_company} %</strong></span>
          </span>
        </div>

      </div>
    </div>
  );
};

export default AffiliateDashboard;
