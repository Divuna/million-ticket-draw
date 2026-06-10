import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Banknote, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

type PayoutBatch = {
  id: string;
  batch_number: string;
  status: string;
  item_count: number;
  total_amount_czk: number;
  due_date: string | null;
  payer_account: string | null;
  payer_bank_code: string | null;
  bank_export_encoding: string | null;
  bank_export_line_endings: string | null;
  created_at: string;
  marked_paid_at: string | null;
  marked_paid_by: string | null;
};

type PayoutBatchItem = {
  id: string;
  commission_id: string;
  recipient_name: string;
  recipient_account: string;
  recipient_bank_code: string;
  amount_czk: number;
  variable_symbol: string;
  payment_message: string | null;
  constant_symbol: string | null;
  specific_symbol: string | null;
  created_at: string;
};

function formatCzk(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "d. M. yyyy", { locale: cs });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "d. M. yyyy HH:mm", { locale: cs });
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

export default function AdminAffiliatePayoutDetail() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [batch, setBatch] = useState<PayoutBatch | null>(null);
  const [items, setItems] = useState<PayoutBatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);

  const fetchDetail = useCallback(async (silent = false) => {
    if (!batchId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: batchData, error: batchError } = await (supabase as any)
        .from("affiliate_payout_batches")
        .select(
          "id,batch_number,status,item_count,total_amount_czk,due_date,payer_account,payer_bank_code,bank_export_encoding,bank_export_line_endings,created_at,marked_paid_at,marked_paid_by"
        )
        .eq("id", batchId)
        .maybeSingle();

      if (batchError) throw batchError;

      const { data: itemData, error: itemError } = await (supabase as any)
        .from("affiliate_payout_batch_items")
        .select(
          "id,commission_id,recipient_name,recipient_account,recipient_bank_code,amount_czk,variable_symbol,payment_message,constant_symbol,specific_symbol,created_at"
        )
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });

      if (itemError) throw itemError;

      setBatch((batchData ?? null) as PayoutBatch | null);
      setItems((itemData ?? []) as PayoutBatchItem[]);
    } catch (error) {
      console.error("AdminAffiliatePayoutDetail fetch error:", error);
      toast.error("Nepodařilo se načíst detail dávky.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batchId]);

  const markBatchPaid = async () => {
    if (!batchId) return;

    setMarkingPaid(true);
    try {
      const { data, error } = await (supabase as any).rpc("mark_affiliate_payout_batch_paid", {
        p_batch_id: batchId,
      });

      if (error) throw error;
      const result = data as { status?: string };

      if (result?.status === "paid") {
        toast.success("Platební dávka byla označena jako zaplacená.");
        setConfirmPaidOpen(false);
        fetchDetail(true);
        return;
      }

      const map: Record<string, string> = {
        forbidden: "Nemáte oprávnění tuto akci provést.",
        not_found: "Platební dávka nebyla nalezena.",
        invalid_batch_status: "Tuto dávku nelze označit jako zaplacenou.",
        empty_batch: "Dávka nemá žádné položky.",
        invalid_commission_status: "Některá provize v dávce nemá očekávaný stav.",
      };
      toast.error(map[result?.status ?? ""] ?? "Dávku se nepodařilo označit jako zaplacenou.");
    } catch (error) {
      console.error("mark_affiliate_payout_batch_paid error:", error);
      toast.error("Dávku se nepodařilo označit jako zaplacenou.");
    } finally {
      setMarkingPaid(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !roleLoading && isAdmin) {
      fetchDetail();
    }
  }, [authLoading, roleLoading, isAdmin, fetchDetail]);

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

  if (!loading && !batch) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/admin/affiliate-payouts")}>
          <ArrowLeft className="h-4 w-4" />
          Zpět na dávky
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Platební dávka nebyla nalezena.
          </CardContent>
        </Card>
      </div>
    );
  }

  const canMarkPaid = batch?.status === "created" || batch?.status === "exported";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <AlertDialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Označit dávku jako zaplacenou?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce neposílá peníze. Pouze potvrzuje, že platba byla provedena v bance.
              Provize v dávce se atomicky označí jako vyplacené.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingPaid}>Zrušit</AlertDialogCancel>
            <AlertDialogAction disabled={markingPaid} onClick={markBatchPaid}>
              {markingPaid ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Ukládám…
                </>
              ) : (
                "Označit jako zaplacené"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2">
            <Link to="/admin/affiliate-payouts">
              <ArrowLeft className="h-4 w-4" />
              Zpět na dávky
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" />
            {batch?.batch_number ?? "Platební dávka"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDetail(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Obnovit
          </Button>
          {canMarkPaid && (
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => setConfirmPaidOpen(true)}
              data-testid="btn-mark-affiliate-payout-batch-paid"
            >
              <CheckCircle className="h-4 w-4" />
              Označit dávku jako zaplacenou
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Souhrn</CardTitle>
              <CardDescription>
                Fáze B zatím neeviduje PDF, e-maily ani bankovní export. Dávka slouží pro atomické seskupení a stav výplaty.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Stav</div>
                  <div className="mt-1">{batch ? statusBadge(batch.status) : "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Položky</div>
                  <div className="mt-1 font-mono">{batch?.item_count ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Celkem</div>
                  <div className="mt-1 font-mono font-semibold">{formatCzk(batch?.total_amount_czk)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Splatnost</div>
                  <div className="mt-1">{formatDate(batch?.due_date)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Účet plátce</div>
                  <div className="mt-1 font-mono">
                    {batch?.payer_account ? `${batch.payer_account}/${batch.payer_bank_code ?? "—"}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Kódování</div>
                  <div className="mt-1 font-mono">{batch?.bank_export_encoding ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Konce řádků</div>
                  <div className="mt-1 font-mono">{batch?.bank_export_line_endings ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Zaplaceno</div>
                  <div className="mt-1">{formatDateTime(batch?.marked_paid_at)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Položky dávky</CardTitle>
              <CardDescription>
                VS a platební údaje jsou snapshot z okamžiku vytvoření dávky.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Dávka nemá žádné položky.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Příjemce</TableHead>
                        <TableHead>Účet</TableHead>
                        <TableHead className="text-right">Částka</TableHead>
                        <TableHead>VS</TableHead>
                        <TableHead>KS</TableHead>
                        <TableHead>SS</TableHead>
                        <TableHead>Zpráva</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.recipient_name}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.recipient_account}/{item.recipient_bank_code}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {formatCzk(item.amount_czk)}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{item.variable_symbol}</code>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.constant_symbol ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{item.specific_symbol ?? "—"}</TableCell>
                          <TableCell className="max-w-64 truncate" title={item.payment_message ?? undefined}>
                            {item.payment_message ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
