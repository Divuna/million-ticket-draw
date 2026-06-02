import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Banknote, Building2, Handshake, Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { NavigateToLogin } from "@/components/NavigateToLogin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

type AffiliateStatus = "pending" | "active" | "paused" | "terminated" | "rejected" | string;

interface AffiliatePartnerRow {
  id: string;
  display_name: string;
  legal_name: string | null;
  contact_email: string | null;
  affiliate_type: string;
  status: AffiliateStatus;
  primary_code: string | null;
  current_commission_rate: number | null;
  attributed_users_count: number | null;
  referred_merchants_count: number | null;
  commissions_total_czk: number | null;
  bonuses_total_czk: number | null;
  created_at: string;
  updated_at: string;
}

interface CustomerAttributionRow {
  attribution_id: string;
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  affiliate_display_name: string;
  affiliate_code: string | null;
  source: string;
  attributed_at: string;
  locked: boolean;
}

interface MerchantReferralRow {
  merchant_referral_id: string;
  merchant_name: string;
  merchant_company_name: string | null;
  merchant_contact_email: string | null;
  affiliate_display_name: string;
  affiliate_code: string | null;
  status: string;
  registered_at: string;
  activated_at: string | null;
  bonus_eligible_at: string | null;
}

interface CommissionEventRow {
  commission_event_id: string;
  affiliate_display_name: string;
  user_email: string | null;
  user_display_name: string | null;
  payment_id: string;
  payment_amount_snapshot: number;
  commission_rate_snapshot: number;
  commission_amount_czk: number;
  status: string;
  calculated_at: string;
}

interface PayoutSummaryRow {
  affiliate_partner_id: string;
  display_name: string;
  period_month: string;
  commission_amount_czk: number | null;
  bonus_amount_czk: number | null;
  total_amount_czk: number | null;
  payout_status: string;
}

const statusLabels: Record<string, string> = {
  pending: "Čeká na schválení",
  active: "Aktivní",
  paused: "Pozastaveno",
  terminated: "Ukončeno",
  rejected: "Zamítnuto",
  calculated: "Vypočteno",
  approved: "Schváleno",
  paid: "Vyplaceno",
  reversed: "Vráceno",
  cancelled: "Zrušeno",
  registered: "Registrováno",
  bonus_eligible: "Nárok na bonus",
};

const sourceLabels: Record<string, string> = {
  direct_link: "Přímý odkaz",
  merchant_email: "E-mail obchodu",
  partner_register: "Registrace firmy",
  manual_admin: "Ruční admin",
  import: "Import",
  other: "Jiné",
};

const typeLabels: Record<string, string> = {
  influencer: "Influencer",
  sales_partner: "Obchodní doporučitel",
  agency: "Agentura",
  individual: "Jednotlivec",
  other: "Jiné",
};

function statusVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "active":
    case "approved":
    case "paid":
      return "success";
    case "pending":
    case "registered":
    case "calculated":
      return "pending";
    case "paused":
    case "bonus_eligible":
      return "warning";
    case "terminated":
    case "rejected":
    case "reversed":
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

const formatCzk = (value: number | null | undefined) =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatRate = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return `${new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value) * 100)} %`;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  return format(new Date(value), "d. M. yyyy", { locale: cs });
};

const formatMonth = (value: string | null | undefined) => {
  if (!value) return "-";
  return format(new Date(value), "LLLL yyyy", { locale: cs });
};

const emptyCell = (value: string | null | undefined) => value || "-";

