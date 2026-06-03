/**
 * AFFILIATE v2 — uživatelský dashboard (/affiliate/dashboard).
 * Zobrazuje: stav účtu, statistiky, sdílecí odkazy, výsledky, provize.
 * Pouze čtení. Zápisy jen přes RLS-chráněné RPC (provize schvaluje admin).
 *
 * Data zdroje:
 *  - affiliate_accounts      WHERE auth_user_id = uid()
 *  - affiliate_customer_refs WHERE affiliate_id = account.id
 *  - affiliate_company_refs  WHERE affiliate_id = account.id
 *  - partners                WHERE id IN (company_ref.partner_id...)  [graceful fallback]
 *  - affiliate_commissions   WHERE affiliate_id = account.id
 *
 * Bezpečnost: Affiliate vidí jen vlastní data přes RLS.
 * Nepoužívá se service role ani admin-only zápisy.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Copy, Megaphone, Briefcase, Loader2, LogOut,
  Users, Building2, TrendingUp, CheckCircle, Banknote,
  Share2, QrCode, Info, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

/* ── Types ─────────────────────────────────────────────────────────────────── */

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

interface CustomerRef {
  id: string;
  created_at: string;
}

interface CompanyRef {
  id: string;
  partner_id: string;
  created_at: string;
}

interface PartnerInfo {
  id: string;
  name: string;
  company_name: string | null;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const czk = (n: number) =>
  `${(n ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč`;

function accountStatusBadge(status: string) {
  switch (status) {
    case 'approved':  return <Badge className="bg-green-600/20 text-green-400 border-green-600/30">Aktivní</Badge>;
    case 'pending':   return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">Čeká na schválení</Badge>;
    case 'rejected':  return <Badge variant="destructive">Zamítnutý</Badge>;
    case 'suspended': return <Badge variant="outline" className="text-muted-foreground">Pozastavený</Badge>;
    default:          return <Badge variant="outline">{status}</Badge>;
  }
}

function commissionStatusBadge(status: string) {
  switch (status) {
    case 'calculated': return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-xs">Vypočteno</Badge>;
    case 'approved':   return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">Schváleno</Badge>;
    case 'paid':       return <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-xs">Vyplaceno</Badge>;
    default:           return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function QrImage({ url }: { url: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(url)}`;
  return (
    <img
      src={src}
      alt="QR kód"
      className="rounded-lg border border-white/10 w-[140px] h-[140px] bg-white"
    />
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} zkopírován`),
      () => toast.error('Nepodařilo se zkopírovat')
    );
  };
  return (
    <div className="flex gap-2 items-center">
      <code
        data-testid={`affiliate-link-${label.toLowerCase().replace(/\s/g, '-')}`}
        className="flex-1 text-xs bg-[#1D2128] border border-white/10 rounded-lg px-3 py-2.5 overflow-x-auto text-[#BFC6CF] select-all font-mono"
      >
        {value}
      </code>
      <Button
        variant="outline"
        size="icon"
        onClick={copy}
        title={`Kopírovat ${label}`}
        className="shrink-0 border-white/15 hover:border-[#FF8A00]/50 hover:text-[#FF8A00]"
      >
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  value,
  label,
  accent = false,
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <Card className="bg-[#101722] border-white/10">
      <CardContent className="py-4 flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${accent ? 'bg-[#FF8A00]/15' : 'bg-white/5'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-[#FF8A00]' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-[#FF8A00]' : 'text-foreground'}`}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

const AffiliateDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [account, setAccount]           = useState<AffiliateAccount | null>(null);
  const [commissions, setCommissions]   = useState<CommissionRow[]>([]);
  const [customerRefs, setCustomerRefs] = useState<CustomerRef[]>([]);
  const [companyRefs, setCompanyRefs]   = useState<CompanyRef[]>([]);
  const [partnerNames, setPartnerNames] = useState<PartnerInfo[]>([]);
  const [loading, setLoading]           = useState(true);
  const [notAffiliate, setNotAffiliate] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1. Affiliate account
      const { data: acc, error: accErr } = await (supabase as any)
        .from('affiliate_accounts')
        .select('id, name, email, ref_code, modes, status, commission_rate_customer, commission_rate_company, is_vat_payer')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (accErr) throw accErr;
      if (!acc) { setNotAffiliate(true); setLoading(false); return; }
      setAccount(acc as AffiliateAccount);

      const affiliateId = (acc as AffiliateAccount).id;

      // 2–4: load in parallel
      const [custResult, compResult, commResult] = await Promise.all([
        (supabase as any)
          .from('affiliate_customer_refs')
          .select('id, created_at')
          .eq('affiliate_id', affiliateId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('affiliate_company_refs')
          .select('id, partner_id, created_at')
          .eq('affiliate_id', affiliateId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('affiliate_commissions')
          .select('id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status, paid_at')
          .eq('affiliate_id', affiliateId)
          .order('period_month', { ascending: false }),
      ]);

      if (custResult.error) console.warn('customer_refs load:', custResult.error.message);
      if (compResult.error) console.warn('company_refs load:', compResult.error.message);
      if (commResult.error) console.warn('commissions load:', commResult.error.message);

      setCustomerRefs((custResult.data || []) as CustomerRef[]);
      setCompanyRefs((compResult.data || []) as CompanyRef[]);
      setCommissions((commResult.data || []) as CommissionRow[]);

      // 5. Try to fetch partner names (graceful — might be blocked by RLS)
      const partnerIds = (compResult.data || []).map((r: CompanyRef) => r.partner_id).filter(Boolean);
      if (partnerIds.length > 0) {
        try {
          const { data: pData } = await supabase
            .from('partners')
            .select('id, name, company_name')
            .in('id', partnerIds);
          setPartnerNames((pData || []) as PartnerInfo[]);
        } catch {
          // RLS blocks — silently fallback to count only
        }
      }
    } catch (err: any) {
      console.error('Affiliate dashboard load error:', err);
      toast.error(err.message || 'Nepodařilo se načíst affiliate data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate('/login'); };

  /* ── Guards ─────────────────────────────────────────────────────────────── */

  if (!user) return <NavigateToLogin />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF8A00]" />
      </div>
    );
  }

  if (notAffiliate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0B0F] px-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-[#FF8A00]/15 flex items-center justify-center mx-auto">
            <Share2 className="w-8 h-8 text-[#FF8A00]" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Affiliate program</h1>
          <p className="text-muted-foreground">
            Nemáte zatím affiliate účet. Zaregistrujte se a začněte vydělávat provize.
          </p>
          <Button
            onClick={() => navigate('/affiliate/register')}
            className="bg-[#FF8A00] hover:bg-[#FFB547] text-black font-semibold"
          >
            Zaregistrovat se do Affiliate programu
          </Button>
        </div>
      </div>
    );
  }

