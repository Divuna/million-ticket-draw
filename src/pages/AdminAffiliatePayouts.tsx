import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, Eye, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

type PayoutBatchRow = {
  id: string;
  batch_number: string;
  status: string;
  item_count: number;
  total_amount_czk: number;
  due_date: string | null;
  created_at: string;
  marked_paid_at: string | null;
};

function formatCzk(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "d. M. yyyy HH:mm", { locale: cs });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "d. M. yyyy", { locale: cs });
}

function statusBadge(status: string) {
  switch (status) {
    case "created":
      return <Badge variant="warning">Vytvořeno</Badge>;
    case "exported":
      return <Badge variant="outline">Exportováno</Badge>;
    case "paid":
      return <Badge variant="success">Zaplaceno</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Zrušeno</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminAffiliatePayouts() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<PayoutBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRows = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await (supabase as any)
        .from("affiliate_payout_batches")
        .select("id,batch_number,status,item_count,total_amount_czk,due_date,created_at,marked_paid_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as PayoutBatchRow[]);
    } catch (error) {
      console.error("AdminAffiliatePayouts fetch error:", error);
      toast.error("Nepodařilo se načíst platební dávky.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !roleLoading && isAdmin) {
      fetchRows();
    }
  }, [authLoading, roleLoading, isAdmin, fetchRows]);

  if (authLoading || roleLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) return <NavigateToLogin />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" />
            Platební dávky provizí
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Dávkové výplaty affiliate a obchodních provizí bez PDF, e-mailů a bankovního exportu.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRows(true)}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dávky</CardTitle>
          <CardDescription>
            Dávka se označuje jako zaplacená až po reálném odeslání platby v bance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Zatím nebyla vytvořena žádná platební dávka.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Číslo dávky</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead className="text-right">Položky</TableHead>
                    <TableHead className="text-right">Celkem</TableHead>
                    <TableHead>Splatnost</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                    <TableHead>Zaplaceno</TableHead>
                    <TableHead className="text-center">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">{row.batch_number}</code>
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{row.item_count}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCzk(row.total_amount_czk)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(row.due_date)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDateTime(row.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDateTime(row.marked_paid_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button asChild size="sm" variant="outline" className="gap-2">
                          <Link to={`/admin/affiliate-payouts/${row.id}`}>
                            <Eye className="h-4 w-4" />
                            Detail
                          </Link>
                        </Button>
                      </TableCell>
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
}
