/**
 * AFFILIATE v2 — Uživatelský dashboard (/affiliate/dashboard).
 *
 * Přepínač Influencer | Obchodník — uživatel přepíná sám, volba se ukládá
 * do localStorage. Oba módy jsou vždy dostupné; `modes` je jen původní zaměření pro admina.
 *
 * Sekce:
 *  1. Hero + přepínač
 *  2. Statistiky (per-mód)
 *  3. Sdílecí odkaz + QR
 *  4. Výsledky (zákazníci / firmy)
 *  5. Provize
 *  6. Kampaně (placeholder)
 *  7. Pravidla spolupráce (Influencer)
 *  8. Profil a výplatní údaje
 *  9. Podmínky spolupráce
 *
 * Migrace potřebná pro úplné ukládání profilu:
 *  supabase/migrations/20260603_affiliate_profile_update.sql (APLIKOVAT RUČNĚ)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import AffiliateProfileSection from '@/components/AffiliateProfileSection';
import InfluencerTermsSection from '@/components/InfluencerTermsSection';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2, Star, Users, UserPlus, Banknote, CalendarDays,
  Copy, Check, Link2, TrendingUp, Clock, User,
  Megaphone, Briefcase, Wallet, Sparkles, Zap,
  LogOut, Building2, ChevronRight, MessageCircle,
  ShieldCheck, AlertCircle, FileText,
} from 'lucide-react';
import { format, isToday, isThisMonth, subDays } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';
import type { AffiliateProfileData } from '@/components/AffiliateProfileSection';

/* ── Types ─────────────────────────────────────────────────────────────────── */

type ActiveMode = 'influencer' | 'sales_rep';

interface AffiliateAccount extends AffiliateProfileData {
  ref_code: string;
  modes: string[];
  status: string;
  commission_rate_customer: number;
  commission_rate_company: number;
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

function commStatusBadge(status: string) {
  const b = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold';
  switch (status) {
    case 'paid':       return <span className={`${b} bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]`}>Vyplaceno</span>;
    case 'approved':   return <span className={`${b} bg-[hsl(43_90%_55%/0.15)] text-[hsl(43_90%_55%)] border-[hsl(43_90%_55%/0.3)]`}>Schváleno — bude vyplaceno</span>;
    case 'calculated': return <span className={`${b} bg-[hsl(215_15%_70%/0.1)] text-[hsl(215_15%_70%)] border-[hsl(215_15%_70%/0.2)]`}>Čeká na schválení</span>;
    default:           return <span className={`${b} bg-muted text-muted-foreground border-border`}>{status}</span>;
  }
}

function StatCard({ icon: Icon, label, value, accent = false }: {
  icon: React.ElementType; label: string; value: string | number; accent?: boolean;
}) {
  return (
    <div className="luxury-card p-5 hover:border-[hsl(var(--neon-gold)/0.3)] transition-all">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${accent ? 'bg-[hsl(var(--neon-gold)/0.12)] border border-[hsl(var(--neon-gold)/0.2)]' : 'bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border)/0.4)]'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-[hsl(var(--neon-gold))]' : 'text-[hsl(var(--text-muted-gray))]'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] mb-0.5">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${accent ? 'text-[hsl(var(--neon-gold))]' : 'text-[hsl(var(--text-silver))]'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function CopyInput({ value, testId }: { value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true); toast.success('Odkaz zkopírován');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Nepodařilo se zkopírovat'); }
  };
  return (
    <div className="flex gap-2">
      <Input value={value} readOnly data-testid={testId}
        className="font-mono text-sm bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] text-[hsl(var(--text-silver))]" />
      <Button onClick={handle} className="shrink-0 gap-2 bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Zkopírováno' : 'Kopírovat'}
      </Button>
    </div>
  );
}

/* ── Mode Switcher ───────────────────────────────────────────────────────────── */

