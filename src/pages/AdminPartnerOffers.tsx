import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, Tag, CheckCircle, XCircle, Clock, ExternalLink,
  Image as ImageIcon, Calendar, Layers, Coins, ShieldAlert, BarChart2,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface PendingOffer {
  id: string;
  title: string;
  short_text: string;
  deployment_mode: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  link_or_code: string | null;
  logo_url: string | null;
  banner_url: string | null;
  submitted_at: string | null;
  created_at: string;
  billing_mode: string;
  price_per_activation: number;
  billing_admin_override: boolean;
  partners: {
    name: string;
    company_name: string | null;
  } | null;
}

const AdminPartnerOffers: React.FC = () => {
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  // per-offer reject form state
  const [rejectOpenId, setRejectOpenId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  // per-offer admin billing override toggle
  const [billingOverrides, setBillingOverrides] = useState<Record<string, boolean>>({});

  // ── Per-offer performance stats ───────────────────────────────────────────
  interface OfferStat {
    offer_id: string;
    title: string;
    activations: number;
    clicks: number;
    conversion: string;
  }
  const [offerStats, setOfferStats] = useState<OfferStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadOfferStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [activRes, clickRes, offersRes] = await Promise.all([
        supabase.from('partner_offer_activations').select('offer_id'),
        supabase.from('partner_offer_clicks').select('offer_id'),
        supabase.from('partner_offers').select('id, title').eq('status', 'approved'),
      ]);

      const acts = activRes.data ?? [];
      const clicks = clickRes.data ?? [];
      const offers = offersRes.data ?? [];

      const actMap: Record<string, number> = {};
      acts.forEach((r) => { actMap[r.offer_id] = (actMap[r.offer_id] ?? 0) + 1; });

      const clkMap: Record<string, number> = {};
      clicks.forEach((r) => { clkMap[r.offer_id] = (clkMap[r.offer_id] ?? 0) + 1; });

      const stats: OfferStat[] = offers.map((o) => {
        const a = actMap[o.id] ?? 0;
        const c = clkMap[o.id] ?? 0;
        return {
          offer_id: o.id,
          title: o.title,
          activations: a,
          clicks: c,
          conversion: c > 0 ? ((a / c) * 100).toFixed(1) + ' %' : '—',
        };
      });
      stats.sort((a, b) => b.activations - a.activations);
      setOfferStats(stats);
    } catch (err) {
      console.error('Error loading offer stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadOffers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('partner_offers')
        .select(`
          id, title, short_text, deployment_mode, status,
          valid_from, valid_to, link_or_code,
          logo_url, banner_url,
          submitted_at, created_at,
          billing_mode, price_per_activation, billing_admin_override,
          partners (name, company_name)
        `)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      const mapped = (data || []).map((d: any) => ({
        ...d,
        partners: Array.isArray(d.partners) ? d.partners[0] ?? null : d.partners ?? null,
      }));
      setOffers(mapped as PendingOffer[]);
    } catch (err) {
      console.error('Error loading pending offers:', err);
      toast.error('Nepodařilo se načíst nabídky ke schválení');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOffers();
    loadOfferStats();
    const channel = supabase
      .channel('admin-pending-offers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_offers' }, loadOffers)
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [loadOffers, loadOfferStats]);

  const handleApprove = async (offerId: string) => {
    setApprovingId(offerId);
    const applyOverride = !!billingOverrides[offerId];
    try {
      const { error } = await supabase
        .from('partner_offers')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(applyOverride ? { billing_mode: 'free', billing_admin_override: true } : {}),
        })
        .eq('id', offerId);
      if (error) throw error;
      toast.success(applyOverride ? 'Nabídka schválena se zdarma overridem' : 'Nabídka byla schválena');
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
      setBillingOverrides((prev) => { const n = { ...prev }; delete n[offerId]; return n; });
    } catch (err) {
      console.error('Error approving offer:', err);
      toast.error('Nepodařilo se schválit nabídku');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (offerId: string) => {
    if (!rejectionReason.trim()) {
      toast.error('Zadejte důvod zamítnutí');
      return;
    }
    setRejectingId(offerId);
    try {
      const { error } = await supabase
        .from('partner_offers')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectionReason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', offerId);
      if (error) throw error;
      toast.success('Nabídka byla zamítnuta');
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
      setRejectOpenId(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Error rejecting offer:', err);
      toast.error('Nepodařilo se zamítnout nabídku');
    } finally {
      setRejectingId(null);
    }
  };

  const openRejectForm = (offerId: string) => {
    setRejectOpenId(offerId);
    setRejectionReason('');
  };

  const getDeploymentLabel = (mode: string) => {
    switch (mode) {
      case 'all_contests': return 'Všechny soutěže';
      case 'selected_contests': return 'Vybrané soutěže';
      default: return mode;
    }
  };

  const getBillingLabel = (mode: string) => {
    switch (mode) {
      case 'paid_distribution': return 'Placená distribuce';
      case 'free':              return 'Zdarma';
      case 'affiliate_direct':  return 'Affiliate přímý';
      case 'affiliate_external':return 'Affiliate externí';
      case 'hybrid':            return 'Hybrid';
      default: return mode;
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'd. M. yyyy', { locale: cs }); } catch { return d; }
  };

  return (
    <main className="container mx-auto px-4 max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold flex items-center gap-2">
            <Tag className="w-6 h-6 text-blue-400" />
            Schvalování nabídek partnerů
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Nabídky odeslané ke schválení. Schválené budou automaticky přidělovány uživatelům po nákupu tiketu.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadOffers} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Obnovit'}
        </Button>
      </div>

      {/* ── Per-offer performance stats ── */}
      <Card className="border-border/40 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-400" />
            Výkon nabídek (schválené)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {statsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : offerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-4">Žádné schválené nabídky.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/10 hover:bg-transparent">
                  <TableHead>Nabídka</TableHead>
                  <TableHead className="text-center">Aktivace</TableHead>
                  <TableHead className="text-center">Kliky</TableHead>
                  <TableHead className="text-center">Konverze</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offerStats.map((s) => (
                  <TableRow key={s.offer_id} className="border-b border-white/5 hover:bg-white/5">
                    <TableCell className="text-sm font-medium max-w-[260px] truncate">{s.title}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.activations}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.clicks}</TableCell>
                    <TableCell className="text-center tabular-nums text-blue-400">{s.conversion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : offers.length === 0 ? (
        <Card className="border-border/40 bg-card/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="w-10 h-10 text-green-500/50 mb-3" />
            <p className="text-foreground font-medium">Žádné nabídky ke schválení</p>
            <p className="text-muted-foreground text-sm mt-1">Všechny nabídky jsou vyřízeny.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => {
            const partnerName = offer.partners?.company_name ?? offer.partners?.name ?? 'Neznámý partner';
            const isApproving = approvingId === offer.id;
            const isRejecting = rejectingId === offer.id;
            const rejectOpen = rejectOpenId === offer.id;

            return (
              <Card key={offer.id} className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
                {/* Banner preview */}
                {offer.banner_url && (
                  <div className="w-full h-28 bg-muted/30 overflow-hidden">
                    <img
                      src={offer.banner_url}
                      alt="Banner"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}

                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    {/* Logo */}
                    {offer.logo_url ? (
                      <img
                        src={offer.logo_url}
                        alt="Logo"
                        className="w-12 h-12 rounded-lg object-cover border border-border/50 bg-muted/30 shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-border/40 bg-muted/30 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[11px]">
                          <Clock className="w-3 h-3 mr-1" />
                          Ke schválení
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Partner: <strong className="text-foreground">{partnerName}</strong>
                        </span>
                        {offer.submitted_at && (
                          <span className="text-xs text-muted-foreground">
                            Odesláno {formatDate(offer.submitted_at)}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-base mt-1">{offer.title}</CardTitle>
                      <CardDescription className="mt-0.5 line-clamp-2">{offer.short_text}</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      {getDeploymentLabel(offer.deployment_mode)}
                    </span>
                    {(offer.valid_from || offer.valid_to) && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(offer.valid_from)} – {formatDate(offer.valid_to)}
                      </span>
                    )}
                    {offer.link_or_code && (
                      <span className="flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded">{offer.link_or_code}</span>
                      </span>
                    )}
                  </div>

                  {/* Billing info + admin override */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 rounded-lg border border-border/30 bg-muted/20 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Coins className="w-3.5 h-3.5 shrink-0" />
                      <span>Typ spolupráce:</span>
                      <strong className="text-foreground">{getBillingLabel(offer.billing_mode)}</strong>
                      {offer.billing_mode !== 'free' && offer.price_per_activation > 0 && (
                        <span className="text-muted-foreground">— {offer.price_per_activation} Kč/aktivaci</span>
                      )}
                      {offer.billing_admin_override && (
                        <Badge className="ml-1 bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                          <ShieldAlert className="w-2.5 h-2.5 mr-0.5" />override adminem
                        </Badge>
                      )}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer ml-auto select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-amber-500 cursor-pointer"
                        checked={!!billingOverrides[offer.id]}
                        onChange={(e) =>
                          setBillingOverrides((prev) => ({ ...prev, [offer.id]: e.target.checked }))
                        }
                      />
                      <span className="text-amber-600 font-medium">Zdarma (override adminem)</span>
                    </label>
                  </div>

                  {/* Reject form (inline) */}
                  {rejectOpen && (
                    <div className="space-y-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                      <Label htmlFor={`reject-reason-${offer.id}`} className="text-sm text-destructive font-medium">
                        Důvod zamítnutí (partner ho uvidí)
                      </Label>
                      <Textarea
                        id={`reject-reason-${offer.id}`}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Popište, proč nabídka nesplňuje podmínky a co partner musí opravit…"
                        rows={3}
                        maxLength={500}
                        className="text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setRejectOpenId(null); setRejectionReason(''); }}
                          disabled={isRejecting}
                        >
                          Zrušit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleReject(offer.id)}
                          disabled={isRejecting || !rejectionReason.trim()}
                        >
                          {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                          Potvrdit zamítnutí
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!rejectOpen && (
                    <div className="flex gap-2 justify-end pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => openRejectForm(offer.id)}
                        disabled={isApproving}
                      >
                        <XCircle className="w-4 h-4 mr-1.5" />
                        Zamítnout
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApprove(offer.id)}
                        disabled={isApproving}
                      >
                        {isApproving ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                        )}
                        Schválit
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
};

export default AdminPartnerOffers;