  const a = account!;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://onemil.cz';
  const customerLink = `${origin}/?ref=${a.ref_code}`;
  const companyLink  = `${origin}/partner/register?via=${a.ref_code}`;

  const isInfluencer = a.modes?.includes('influencer');
  const isSalesRep   = a.modes?.includes('sales_rep');

  const totals = {
    calculated: commissions.filter(c => c.status === 'calculated').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    approved:   commissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    paid:       commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
  };

  // Partner lookup map
  const partnerMap = new Map(partnerNames.map(p => [p.id, p]));

  return (
    <div className="min-h-screen bg-[#0A0B0F]">
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Affiliate účet</p>
            <h1 className="text-2xl font-bold text-foreground" data-testid="affiliate-dashboard-heading">
              {a.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {accountStatusBadge(a.status)}
              {isInfluencer && (
                <Badge variant="outline" className="border-[#FF8A00]/40 text-[#FF8A00] text-xs">
                  <Megaphone className="w-3 h-3 mr-1" />Influencer
                </Badge>
              )}
              {isSalesRep && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs">
                  <Briefcase className="w-3 h-3 mr-1" />Obchodník
                </Badge>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}
            className="border-white/15 text-muted-foreground hover:text-foreground shrink-0">
            <LogOut className="w-4 h-4 mr-2" />Odhlásit
          </Button>
        </div>

        {/* Pending/rejected warning banner */}
        {a.status !== 'approved' && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">
                {a.status === 'pending'
                  ? 'Váš účet čeká na schválení administrátorem. Odkazy můžete sdílet, ale provize se budou počítat po schválení.'
                  : a.status === 'rejected'
                    ? 'Váš účet byl zamítnut. Kontaktujte podporu OneMil.'
                    : 'Váš účet je pozastaven. Kontaktujte podporu OneMil.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Statistiky ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Statistiky</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              icon={Users}
              value={customerRefs.length}
              label="Přivedení zákazníci"
              accent={customerRefs.length > 0}
            />
            <StatCard
              icon={Building2}
              value={companyRefs.length}
              label="Přivedené firmy"
              accent={companyRefs.length > 0}
            />
            <StatCard
              icon={TrendingUp}
              value={czk(totals.calculated)}
              label="Vypočteno"
            />
            <StatCard
              icon={CheckCircle}
              value={czk(totals.approved)}
              label="Schváleno"
              accent={totals.approved > 0}
            />
            <StatCard
              icon={Banknote}
              value={czk(totals.paid)}
              label="Vyplaceno"
            />
          </div>
        </div>

        {/* ── Sdílecí odkazy ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Odkaz pro zákazníky */}
          {isInfluencer && (
            <Card className="bg-[#101722] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FF8A00]/15 flex items-center justify-center">
                    <Users className="w-4 h-4 text-[#FF8A00]" />
                  </div>
                  Odkaz pro zákazníky
                </CardTitle>
                <CardDescription className="text-xs">
                  Když se zákazník zaregistruje přes tento odkaz, zůstane vám přiřazen trvale (first-touch).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CopyField value={customerLink} label="odkaz pro zákazníky" />
                <div className="flex justify-center">
                  <QrImage url={customerLink} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Odkaz pro firmy */}
          {isSalesRep && (
            <Card className="bg-[#101722] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-amber-400" />
                  </div>
                  Odkaz pro firmy
                </CardTitle>
                <CardDescription className="text-xs">
                  Když se firma zaregistruje přes tento odkaz a admin ji schválí, bude vám přiřazena trvale.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CopyField value={companyLink} label="odkaz pro firmy" />
                <div className="flex justify-center">
                  <QrImage url={companyLink} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Moje výsledky ──────────────────────────────────────────────── */}
        {(customerRefs.length > 0 || companyRefs.length > 0) && (
          <Card className="bg-[#101722] border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Moje výsledky</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Přivedení zákazníci */}
              {isInfluencer && customerRefs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#FF8A00]" />
                    <span className="text-sm font-medium">
                      Přivedení zákazníci: <strong className="text-[#FF8A00]">{customerRefs.length}</strong>
                    </span>
                  </div>
                  {customerRefs[0] && (
                    <p className="text-xs text-muted-foreground pl-6">
                      Poslední přiřazení:{' '}
                      {format(new Date(customerRefs[0].created_at), 'd. MMMM yyyy', { locale: cs })}
                    </p>
                  )}
                </div>
              )}

              {/* Přivedené firmy */}
              {isSalesRep && companyRefs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium">
                      Přivedené firmy: <strong className="text-amber-400">{companyRefs.length}</strong>
                    </span>
                  </div>
                  {partnerNames.length > 0 ? (
                    <ul className="space-y-1 pl-6">
                      {companyRefs.map(cr => {
                        const p = partnerMap.get(cr.partner_id);
                        return (
                          <li key={cr.id} className="flex items-center gap-2 text-sm">
                            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-foreground">
                              {p ? (p.company_name || p.name) : '—'}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {format(new Date(cr.created_at), 'd. M. yyyy', { locale: cs })}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground pl-6">
                      Poslední přiřazení:{' '}
                      {companyRefs[0] ? format(new Date(companyRefs[0].created_at), 'd. MMMM yyyy', { locale: cs }) : '—'}
                    </p>
                  )}
                </div>
              )}

            </CardContent>
          </Card>
        )}

        {/* ── Provize ────────────────────────────────────────────────────── */}
        <Card className="bg-[#101722] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="w-4 h-4 text-muted-foreground" />
              Provize
            </CardTitle>
            <CardDescription className="text-xs">
              Sazby: zákazníci {a.commission_rate_customer} % · firmy {a.commission_rate_company} %
              {a.is_vat_payer ? ' · plátce DPH (základ + 21 %)' : ' · neplátce DPH'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {commissions.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                  <TrendingUp className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Zatím nemáte žádné provize.
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Jakmile se přes váš odkaz zaregistrují zákazníci nebo firmy a vznikne placená aktivita,
                  provize se zobrazí tady.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-xs">Měsíc</TableHead>
                      <TableHead className="text-xs">Typ</TableHead>
                      <TableHead className="text-right text-xs">Základ</TableHead>
                      <TableHead className="text-right text-xs">DPH</TableHead>
                      <TableHead className="text-right text-xs">Celkem</TableHead>
                      <TableHead className="text-xs">Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map(c => (
                      <TableRow key={c.id} className="border-white/5">
                        <TableCell className="text-sm">
                          {c.period_month
                            ? format(new Date(c.period_month), 'LLLL yyyy', { locale: cs })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.commission_type === 'customer_payments' ? 'Zákazníci' : 'Firmy'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {czk(c.amount_base_czk)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {c.vat_rate ? `${c.vat_rate} %` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">
                          {czk(c.amount_total_czk)}
                        </TableCell>
                        <TableCell>{commissionStatusBadge(c.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Jak to funguje ─────────────────────────────────────────────── */}
        <Card className="bg-[#101722] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="w-4 h-4 text-muted-foreground" />
              Jak to funguje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {[
                'Sdílejte svůj odkaz zákazníkům nebo firmám.',
                'Zákazník nebo firma se zaregistruje v OneMil přes váš odkaz.',
                'OneMil přiřadí registraci k vašemu účtu (first-touch, trvalé).',
                'Na konci každého měsíce systém vypočítá vaši provizi z aktivit přivedených zákazníků a firem.',
                'Administrátor provizi zkontroluje, schválí a označí k výplatě.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#FF8A00]/15 text-[#FF8A00] text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Ref kód (footer) */}
        <p className="text-xs text-center text-muted-foreground/50 pb-4">
          Váš doporučovací kód:{' '}
          <span className="font-mono text-muted-foreground">{a.ref_code}</span>
        </p>

      </div>
    </div>
  );
};

export default AffiliateDashboard;