function ModeSwitcher({ active, onSwitch }: {
  active: ActiveMode; onSwitch: (m: ActiveMode) => void;
}) {
  const items: { id: ActiveMode; label: string; Icon: React.ElementType }[] = [
    { id: 'influencer', label: 'Influencer', Icon: Megaphone },
    { id: 'sales_rep',  label: 'Obchodník',  Icon: Briefcase },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-xl border border-[hsl(var(--border)/0.5)] p-1 bg-black/30 w-fit" data-testid="mode-switcher">
        {items.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSwitch(id)}
              data-testid={`mode-btn-${id}`}
              aria-pressed={isActive}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all
                ${isActive
                  ? 'bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] shadow-sm'
                  : 'text-[hsl(var(--text-muted-gray))] hover:text-[hsl(var(--text-silver))] hover:bg-white/5'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Influencer Rules ────────────────────────────────────────────────────────── */

function InfluencerRules() {
  const [open, setOpen] = useState(false);
  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
            <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Pravidla spolupráce — Influencer</h3>
          </div>
          <button onClick={() => setOpen(!open)}
            className="text-sm text-[hsl(var(--neon-gold))] hover:underline">
            {open ? 'Skrýt' : 'Zobrazit'}
          </button>
        </div>

        {open && (
          <div className="space-y-4 text-sm text-[hsl(var(--text-muted-gray))] leading-relaxed">
            {/* Co smí */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(160_55%_45%)] mb-2 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />Co jako Influencer smíte
              </p>
              <ul className="space-y-1 pl-4">
                {[
                  'Sdílet svůj Affiliate odkaz na sociálních sítích, v newsletteru a na webu.',
                  'Představit OneMil jako prémiovou reward platformu pro zákazníky.',
                  'Popisovat soutěže jako spotřebitelské soutěže s věcnými výhrami.',
                  'Zdůrazňovat výhody MioCoinů a jejich využití uvnitř OneMil.',
                  'Organizovat vlastní kampaně a propagační akce (konzultujte s OneMil).',
                ].map((r, i) => <li key={i} className="flex items-start gap-2"><span className="text-[hsl(160_55%_45%)] mt-0.5">✓</span>{r}</li>)}
              </ul>
            </div>
            {/* Co nesmí */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(0_72%_51%)] mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />Co jako Influencer NESMÍTE
              </p>
              <ul className="space-y-1 pl-4">
                {[
                  'Popisovat OneMil nebo soutěže jako kasino, hazard, sázení, jackpot nebo žetony.',
                  'Slibovat zisk, výhru nebo zhodnocení peněz.',
                  'Uvádět MioCoin jako peněžní ekvivalent nebo nárokovatelnou hotovost.',
                  'Propagovat OneMil klamavým, zavádějícím nebo nepravdivým způsobem.',
                  'Cílit propagaci na osoby mladší 18 let.',
                  'Sdílet interní materiály (ceníky, smlouvy, provize) bez souhlasu OneMil.',
                ].map((r, i) => <li key={i} className="flex items-start gap-2"><span className="text-[hsl(0_72%_51%)] mt-0.5">✗</span>{r}</li>)}
              </ul>
            </div>
            {/* Doporučená slova */}
            <div className="rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-muted-gray))] mb-2">Doporučená slova a fráze</p>
              <div className="flex flex-wrap gap-2">
                {['soutěž', 'tiket', 'MioCoin', 'voucher', 'věcná výhra', 'hlavní výhra', 'partnerská nabídka',
                  'odměna', 'prémiová platforma', 'reward program', 'spotřebitelská soutěž'].map(w => (
                  <span key={w} className="rounded-full border border-[hsl(var(--neon-gold)/0.3)] bg-[hsl(var(--neon-gold)/0.06)] px-3 py-1 text-xs text-[hsl(var(--neon-gold))]">{w}</span>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-[hsl(var(--text-muted-gray)/0.7)]">
              Plné podmínky spolupráce najdete v sekci „Podmínky spolupráce" níže. V případě nejasností kontaktujte{' '}
              <a href="mailto:podpora@onemil.cz" className="text-[hsl(var(--neon-gold))] hover:underline">podpora@onemil.cz</a>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Status block for pending/rejected ─────────────────────────────────────── */

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

/* ── Main ────────────────────────────────────────────────────────────────────── */

const AffiliateDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [account,      setAccount]      = useState<AffiliateAccount | null>(null);
  const [commissions,  setCommissions]  = useState<CommissionRow[]>([]);
  const [customerRefs, setCustomerRefs] = useState<CustomerRef[]>([]);
  const [companyRefs,  setCompanyRefs]  = useState<CompanyRef[]>([]);
  const [partnerNames, setPartnerNames] = useState<PartnerInfo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [notAffiliate, setNotAffiliate] = useState(false);
  const [activeMode,   setActiveMode]   = useState<ActiveMode>('influencer');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: acc, error: accErr } = await (supabase as any)
        .from('affiliate_accounts')
        // Migration 20260603_affiliate_profile_update.sql applied on both staging + production.
        // All profile columns are now available.
        .select('id,name,email,phone,ref_code,modes,status,commission_rate_customer,commission_rate_company,is_vat_payer,vat_id,payout_account,payout_bank,ico,billing_street,billing_city,billing_zip,billing_country,website_url')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (accErr) throw accErr;
      if (!acc) { setNotAffiliate(true); setLoading(false); return; }
      setAccount(acc as AffiliateAccount);

      const saved = localStorage.getItem(STORAGE_KEY) as ActiveMode | null;
      setActiveMode(saved === 'sales_rep' ? 'sales_rep' : 'influencer');

      const aid = (acc as AffiliateAccount).id;
      const [custR, compR, commR] = await Promise.all([
        (supabase as any).from('affiliate_customer_refs').select('id,created_at').eq('affiliate_id', aid).order('created_at', { ascending: false }),
        (supabase as any).from('affiliate_company_refs').select('id,partner_id,created_at').eq('affiliate_id', aid).order('created_at', { ascending: false }),
        (supabase as any).from('affiliate_commissions').select('id,commission_type,period_month,amount_base_czk,vat_rate,amount_total_czk,status,paid_at').eq('affiliate_id', aid).order('period_month', { ascending: false }),
      ]);

      setCustomerRefs((custR.data || []) as CustomerRef[]);
      setCompanyRefs((compR.data || []) as CompanyRef[]);
      setCommissions((commR.data || []) as CommissionRow[]);

      const partnerIds = (compR.data || []).map((r: CompanyRef) => r.partner_id).filter(Boolean);
      if (partnerIds.length > 0) {
        try {
          const { data: pData } = await supabase.from('partners').select('id,name,company_name').in('id', partnerIds);
          setPartnerNames((pData || []) as PartnerInfo[]);
        } catch { /* RLS — silently ignore */ }
      }
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se načíst data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleModeSwitch = (mode: ActiveMode) => {
    setActiveMode(mode); localStorage.setItem(STORAGE_KEY, mode);
  };
  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/'); };

  /* Guards */
  if (!user)    return <NavigateToLogin />;
  if (loading)  return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--neon-gold))]" /></div>;
  if (notAffiliate) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="luxury-card max-w-md w-full text-center p-8 space-y-4">
        <Megaphone className="w-12 h-12 mx-auto text-[hsl(var(--neon-gold)/0.5)]" />
        <h1 className="text-2xl font-bold text-[hsl(var(--heading-gold))]">Affiliate program</h1>
        <p className="text-[hsl(var(--text-muted-gray))] text-sm">Nemáte zatím affiliate účet.</p>
        <Button onClick={() => navigate('/affiliate/register')} className="bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold">Zaregistrovat se</Button>
      </div>
    </div>
  );

  const a = account!;
  if (a.status !== 'approved' && a.status !== 'suspended') {
    const b = <StatusBlock status={a.status} onLogout={handleLogout} />;
    if (b) return b;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://onemil.cz';
  const customerLink = `${origin}/?ref=${a.ref_code}`;
  const companyLink  = `${origin}/partner/register?via=${a.ref_code}`;

  const ago30 = subDays(new Date(), 30);
  const custToday     = customerRefs.filter(r => isToday(new Date(r.created_at))).length;
  const custThisMonth = customerRefs.filter(r => isThisMonth(new Date(r.created_at))).length;
  const cust30d       = customerRefs.filter(r => new Date(r.created_at) >= ago30).length;
  const compToday     = companyRefs.filter(r => isToday(new Date(r.created_at))).length;
  const comp30d       = companyRefs.filter(r => new Date(r.created_at) >= ago30).length;

  const totals = {
    calculated: commissions.filter(c => c.status === 'calculated').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    approved:   commissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    paid:       commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
  };
  const thisMonthPfx    = new Date().toISOString().slice(0, 7);
  const currentMonthCzk = commissions.filter(c => c.period_month?.startsWith(thisMonthPfx)).reduce((s, c) => s + Number(c.amount_total_czk || 0), 0);
  const totalEarnedCzk  = totals.paid + totals.approved + totals.calculated;

  const modeComm = commissions.filter(c =>
    activeMode === 'influencer' ? c.commission_type === 'customer_payments' : c.commission_type === 'company_invoice'
  );
  const partnerMap = new Map(partnerNames.map(p => [p.id, p]));

  // Profile data for AffiliateProfileSection
  // All profile columns available — migration applied on staging + production.
  const profileData: AffiliateProfileData = {
    id: a.id, name: a.name, email: a.email, phone: a.phone,
    vat_id: a.vat_id, ico: (a as any).ico,
    is_vat_payer: a.is_vat_payer,
    payout_account: a.payout_account, payout_bank: a.payout_bank,
    billing_street: (a as any).billing_street, billing_city: (a as any).billing_city,
    billing_zip: (a as any).billing_zip, billing_country: (a as any).billing_country,
    website_url: (a as any).website_url,
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--neon-gold)/0.25)] p-6 sm:p-8"
          style={{ background: 'linear-gradient(135deg, hsl(222 47% 8%) 0%, hsl(222 40% 12%) 50%, hsl(43 30% 12%) 100%)' }}>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, hsl(43 90% 55%), transparent 70%)' }} />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[hsl(var(--neon-gold)/0.4)] bg-[hsl(var(--neon-gold)/0.1)]">
                <Star className="w-3.5 h-3.5 text-[hsl(var(--neon-gold))]" />
                <span className="text-xs font-semibold tracking-wide uppercase text-[hsl(var(--neon-gold))]">Aktivní Affiliate partner</span>
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
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-heading-gold !text-[hsl(var(--heading-gold))]">Vydělávejte s OneMil</h1>
                <p className="text-sm text-[hsl(var(--text-muted-gray))] max-w-md">
                  {activeMode === 'influencer'
                    ? 'Sdílejte svůj Affiliate odkaz, přivádějte zákazníky a sledujte provize.'
                    : 'Doporučujte OneMil firmám, přivádějte partnery a získávejte provize z jejich fakturace.'}
                </p>
                <ModeSwitcher modes={a.modes} active={activeMode} onSwitch={handleModeSwitch} />
              </div>
              <div className="shrink-0 rounded-xl border border-[hsl(var(--neon-gold)/0.3)] bg-[hsl(var(--neon-gold)/0.08)] px-6 py-4 text-center sm:text-right">
                <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--neon-gold)/0.7)] mb-1">Tento měsíc</p>
                <p className="text-3xl font-extrabold tabular-nums text-[hsl(var(--neon-gold))]">
                  {currentMonthCzk.toLocaleString('cs-CZ')} <span className="text-lg">Kč</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {a.status === 'suspended' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">Váš účet je pozastaven. Kontaktujte podporu OneMil.</p>
          </div>
        )}

        {/* ══ STAT CARDS ════════════════════════════════════════════════════
            Both sections are available for every approved Affiliate account; modes are informational only. */}
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

        {/* ══ ODKAZ ═════════════════════════════════════════════════════════
            One ref_code powers both sections: /?ref=KOD and /partner/register?via=KOD. */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">
                {activeMode === 'influencer'
                  ? 'Váš Affiliate odkaz pro zákazníky'
                  : 'Váš odkaz pro firmy a e-shopy'}
              </h3>
            </div>
            <CopyInput
              value={activeMode === 'influencer' ? customerLink : companyLink}
              testId={activeMode === 'influencer' ? 'affiliate-customer-link' : 'affiliate-company-link'}
            />
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
                    ? 'Sdílejte tento odkaz. Zákazník, který se přes váš odkaz zaregistruje, zůstane vám přiřazen trvale (first-touch). Z jeho plateb budete dostávat provizi každý měsíc.'
                    : 'Sdílejte tento odkaz s firmami. Pokud se firma zaregistruje a admin ji schválí jako partnera, bude vám přiřazena. Z její fakturace OneMil budete dostávat provizi.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ══ VÝSLEDKY ══════════════════════════════════════════════════════ */}
        {activeMode === 'influencer' && (
          <div className="luxury-card overflow-hidden">
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Přivedení zákazníci</h3>
                <Badge className="bg-[hsl(var(--neon-gold)/0.15)] text-[hsl(var(--neon-gold))] border-[hsl(var(--neon-gold)/0.3)]">{customerRefs.length}</Badge>
              </div>
              {customerRefs[0] && (
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Poslední registrace: {format(new Date(customerRefs[0].created_at), 'd. MMMM yyyy', { locale: cs })}
                </p>
              )}
              {customerRefs.length === 0 && (
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Zatím nemáte žádné přivedené zákazníky.
                </p>
              )}
            </div>
          </div>
        )}

        {activeMode === 'sales_rep' && (
          <div className="luxury-card overflow-hidden">
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Moje firmy</h3>
                <Badge className="bg-[hsl(var(--neon-gold)/0.15)] text-[hsl(var(--neon-gold))] border-[hsl(var(--neon-gold)/0.3)]">{companyRefs.length}</Badge>
              </div>
              {companyRefs.length === 0 ? (
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                  Zatím nemáte žádné přivedené firmy.
                </p>
              ) : (
                <ul className="space-y-2" data-testid="company-list">
                  {companyRefs.map(cr => {
                    const p = partnerMap.get(cr.partner_id);
                    return (
                      <li key={cr.id} className="flex items-center gap-2 text-sm rounded-lg border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-3 py-2">
                        <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--text-muted-gray))] shrink-0" />
                        <span className="flex-1 text-[hsl(var(--text-silver))]">{p ? (p.company_name || p.name) : `Firma ${cr.partner_id.slice(0, 8)}…`}</span>
                        <span className="text-xs text-[hsl(var(--text-muted-gray))]">{format(new Date(cr.created_at), 'd. M. yyyy', { locale: cs })}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ══ PROVIZE ═══════════════════════════════════════════════════════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Provize a výplaty</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {totals.calculated > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Čeká na schválení</span>
                  <span className="text-base font-bold tabular-nums text-[hsl(var(--text-silver))]">{czk(totals.calculated)}</span>
                </div>
              )}
              {totals.approved > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--neon-gold)/0.2)] bg-[hsl(var(--neon-gold)/0.06)] px-4 py-3">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Schváleno — bude vyplaceno</span>
                  <span className="text-base font-bold tabular-nums text-[hsl(var(--neon-gold))]">{czk(totals.approved)}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                <span className="text-sm text-[hsl(var(--text-muted-gray))]">Celkem vyplaceno</span>
                <span className="text-base font-bold tabular-nums text-[hsl(var(--text-silver))]">{czk(totals.paid)}</span>
              </div>
            </div>

            {modeComm.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Banknote className="w-10 h-10 mx-auto text-[hsl(var(--text-muted-gray)/0.4)]" />
                <p className="text-sm text-[hsl(var(--text-muted-gray))]">Zatím žádné provize.</p>
                <p className="text-xs text-[hsl(var(--text-muted-gray)/0.6)] max-w-sm mx-auto">
                  Jakmile vznikne placená aktivita přivedených {activeMode === 'influencer' ? 'zákazníků' : 'firem'},
                  systém automaticky vypočítá vaši provizi. Admin ji zkontroluje, schválí a odešle platbu.
                </p>
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border border-[hsl(var(--border)/0.3)]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[hsl(var(--border)/0.3)] hover:bg-transparent">
                      <TableHead className="text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Měsíc</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Základ bez DPH</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">DPH</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Celkem</TableHead>
                      <TableHead className="text-right text-[hsl(var(--text-muted-gray))] text-xs uppercase tracking-wider">Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modeComm.map(c => (
                      <TableRow key={c.id} className="border-b border-[hsl(var(--border)/0.15)] hover:bg-[hsl(var(--muted)/0.2)]">
                        <TableCell className="font-medium text-[hsl(var(--text-silver))]">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-[hsl(var(--text-muted-gray))] shrink-0" />
                            {c.period_month ? format(new Date(c.period_month), 'LLLL yyyy', { locale: cs }) : '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-[hsl(var(--text-silver))]">{czk(c.amount_base_czk)}</TableCell>
                        <TableCell className="text-right tabular-nums text-[hsl(var(--text-muted-gray))]">{c.vat_rate ? `${c.vat_rate} %` : '—'}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-[hsl(var(--text-silver))]">{czk(c.amount_total_czk)}</TableCell>
                        <TableCell className="text-right">{commStatusBadge(c.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* ══ KAMPANĚ ═══════════════════════════════════════════════════════ */}
        <div className="luxury-card overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Affiliate kampaně</h3>
            </div>
            <div className="text-center py-8 space-y-2">
              <Zap className="w-10 h-10 mx-auto text-[hsl(var(--neon-gold)/0.3)]" />
              <p className="text-sm text-[hsl(var(--text-muted-gray))]">Kampaně pro Affiliate v2 budou dostupné brzy.</p>
              <p className="text-xs text-[hsl(var(--text-muted-gray)/0.6)]">Speciální odměny za přivedené zákazníky a firmy v rámci kampaní OneMil.</p>
            </div>
          </div>
        </div>

        {/* ══ PRAVIDLA (Influencer) ═════════════════════════════════════════ */}
        {activeMode === 'influencer' && <InfluencerRules />}

        {/* ══ PROFIL A VÝPLATNÍ ÚDAJE ═══════════════════════════════════════ */}
        <AffiliateProfileSection profile={profileData} onSaved={load} />

        {/* ══ PODMÍNKY SPOLUPRÁCE ═══════════════════════════════════════════ */}
        {user && <InfluencerTermsSection partnerId={a.id} onAccepted={load} />}

        {/* ══ FOOTER ════════════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-5 py-4 text-sm text-[hsl(var(--text-muted-gray))]">
          <span>Doporučovací kód: <span className="font-mono font-semibold text-[hsl(var(--text-silver))]">{a.ref_code}</span></span>
          <span>Sazba zákazníci: <strong className="text-[hsl(var(--text-silver))]">{a.commission_rate_customer} %</strong> · Firmy: <strong className="text-[hsl(var(--text-silver))]">{a.commission_rate_company} %</strong> {a.is_vat_payer ? '· plátce DPH' : '· neplátce DPH'}</span>
        </div>

      </div>
    </div>
  );
};

export default AffiliateDashboard;