function LoadingRows() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default function AdminAffiliate() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [partners, setPartners] = useState<AffiliatePartnerRow[]>([]);
  const [customers, setCustomers] = useState<CustomerAttributionRow[]>([]);
  const [merchants, setMerchants] = useState<MerchantReferralRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionEventRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAffiliateData = async () => {
    setLoading(true);
    try {
      const [partnersRes, customersRes, merchantsRes, commissionsRes, payoutsRes] = await Promise.all([
        supabase
          .from("v_admin_affiliate_partners" as any)
          .select(
            "id, display_name, legal_name, contact_email, affiliate_type, status, primary_code, current_commission_rate, attributed_users_count, referred_merchants_count, commissions_total_czk, bonuses_total_czk, created_at, updated_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("v_admin_affiliate_customer_attributions" as any)
          .select(
            "attribution_id, user_id, user_email, user_display_name, affiliate_display_name, affiliate_code, source, attributed_at, locked",
          )
          .order("attributed_at", { ascending: false }),
        supabase
          .from("v_admin_affiliate_merchant_referrals" as any)
          .select(
            "merchant_referral_id, merchant_name, merchant_company_name, merchant_contact_email, affiliate_display_name, affiliate_code, status, registered_at, activated_at, bonus_eligible_at",
          )
          .order("registered_at", { ascending: false }),
        supabase
          .from("v_admin_affiliate_commission_events" as any)
          .select(
            "commission_event_id, affiliate_display_name, user_email, user_display_name, payment_id, payment_amount_snapshot, commission_rate_snapshot, commission_amount_czk, status, calculated_at",
          )
          .order("calculated_at", { ascending: false }),
        supabase
          .from("v_admin_affiliate_payout_summary" as any)
          .select(
            "affiliate_partner_id, display_name, period_month, commission_amount_czk, bonus_amount_czk, total_amount_czk, payout_status",
          )
          .order("period_month", { ascending: false }),
      ]);

      const firstError =
        partnersRes.error || customersRes.error || merchantsRes.error || commissionsRes.error || payoutsRes.error;
      if (firstError) throw firstError;

      setPartners(((partnersRes.data as AffiliatePartnerRow[] | null) || []));
      setCustomers(((customersRes.data as CustomerAttributionRow[] | null) || []));
      setMerchants(((merchantsRes.data as MerchantReferralRow[] | null) || []));
      setCommissions(((commissionsRes.data as CommissionEventRow[] | null) || []));
      setPayouts(((payoutsRes.data as PayoutSummaryRow[] | null) || []));
    } catch (error) {
      console.error("Error fetching affiliate system:", error);
      toast.error("Nepodařilo se načíst affiliate systém");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAffiliateData();
    }
  }, [isAdmin]);

  const summary = useMemo(() => {
    return partners.reduce(
      (acc, partner) => {
        acc.total += 1;
        if (partner.status === "active") acc.active += 1;
        acc.customers += Number(partner.attributed_users_count || 0);
        acc.merchants += Number(partner.referred_merchants_count || 0);
        acc.commissions += Number(partner.commissions_total_czk || 0);
        return acc;
      },
      { total: 0, active: 0, customers: 0, merchants: 0, commissions: 0 },
    );
  }, [partners]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <NavigateToLogin />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Affiliate systém</h1>
          <p className="text-sm text-muted-foreground">Read-only přehled nové affiliate vrstvy OneMil.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={fetchAffiliateData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Obnovit
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Partneři</CardDescription>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <p className="text-xs text-muted-foreground">{summary.active} aktivních</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Zákazníci</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.customers}</div>
            <p className="text-xs text-muted-foreground">přiřazení lifetime attribution</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Firmy</CardDescription>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.merchants}</div>
            <p className="text-xs text-muted-foreground">přivedené firmy / e-shopy</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Provize</CardDescription>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCzk(summary.commissions)}</div>
            <p className="text-xs text-muted-foreground">vypočtené celkem</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="partners" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="partners">Partneři</TabsTrigger>
          <TabsTrigger value="customers">Zákazníci</TabsTrigger>
          <TabsTrigger value="merchants">Firmy</TabsTrigger>
          <TabsTrigger value="commissions">Provize</TabsTrigger>
          <TabsTrigger value="payouts">Výplaty</TabsTrigger>
        </TabsList>

        <TabsContent value="partners">
          <Card>
            <CardHeader>
              <CardTitle>Affiliate partneři</CardTitle>
              <CardDescription>Data se načítají pouze z view v_admin_affiliate_partners.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRows />
              ) : partners.length === 0 ? (
                <EmptyState text="Zatím nejsou evidováni žádní affiliate partneři." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead>Kód</TableHead>
                      <TableHead className="text-right">Sazba</TableHead>
                      <TableHead className="text-right">Zákazníci</TableHead>
                      <TableHead className="text-right">Firmy</TableHead>
                      <TableHead className="text-right">Provize</TableHead>
                      <TableHead className="text-right">Bonusy</TableHead>
                      <TableHead>Vytvořeno</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((partner) => (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <div className="font-medium">{partner.display_name}</div>
                          {partner.contact_email && (
                            <div className="text-xs text-muted-foreground">{partner.contact_email}</div>
                          )}
                        </TableCell>
                        <TableCell>{typeLabels[partner.affiliate_type] || partner.affiliate_type}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(partner.status)}>
                            {statusLabels[partner.status] || partner.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{partner.primary_code || "-"}</span>
                        </TableCell>
                        <TableCell className="text-right">{formatRate(partner.current_commission_rate)}</TableCell>
                        <TableCell className="text-right">{partner.attributed_users_count || 0}</TableCell>
                        <TableCell className="text-right">{partner.referred_merchants_count || 0}</TableCell>
                        <TableCell className="text-right">{formatCzk(partner.commissions_total_czk)}</TableCell>
                        <TableCell className="text-right">{formatCzk(partner.bonuses_total_czk)}</TableCell>
                        <TableCell>{formatDate(partner.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Přivedení zákazníci</CardTitle>
              <CardDescription>Read-only lifetime attribution z v_admin_affiliate_customer_attributions.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRows />
              ) : customers.length === 0 ? (
                <EmptyState text="Zatím nejsou evidovaní žádní přivedení zákazníci." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zákazník</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Affiliate partner</TableHead>
                      <TableHead>Kód</TableHead>
                      <TableHead>Zdroj</TableHead>
                      <TableHead>Přiřazeno</TableHead>
                      <TableHead>Locked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((row) => (
                      <TableRow key={row.attribution_id}>
                        <TableCell>{emptyCell(row.user_display_name)}</TableCell>
                        <TableCell>{emptyCell(row.user_email)}</TableCell>
                        <TableCell>{row.affiliate_display_name}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{row.affiliate_code || "-"}</span>
                        </TableCell>
                        <TableCell>{sourceLabels[row.source] || row.source}</TableCell>
                        <TableCell>{formatDate(row.attributed_at)}</TableCell>
                        <TableCell>
                          <Badge variant={row.locked ? "success" : "warning"}>{row.locked ? "Ano" : "Ne"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle>Přivedené firmy</CardTitle>
              <CardDescription>Read-only merchant referrals z v_admin_affiliate_merchant_referrals.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRows />
              ) : merchants.length === 0 ? (
                <EmptyState text="Zatím nejsou evidované žádné přivedené firmy." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Affiliate partner</TableHead>
                      <TableHead>Kód</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registrováno</TableHead>
                      <TableHead>Aktivováno</TableHead>
                      <TableHead>Nárok na bonus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {merchants.map((row) => (
                      <TableRow key={row.merchant_referral_id}>
                        <TableCell>
                          <div className="font-medium">
                            {row.merchant_company_name || row.merchant_name || "-"}
                          </div>
                          {row.merchant_company_name && (
                            <div className="text-xs text-muted-foreground">{row.merchant_name}</div>
                          )}
                        </TableCell>
                        <TableCell>{emptyCell(row.merchant_contact_email)}</TableCell>
                        <TableCell>{row.affiliate_display_name}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{row.affiliate_code || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.status)}>{statusLabels[row.status] || row.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(row.registered_at)}</TableCell>
                        <TableCell>{formatDate(row.activated_at)}</TableCell>
                        <TableCell>{formatDate(row.bonus_eligible_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle>Provizní události</CardTitle>
              <CardDescription>Read-only commission ledger z v_admin_affiliate_commission_events.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRows />
              ) : commissions.length === 0 ? (
                <EmptyState text="Zatím nejsou evidované žádné provizní události." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Affiliate partner</TableHead>
                      <TableHead>Zákazník</TableHead>
                      <TableHead>Payment ID</TableHead>
                      <TableHead className="text-right">Kč snapshot</TableHead>
                      <TableHead className="text-right">Sazba</TableHead>
                      <TableHead className="text-right">Provize</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vypočteno</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((row) => (
                      <TableRow key={row.commission_event_id}>
                        <TableCell>{row.affiliate_display_name}</TableCell>
                        <TableCell>
                          <div>{emptyCell(row.user_display_name)}</div>
                          <div className="text-xs text-muted-foreground">{emptyCell(row.user_email)}</div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{row.payment_id}</span>
                        </TableCell>
                        <TableCell className="text-right">{formatCzk(row.payment_amount_snapshot)}</TableCell>
                        <TableCell className="text-right">{formatRate(row.commission_rate_snapshot)}</TableCell>
                        <TableCell className="text-right">{formatCzk(row.commission_amount_czk)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.status)}>{statusLabels[row.status] || row.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(row.calculated_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Výplaty a měsíční souhrny</CardTitle>
              <CardDescription>Read-only payout souhrny z v_admin_affiliate_payout_summary.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRows />
              ) : payouts.length === 0 ? (
                <EmptyState text="Zatím nejsou evidované žádné měsíční souhrny výplat." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Affiliate partner</TableHead>
                      <TableHead>Měsíc</TableHead>
                      <TableHead className="text-right">Provize Kč</TableHead>
                      <TableHead className="text-right">Bonusy Kč</TableHead>
                      <TableHead className="text-right">Celkem Kč</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((row) => (
                      <TableRow key={`${row.affiliate_partner_id}-${row.period_month}`}>
                        <TableCell>{row.display_name}</TableCell>
                        <TableCell>{formatMonth(row.period_month)}</TableCell>
                        <TableCell className="text-right">{formatCzk(row.commission_amount_czk)}</TableCell>
                        <TableCell className="text-right">{formatCzk(row.bonus_amount_czk)}</TableCell>
                        <TableCell className="text-right">{formatCzk(row.total_amount_czk)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.payout_status)}>
                            {statusLabels[row.payout_status] || row.payout_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
