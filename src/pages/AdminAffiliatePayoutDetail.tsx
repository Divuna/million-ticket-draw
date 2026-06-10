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
import { ArrowLeft, Banknote, CheckCircle, Download, FileText, Loader2, RefreshCw } from "lucide-react";
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
  bank_export_storage_path: string | null;
  bank_export_generated_at: string | null;
  bank_export_sha256: string | null;
  bank_export_size_bytes: number | null;
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
  payout_document_number: string | null;
  payout_pdf_storage_path: string | null;
  payout_email_status: string | null;
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
  const [generatingExport, setGeneratingExport] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);

  const fetchDetail = useCallback(async (silent = false) => {
    if (!batchId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: batchData, error: batchError } = await (supabase as any)
        .from("affiliate_payout_batches")
        .select(
          "id,batch_number,status,item_count,total_amount_czk,due_date,payer_account,payer_bank_code,bank_export_encoding,bank_export_line_endings,bank_export_storage_path,bank_export_generated_at,bank_export_sha256,bank_export_size_bytes,created_at,marked_paid_at,marked_paid_by"
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

      const commissionIds = (itemData ?? []).map((item: any) => item.commission_id).filter(Boolean);
      const documentMap: Record<string, any> = {};
      if (commissionIds.length > 0) {
        const { data: documentData, error: documentError } = await (supabase as any)
          .from("affiliate_payout_documents")
          .select("commission_id,document_number,pdf_storage_path,email_status")
          .in("commission_id", commissionIds);
        if (documentError) {
          console.warn("affiliate_payout_documents fetch skipped:", documentError.message);
        }
        for (const doc of documentData ?? []) {
          documentMap[doc.commission_id] = doc;
        }
      }

      setBatch((batchData ?? null) as PayoutBatch | null);
      setItems(((itemData ?? []) as any[]).map((item) => ({
        ...item,
        payout_document_number: documentMap[item.commission_id]?.document_number ?? null,
        payout_pdf_storage_path: documentMap[item.commission_id]?.pdf_storage_path ?? null,
        payout_email_status: documentMap[item.commission_id]?.email_status ?? null,
      })) as PayoutBatchItem[]);
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

  const generateBankExport = async () => {
    if (!batchId) return;

    setGeneratingExport(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke(
        "generate-affiliate-bank-export",
        { body: { batch_id: batchId } },
      );

      if (error) throw error;

      if (data?.success && data.status === "exported") {
        toast.success("Bankovní export pro Air Bank byl vygenerován.");
        fetchDetail(true);
        return;
      }

      const status = data?.error ?? data?.status;
      const map: Record<string, string> = {
        missing_payer_account: "Chybí účet plátce pro export.",
        invalid_payer_account: "Účet plátce nemá platný formát.",
        invalid_payer_bank_code: "Kód banky plátce není platný.",
        invalid_airbank_payer_bank_code: "Pro Air Bank export musí být kód banky plátce 3030.",
        missing_due_date: "Chybí datum splatnosti dávky.",
        invalid_due_date: "Datum splatnosti není platné.",
        empty_batch: "Dávka nemá žádné položky.",
        invalid_batch_status: "Export lze vytvořit jen pro dávku ve stavu Vytvořeno.",
        invalid_commission_status: "Některá provize v dávce nemá očekávaný stav.",
        kpc_file_too_large: "Exportní soubor překročil limit Air Bank 50 KB.",
      };
      toast.error(map[status ?? ""] ?? "Bankovní export se nepodařilo vygenerovat.");
    } catch (error) {
      console.error("generate-affiliate-bank-export error:", error);
      toast.error("Bankovní export se nepodařilo vygenerovat.");
    } finally {
      setGeneratingExport(false);
    }
  };

  const downloadBankExport = async () => {
    if (!batch?.bank_export_storage_path) return;

    setDownloadingExport(true);
    try {
      const { data, error } = await (supabase as any).storage
        .from("affiliate-bank-exports")
        .createSignedUrl(batch.bank_export_storage_path, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("missing_signed_url");

      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = `${batch.batch_number}.kpc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("download affiliate bank export error:", error);
      toast.error("Export se nepodařilo stáhnout.");
    } finally {
      setDownloadingExport(false);
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

  const canGenerateExport = batch?.status === "created";
  const canDownloadExport = Boolean(batch?.bank_export_storage_path);
  const canMarkPaid = batch?.status === "exported";

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
          {canGenerateExport && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={generateBankExport}
              disabled={generatingExport}
              data-testid="btn-generate-affiliate-bank-export"
            >
              {generatingExport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Vygenerovat Air Bank export
            </Button>
          )}
          {canDownloadExport && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={downloadBankExport}
              disabled={downloadingExport}
              data-testid="btn-download-affiliate-bank-export"
            >
              {downloadingExport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Stáhnout .kpc
            </Button>
          )}
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
                Faze D pridava Air Bank export. Davku lze oznacit jako zaplacenou az po vygenerovani exportu.
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
                <div>
                  <div className="text-muted-foreground">Export Air Bank</div>
                  <div className="mt-1">{formatDateTime(batch?.bank_export_generated_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Soubor exportu</div>
                  <div className="mt-1 font-mono text-xs break-all">
                    {batch?.bank_export_storage_path ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Velikost exportu</div>
                  <div className="mt-1 font-mono">
                    {batch?.bank_export_size_bytes ? `${batch.bank_export_size_bytes} B` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">SHA-256</div>
                  <div className="mt-1 font-mono text-xs break-all">
                    {batch?.bank_export_sha256 ?? "—"}
                  </div>
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
                        <TableHead>Doklad</TableHead>
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
                          <TableCell>
                            {item.payout_document_number ? (
                              <div className="space-y-1 min-w-36">
                                <div className="flex items-center gap-1 font-mono text-xs">
                                  <FileText className="h-3 w-3" />
                                  {item.payout_document_number}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {item.payout_pdf_storage_path ? "PDF ve storage" : "PDF chybi"}
                                </div>
                                {item.payout_email_status && (
                                  <div className="text-xs text-muted-foreground">E-mail: {item.payout_email_status}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">Bez dokladu</span>
                            )}
                          </TableCell>
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
