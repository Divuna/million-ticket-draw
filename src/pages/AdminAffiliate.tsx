import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Banknote, Handshake, Loader2, Percent, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { NavigateToLogin } from "@/components/NavigateToLogin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const statusLabels: Record<string, string> = {
  pending: "Ceka na schvaleni",
  active: "Aktivni",
  paused: "Pozastaveno",
  terminated: "Ukonceno",
  rejected: "Zamitnuto",
};

const typeLabels: Record<string, string> = {
  influencer: "Influencer",
  sales_partner: "Obchodni doporucitel",
  agency: "Agentura",
  individual: "Jednotlivec",
  other: "Jine",
};

function statusVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "pending";
    case "paused":
      return "warning";
    case "terminated":
    case "rejected":
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

export default function AdminAffiliate() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [partners, setPartners] = useState<AffiliatePartnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("v_admin_affiliate_partners" as any)
        .select(
          "id, display_name, legal_name, contact_email, affiliate_type, status, primary_code, current_commission_rate, attributed_users_count, referred_merchants_count, commissions_total_czk, bonuses_total_czk, created_at, updated_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPartners(((data as AffiliatePartnerRow[] | null) || []));
    } catch (error) {
      console.error("Error fetching affiliate partners:", error);
      toast.error("Nepodarilo se nacist affiliate system");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchPartners();
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
          <h1 className="text-2xl font-bold tracking-tight">Affiliate system</h1>
          <p className="text-sm text-muted-foreground">Read-only prehled nove affiliate vrstvy OneMil.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPartners} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Obnovit
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Partneri</CardDescription>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <p className="text-xs text-muted-foreground">{summary.active} aktivnich</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Zakaznici</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.customers}</div>
            <p className="text-xs text-muted-foreground">prirazeni lifetime attribution</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Firmy</CardDescription>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.merchants}</div>
            <p className="text-xs text-muted-foreground">privedene firmy / e-shopy</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Provize</CardDescription>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCzk(summary.commissions)}</div>
            <p className="text-xs text-muted-foreground">vypoctene celkem</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Affiliate partneri</CardTitle>
          <CardDescription>Data se nacitaji pouze z view v_admin_affiliate_partners.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : partners.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Zatim nejsou evidovani zadni affiliate partneri.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Kod</TableHead>
                  <TableHead className="text-right">Sazba</TableHead>
                  <TableHead className="text-right">Zakaznici</TableHead>
                  <TableHead className="text-right">Firmy</TableHead>
                  <TableHead className="text-right">Provize</TableHead>
                  <TableHead className="text-right">Bonusy</TableHead>
                  <TableHead>Vytvoreno</TableHead>
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
    </div>
  );
}
