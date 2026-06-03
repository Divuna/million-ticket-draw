/**
 * AFFILIATE v2 — user dashboard (/affiliate/dashboard).
 * Shows the logged-in user's affiliate account (RLS: own rows only):
 * ref_code, share links, modes, and commissions from affiliate_commissions.
 * Read-only. No payout execution yet. Separate from Partner portal & legacy
 * influencer dashboard.
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
import { Copy, Megaphone, Briefcase, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

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

const czk = (n: number) => `${(n ?? 0).toLocaleString('cs-CZ')} Kč`;

function statusBadge(s: string) {
  switch (s) {
    case 'calculated': return <Badge variant="warning">Vypočteno</Badge>;
    case 'approved':   return <Badge variant="success">Schváleno</Badge>;
    case 'paid':       return <Badge variant="info">Vyplaceno</Badge>;
    default:           return <Badge variant="outline">{s}</Badge>;
  }
}

const AffiliateDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState<AffiliateAccount | null>(null);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAffiliate, setNotAffiliate] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: acc, error: accErr } = await (supabase as any)
        .from('affiliate_accounts')
        .select('id, name, email, ref_code, modes, status, commission_rate_customer, commission_rate_company, is_vat_payer')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (accErr) throw accErr;
      if (!acc) { setNotAffiliate(true); setLoading(false); return; }
      setAccount(acc as AffiliateAccount);

      const { data: comm, error: commErr } = await (supabase as any)
        .from('affiliate_commissions')
        .select('id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status, paid_at')
        .eq('affiliate_id', (acc as any).id)
        .order('period_month', { ascending: false });
      if (commErr) throw commErr;
      setCommissions((comm || []) as CommissionRow[]);
    } catch (err: any) {
      console.error('Affiliate dashboard load error:', err);
      toast.error(err.message || 'Nepodařilo se načíst affiliate data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success('Zkopírováno'),
      () => toast.error('Nepodařilo se zkopírovat')
    );
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate('/login'); };

  if (!user) return <NavigateToLogin />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notAffiliate) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-lg text-center space-y-4">
        <h1 className="text-2xl font-bold">Affiliate program</h1>
        <p className="text-muted-foreground">Nemáte zatím affiliate účet.</p>
        <Button onClick={() => navigate('/affiliate/register')}>Zaregistrovat se do Affiliate programu</Button>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://onemil.cz';
  const customerLink = `${origin}/?ref=${account!.ref_code}`;
  const companyLink = `${origin}/partner/register?via=${account!.ref_code}`;

  const totals = {
    calculated: commissions.filter(c => c.status === 'calculated').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    approved:   commissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
    paid:       commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount_total_czk || 0), 0),
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Affiliate dashboard</h1>
          <p className="text-sm text-muted-foreground">{account!.name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> Odhlásit
        </Button>
      </div>

      {account!.status !== 'approved' && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm">
            Váš účet je ve stavu <strong>{account!.status === 'pending' ? 'čeká na schválení' : account!.status}</strong>.
            Odkazy můžete sdílet, ale provize se počítají po schválení.
          </CardContent>
        </Card>
      )}

      {/* Account + modes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">Váš účet</CardTitle>
          <CardDescription>
            Sazby: zákazníci {account!.commission_rate_customer} % · firmy {account!.commission_rate_company} %
            {account!.is_vat_payer ? ' · plátce DPH' : ' · neplátce DPH'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Režimy:</span>
            {account!.modes?.includes('influencer') && (
              <Badge variant="outline"><Megaphone className="w-3 h-3 mr-1" />Influencer</Badge>
            )}
            {account!.modes?.includes('sales_rep') && (
              <Badge variant="outline"><Briefcase className="w-3 h-3 mr-1" />Obchodník</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Doporučovací kód:</span>
            <span className="font-mono font-semibold">{account!.ref_code}</span>
          </div>

          {/* Share links */}
          {account!.modes?.includes('influencer') && (
            <div className="space-y-1">
              <Label>Odkaz pro zákazníky</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted rounded px-3 py-2 overflow-x-auto">{customerLink}</code>
                <Button variant="outline" size="icon" onClick={() => copy(customerLink)}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
          {account!.modes?.includes('sales_rep') && (
            <div className="space-y-1">
              <Label>Odkaz pro firmy / e-shopy</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted rounded px-3 py-2 overflow-x-auto">{companyLink}</code>
                <Button variant="outline" size="icon" onClick={() => copy(companyLink)}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="py-4">
          <p className="text-xl font-bold tabular-nums text-amber-600">{czk(totals.calculated)}</p>
          <p className="text-xs text-muted-foreground">Vypočteno</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-xl font-bold tabular-nums text-green-600">{czk(totals.approved)}</p>
          <p className="text-xs text-muted-foreground">Schváleno</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-xl font-bold tabular-nums">{czk(totals.paid)}</p>
          <p className="text-xs text-muted-foreground">Vyplaceno</p>
        </CardContent></Card>
      </div>

      {/* Commission list */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Provize</CardTitle></CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Zatím žádné provize.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Měsíc</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead className="text-right">Základ</TableHead>
                    <TableHead className="text-right">DPH</TableHead>
                    <TableHead className="text-right">Celkem</TableHead>
                    <TableHead>Stav</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">
                        {c.period_month ? format(new Date(c.period_month), 'LLLL yyyy', { locale: cs }) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.commission_type === 'customer_payments' ? 'Zákazníci' : 'Firmy'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{czk(c.amount_base_czk)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.vat_rate ? `${c.vat_rate} %` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{czk(c.amount_total_czk)}</TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// local Label (avoid extra import churn)
const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ children, ...p }) => (
  <label className="text-sm text-muted-foreground" {...p}>{children}</label>
);

export default AffiliateDashboard;
