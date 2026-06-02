/**
 * INFLUENCER SYSTEM (Admin) — Monetary CZK payouts, invoiced, admin-controlled.
 * Manages influencer accounts via `partners` table (filtered by 'influencer' in notes).
 * ⚠️  Intentionally separate from the Player referral system (AdminReferrals.tsx).
 * These two systems MUST NEVER be merged or unified.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Eye,
  Users,
  Globe,
  Mail,
  Phone,
  RefreshCw,
  ChevronDown,
  Instagram,
  Youtube,
  Facebook,
  Banknote,
  Megaphone,
  UserCheck,
  CreditCard,
  MessageCircle,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";

/* ===================== TYPES ===================== */

type InfluencerStatus = "pending" | "approved" | "rejected";

interface Influencer {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string | null;
  website_url: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: InfluencerStatus;
  payout_ready: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  auth_user_id: string | null;
  referral_count: number;
  total_commissions_czk: number;
  commissions_paid_czk: number;
  commissions_pending_czk: number;
  valid_referrals: number;
  paid_referrals: number;
}

interface DetailReferral {
  id: string;
  user_id: string;
  created_at: string;
}

interface DetailCommission {
  id: string;
  period_month: string;
  amount_czk: number;
  status: string;
  updated_at: string;
}

interface DetailCampaign {
  id: string;
  name: string;
  bonus_czk_per_new_user: number;
  bonus_mc_for_user: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
}

interface DetailData {
  validReferrals: DetailReferral[];
  paidReferrals: DetailReferral[];
  commissions: DetailCommission[];
  campaigns: DetailCampaign[];
}

const statusLabels: Record<InfluencerStatus, string> = {
  pending: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
};

const statusColors: Record<InfluencerStatus, "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

const statusIcons: Record<InfluencerStatus, React.ElementType> = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
};

const commissionStatusLabels: Record<string, string> = {
  calculated: "Vypočteno",
  approved: "Schváleno",
  paid: "Vyplaceno",
};

/* ===================== COMPONENT ===================== */

const AdminInfluencers = () => {
  const { loading: roleLoading, isAdmin } = useUserRole();
  const navigate = useNavigate();

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ===================== DATA ===================== */

  const fetchInfluencers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, company_name, logo_url, website_url, contact_email, contact_phone, status, payout_ready, notes, created_at, updated_at, auth_user_id")
        .ilike("notes", "%influencer%")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const partnerIds = (data || []).map((p) => p.id);

      if (partnerIds.length === 0) {
        setInfluencers([]);
        setLoading(false);
        return;
      }

      // Fetch referral counts, commission aggregates, and view counts in parallel
      const [referralsRes, commissionsRes, validRes, paidRes] = await Promise.all([
        supabase
          .from("influencer_referrals")
          .select("influencer_partner_id")
          .in("influencer_partner_id", partnerIds),
        supabase
          .from("influencer_commissions")
          .select("influencer_partner_id, amount_czk, status")
          .in("influencer_partner_id", partnerIds),
        supabase
          .from("v_influencer_referrals_valid" as any)
          .select("influencer_partner_id")
          .in("influencer_partner_id", partnerIds),
        supabase
          .from("v_influencer_referrals_paid" as any)
          .select("influencer_partner_id")
          .in("influencer_partner_id", partnerIds),
      ]);

      // Build referral count map
      const referralCountMap = new Map<string, number>();
      for (const r of referralsRes.data || []) {
        referralCountMap.set(r.influencer_partner_id, (referralCountMap.get(r.influencer_partner_id) || 0) + 1);
      }

      // Build commission aggregates map
      const commTotalMap = new Map<string, number>();
      const commPaidMap = new Map<string, number>();
      const commPendingMap = new Map<string, number>();
      for (const c of commissionsRes.data || []) {
        const amt = Number(c.amount_czk);
        commTotalMap.set(c.influencer_partner_id, (commTotalMap.get(c.influencer_partner_id) || 0) + amt);
        if (c.status === "paid") {
          commPaidMap.set(c.influencer_partner_id, (commPaidMap.get(c.influencer_partner_id) || 0) + amt);
        } else {
          commPendingMap.set(c.influencer_partner_id, (commPendingMap.get(c.influencer_partner_id) || 0) + amt);
        }
      }

      // Build valid/paid referral count maps
      const validCountMap = new Map<string, number>();
      for (const r of (validRes.data || []) as any[]) {
        validCountMap.set(r.influencer_partner_id, (validCountMap.get(r.influencer_partner_id) || 0) + 1);
      }
      const paidCountMap = new Map<string, number>();
      for (const r of (paidRes.data || []) as any[]) {
        paidCountMap.set(r.influencer_partner_id, (paidCountMap.get(r.influencer_partner_id) || 0) + 1);
      }

      const enriched: Influencer[] = (data || []).map((p) => ({
        ...p,
        status: p.status as InfluencerStatus,
        payout_ready: p.payout_ready as boolean,
        referral_count: referralCountMap.get(p.id) || 0,
        total_commissions_czk: commTotalMap.get(p.id) || 0,
        commissions_paid_czk: commPaidMap.get(p.id) || 0,
        commissions_pending_czk: commPendingMap.get(p.id) || 0,
        valid_referrals: validCountMap.get(p.id) || 0,
        paid_referrals: paidCountMap.get(p.id) || 0,
      }));

      setInfluencers(enriched);
    } catch (error) {
      console.error("Error fetching influencers:", error);
      toast.error("Nepodařilo se načíst Affiliate partnery");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfluencers();
  }, []);

  /* ===================== DETAIL FETCH ===================== */

  const fetchDetailData = useCallback(async (partnerId: string) => {
    setDetailLoading(true);
    setDetailData(null);
    try {
      const [validRes, paidRes, commissionsRes, campaignPartnersRes] = await Promise.all([
        supabase
          .from("v_influencer_referrals_valid" as any)
          .select("id, user_id, created_at")
          .eq("influencer_partner_id", partnerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("v_influencer_referrals_paid" as any)
          .select("id, user_id, created_at")
          .eq("influencer_partner_id", partnerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("influencer_commissions")
          .select("id, period_month, amount_czk, status, updated_at")
          .eq("influencer_partner_id", partnerId)
          .order("period_month", { ascending: false }),
        supabase
          .from("influencer_campaign_partners")
          .select("campaign_id")
          .eq("influencer_partner_id", partnerId),
      ]);

      let campaigns: DetailCampaign[] = [];
      const cpData = campaignPartnersRes.data || [];
      if (cpData.length > 0) {
        const campaignIds = cpData.map((cp) => cp.campaign_id);
        const { data: cData } = await supabase
          .from("influencer_campaigns")
          .select("id, name, bonus_czk_per_new_user, bonus_mc_for_user, starts_at, ends_at, active")
          .in("id", campaignIds)
          .order("starts_at", { ascending: false });
        campaigns = (cData || []) as DetailCampaign[];
      }

      setDetailData({
        validReferrals: ((validRes.data || []) as any[]) as DetailReferral[],
        paidReferrals: ((paidRes.data || []) as any[]) as DetailReferral[],
        commissions: (commissionsRes.data || []) as DetailCommission[],
        campaigns,
      });
    } catch (err) {
      console.error("Error fetching detail data:", err);
      toast.error("Nepodařilo se načíst detailní data");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ===================== ACTIONS ===================== */

  const handleStatusChange = async (influencerId: string, newStatus: "approved" | "rejected") => {
    setActionLoading(influencerId);

    const previousInfluencers = [...influencers];
    setInfluencers(
      influencers.map((i) =>
        i.id === influencerId ? { ...i, status: newStatus } : i
      )
    );

    try {
      const { error } = await supabase
        .from("partners")
        .update({ status: newStatus })
        .eq("id", influencerId);

      if (error) throw error;

      toast.success(
        newStatus === "approved"
          ? "Affiliate partner byl schválen"
          : "Affiliate partner byl zamítnut"
      );

      // Update detail dialog if open
      if (selectedInfluencer?.id === influencerId) {
        setSelectedInfluencer({ ...selectedInfluencer, status: newStatus });
      }
    } catch (error) {
      console.error("Error updating influencer status:", error);
      setInfluencers(previousInfluencers);
      toast.error("Nepodařilo se aktualizovat stav Affiliate partnera");
    } finally {
      setActionLoading(null);
    }
  };

  /* ===================== DETAIL ===================== */

  const openDetail = (influencer: Influencer) => {
    setSelectedInfluencer(influencer);
    setDetailOpen(true);
    fetchDetailData(influencer.id);
  };

  /* ===================== LOADING / AUTH ===================== */

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Nemáte oprávnění k zobrazení této stránky.</p>
      </div>
    );
  }

  /* ===================== STATS ===================== */

  const pendingCount = influencers.filter((i) => i.status === "pending").length;
  const approvedCount = influencers.filter((i) => i.status === "approved").length;
  const rejectedCount = influencers.filter((i) => i.status === "rejected").length;

  /* ===================== RENDER ===================== */

  return (
    <>
    <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Affiliate partneři</h1>
            <p className="text-sm text-muted-foreground">
              Affiliate partneři → uživatelé – přehled, provize, výkon
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInfluencers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Obnovit
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Čeká na schválení</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">Schváleno</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{rejectedCount}</p>
                <p className="text-xs text-muted-foreground">Zamítnuto</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Affiliate partneři ({influencers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {influencers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Zatím žádní Affiliate partneři.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jméno</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Web / Sociální sítě</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead className="text-center">Payout</TableHead>
                      <TableHead className="text-right">Validní ref.</TableHead>
                      <TableHead className="text-right">Platící ref.</TableHead>
                      <TableHead className="text-right">Provize CZK</TableHead>
                      <TableHead>Registrace</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {influencers.map((influencer) => {
                      const StatusIcon = statusIcons[influencer.status as InfluencerStatus] || Clock;
                      const isActionLoading = actionLoading === influencer.id;

                      return (
                        <TableRow key={influencer.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {influencer.logo_url ? (
                                <img
                                  src={influencer.logo_url}
                                  alt={influencer.name}
                                  className="w-8 h-8 rounded-full object-cover border border-border/50"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Users className="w-4 h-4 text-primary" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium">{influencer.name}</p>
                                {influencer.company_name && (
                                  <p className="text-xs text-muted-foreground">{influencer.company_name}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {influencer.contact_email ? (
                              <span className="text-sm">{influencer.contact_email}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {influencer.website_url ? (
                              <a
                                href={influencer.website_url.startsWith("http") ? influencer.website_url : `https://${influencer.website_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                              >
                                <Globe className="w-3 h-3" />
                                {influencer.website_url.replace(/^https?:\/\//, "").slice(0, 30)}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColors[influencer.status as InfluencerStatus] || "pending"}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusLabels[influencer.status as InfluencerStatus] || influencer.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {influencer.payout_ready ? (
                              <Badge variant="success" className="text-xs">
                                Ano
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Ne
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {influencer.valid_referrals}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {influencer.paid_referrals}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {influencer.total_commissions_czk.toLocaleString("cs-CZ")} Kč
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(influencer.created_at), "d. M. yyyy", { locale: cs })}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDetail(influencer)}
                                title="Detail"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {influencer.status === "pending" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleStatusChange(influencer.id, "approved")}
                                    disabled={isActionLoading}
                                    title="Schválit"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleStatusChange(influencer.id, "rejected")}
                                    disabled={isActionLoading}
                                    title="Zamítnout"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <XCircle className="w-4 h-4" />
                                    )}
                                  </Button>
                                </>
                              )}
                              {influencer.status === "approved" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleStatusChange(influencer.id, "rejected")}
                                  disabled={isActionLoading}
                                  title="Zamítnout"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                >
                                  {isActionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <XCircle className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                              {influencer.status === "rejected" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleStatusChange(influencer.id, "approved")}
                                  disabled={isActionLoading}
                                  title="Schválit"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                >
                                  {isActionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Detail Affiliate partnera
            </DialogTitle>
          </DialogHeader>

          {selectedInfluencer && (
            <div className="space-y-4">
              {/* Status badge + actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={statusColors[selectedInfluencer.status as InfluencerStatus] || "pending"}
                    className="text-sm"
                  >
                    {statusLabels[selectedInfluencer.status as InfluencerStatus] || selectedInfluencer.status}
                  </Badge>
                  <Badge variant={selectedInfluencer.payout_ready ? "success" : "outline"} className="text-xs">
                    Výplata: {selectedInfluencer.payout_ready ? "Ano" : "Ne"}
                  </Badge>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {selectedInfluencer.auth_user_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDetailOpen(false);
                        navigate(`/admin/messages/${selectedInfluencer.auth_user_id}`);
                      }}
                    >
                      <MessageCircle className="w-3 h-3 mr-1" />
                      Napsat zprávu
                    </Button>
                  )}
                  {selectedInfluencer.status !== "approved" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(selectedInfluencer.id, "approved")}
                      disabled={actionLoading === selectedInfluencer.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {actionLoading === selectedInfluencer.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      )}
                      Schválit
                    </Button>
                  )}
                  {selectedInfluencer.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleStatusChange(selectedInfluencer.id, "rejected")}
                      disabled={actionLoading === selectedInfluencer.id}
                    >
                      {actionLoading === selectedInfluencer.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      Zamítnout
                    </Button>
                  )}
                </div>
              </div>

              {/* Performance summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Přehled výkonu</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Platná doporučení</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{selectedInfluencer.valid_referrals}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Platící doporučení</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{selectedInfluencer.paid_referrals}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vyplaceno</p>
                    <p className="text-sm font-semibold tabular-nums text-green-600">{selectedInfluencer.commissions_paid_czk.toLocaleString("cs-CZ")} Kč</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nevyplaceno</p>
                    <p className="text-sm font-semibold tabular-nums text-amber-600">{selectedInfluencer.commissions_pending_czk.toLocaleString("cs-CZ")} Kč</p>
                  </div>
                </div>
              </div>

              {/* Complete profile – read-only, mirrors influencer self-profile */}
              {(() => {
                let parsed: Record<string, any> | null = null;
                try {
                  if (selectedInfluencer.notes) parsed = JSON.parse(selectedInfluencer.notes);
                } catch { /* not valid JSON */ }

                const socialNetworks = parsed?.social_networks as Record<string, string | null> | undefined;

                const socialEntries: { key: string; label: string; icon: React.ReactNode; value: string | null }[] = [
                  { key: "instagram", label: "Instagram", icon: <Instagram className="w-3.5 h-3.5" />, value: socialNetworks?.instagram || null },
                  { key: "tiktok", label: "TikTok", icon: <span className="text-xs font-bold">TT</span>, value: socialNetworks?.tiktok || null },
                  { key: "youtube", label: "YouTube", icon: <Youtube className="w-3.5 h-3.5" />, value: socialNetworks?.youtube || null },
                  { key: "facebook", label: "Facebook", icon: <Facebook className="w-3.5 h-3.5" />, value: socialNetworks?.facebook || null },
                  { key: "website", label: "Web", icon: <Globe className="w-3.5 h-3.5" />, value: selectedInfluencer.website_url || null },
                ];

                const readOnlyField = (label: string, value: string | null | undefined, icon?: React.ReactNode) => (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      {icon} {label}
                    </Label>
                    <p className="text-sm bg-muted/20 border border-border/30 rounded-md px-3 py-2 text-muted-foreground">
                      {value || "—"}
                    </p>
                  </div>
                );

                return (
                  <div className="space-y-4">
                    {/* Contact info */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Kontaktní údaje</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {readOnlyField("Jméno / Nick", selectedInfluencer.name, <Users className="w-3.5 h-3.5" />)}
                        {readOnlyField("Kontaktní e-mail", selectedInfluencer.contact_email, <Mail className="w-3.5 h-3.5" />)}
                        {readOnlyField("Telefon", selectedInfluencer.contact_phone, <Phone className="w-3.5 h-3.5" />)}
                        {selectedInfluencer.company_name && readOnlyField("Společnost", selectedInfluencer.company_name)}
                      </div>
                    </div>

                    {/* Influencer profile from notes */}
                    {parsed && (parsed.follower_range || parsed.content_category) && (
                      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Profil Affiliate partnera</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {parsed.follower_range && readOnlyField("Rozsah sledujících", parsed.follower_range)}
                          {parsed.content_category && readOnlyField("Kategorie obsahu", parsed.content_category)}
                        </div>
                      </div>
                    )}

                    {/* Social platforms */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Sociální sítě a web</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {socialEntries.map((entry) => (
                          <div key={entry.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              {entry.icon} {entry.label}
                            </Label>
                            {entry.value ? (
                              <a
                                href={entry.value.startsWith("http") ? entry.value : `https://${entry.value}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-sm bg-muted/20 border border-border/30 rounded-md px-3 py-2 text-primary hover:underline truncate"
                              >
                                {entry.value}
                              </a>
                            ) : (
                              <p className="text-sm bg-muted/20 border border-border/30 rounded-md px-3 py-2 text-muted-foreground">—</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Profile image + dates */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Registrace</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                        {selectedInfluencer.logo_url && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Profilový obrázek</Label>
                            <img
                              src={selectedInfluencer.logo_url}
                              alt={selectedInfluencer.name}
                              className="w-16 h-16 rounded-lg object-cover border border-border/50"
                            />
                          </div>
                        )}
                        {readOnlyField("Datum registrace", format(new Date(selectedInfluencer.created_at), "d. M. yyyy HH:mm", { locale: cs }))}
                        {readOnlyField("Poslední změna", format(new Date(selectedInfluencer.updated_at), "d. M. yyyy HH:mm", { locale: cs }))}
                      </div>
                    </div>

                    {/* Raw notes – collapsible */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronDown className="w-3.5 h-3.5" />
                        Poznámky (raw)
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Textarea
                          value={selectedInfluencer.notes || ""}
                          readOnly
                          className="mt-1 text-xs font-mono bg-muted/50 resize-none"
                          rows={6}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })()}

              {/* Detail Tabs */}
              <Tabs defaultValue="referrals" className="mt-4">
                <TabsList className="w-full">
                  <TabsTrigger value="referrals" className="flex-1 gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Doporučení
                  </TabsTrigger>
                  <TabsTrigger value="commissions" className="flex-1 gap-1.5">
                    <Banknote className="w-3.5 h-3.5" />
                    Provize
                  </TabsTrigger>
                  <TabsTrigger value="campaigns" className="flex-1 gap-1.5">
                    <Megaphone className="w-3.5 h-3.5" />
                    Kampaně
                  </TabsTrigger>
                </TabsList>

                {detailLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : detailData ? (
                  <>
                    {/* Referrals Tab */}
                    <TabsContent value="referrals" className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Validní</p>
                          <p className="text-xl font-bold tabular-nums text-foreground">{detailData.validReferrals.length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Platící</p>
                          <p className="text-xl font-bold tabular-nums text-foreground">{detailData.paidReferrals.length}</p>
                        </div>
                      </div>

                      {detailData.validReferrals.length > 0 ? (
                        <div className="overflow-x-auto max-h-48 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>User ID</TableHead>
                                <TableHead>Datum</TableHead>
                                <TableHead className="text-center">Platící</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detailData.validReferrals.map((ref) => {
                                const isPaid = detailData.paidReferrals.some((pr) => pr.user_id === ref.user_id);
                                return (
                                  <TableRow key={ref.id}>
                                    <TableCell className="text-xs font-mono">{ref.user_id.slice(0, 8)}…</TableCell>
                                    <TableCell className="text-xs">
                                      {format(new Date(ref.created_at), "d. M. yyyy", { locale: cs })}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {isPaid ? (
                                        <Badge variant="success" className="text-xs">
                                          <CreditCard className="w-3 h-3 mr-1" />
                                          Ano
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">
                                          Ne
                                        </Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">Žádná platná doporučení.</p>
                      )}
                    </TabsContent>

                    {/* Commissions Tab */}
                    <TabsContent value="commissions">
                      {detailData.commissions.length > 0 ? (
                        <div className="overflow-x-auto max-h-64 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Období</TableHead>
                                <TableHead className="text-right">Částka CZK</TableHead>
                                <TableHead>Stav</TableHead>
                                <TableHead>Aktualizováno</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detailData.commissions.map((comm) => (
                                <TableRow key={comm.id}>
                                  <TableCell className="text-sm font-medium">{comm.period_month}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">
                                    {Number(comm.amount_czk).toLocaleString("cs-CZ")} Kč
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        comm.status === "paid"
                                          ? "info"
                                          : comm.status === "approved"
                                            ? "success"
                                            : comm.status === "calculated"
                                              ? "warning"
                                              : "outline"
                                      }
                                      className="text-xs"
                                    >
                                      {commissionStatusLabels[comm.status] || comm.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {format(new Date(comm.updated_at), "d. M. yyyy", { locale: cs })}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">Žádné provize.</p>
                      )}
                    </TabsContent>

                    {/* Campaigns Tab */}
                    <TabsContent value="campaigns">
                      {detailData.campaigns.length > 0 ? (
                        <div className="overflow-x-auto max-h-64 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Kampaň</TableHead>
                                <TableHead className="text-right">CZK / uživatel</TableHead>
                                <TableHead className="text-right">MC / uživatel</TableHead>
                                <TableHead>Období</TableHead>
                                <TableHead className="text-center">Aktivní</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detailData.campaigns.map((camp) => (
                                <TableRow key={camp.id}>
                                  <TableCell className="text-sm font-medium">{camp.name}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {Number(camp.bonus_czk_per_new_user).toLocaleString("cs-CZ")} Kč
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {Number(camp.bonus_mc_for_user)}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {format(new Date(camp.starts_at), "d. M. yy", { locale: cs })} – {format(new Date(camp.ends_at), "d. M. yy", { locale: cs })}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant={camp.active ? "success" : "pending"} className="text-xs">
                                      {camp.active ? "Ano" : "Ne"}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">Žádné přiřazené kampaně.</p>
                      )}
                    </TabsContent>
                  </>
                ) : null}
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
};

export default AdminInfluencers;
