/**
 * AdminAffiliateCommissions — správa provizí obchodníků
 *
 * Zobrazuje B2B provize obchodníků z affiliate_commissions kde commission_type = 'company_invoice'.
 * Vyplacení probíhá přes platební dávky, ne tlačítkem u jednotlivé provize.
 * Provize se počítají automaticky 2. každého měsíce (pg_cron job 25).
 *
 * RPC: admin_set_affiliate_commission_status(p_commission_id uuid, p_new_status text) → jsonb
 *   SECURITY DEFINER, is_admin() guard, FOR UPDATE lock
 *   Povolený přechod v tomto UI: calculated→approved. Vyplacení řeší payout batch RPC.
 *   Vrací: {status:'updated'|'forbidden'|'not_found'|'invalid_transition'|'invalid_status', ...}
 *
 * Skutečné sloupce affiliate_commissions (ověřeno na produkci):
 *   id, affiliate_id, commission_type, customer_ref_id, company_ref_id, source_invoice_id,
 *   period_month, amount_base_czk (čistá provize), vat_rate, amount_total_czk (včetně DPH),
 *   status, created_at, updated_at, paid_at
 *
 * Skutečné sloupce affiliate_accounts (ověřeno na produkci):
 *   id, auth_user_id, name (NE full_name), ref_code, ...
 */
import React, { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Info, RefreshCw, Banknote, CheckCircle, Loader2, PackagePlus, FileText } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommissionRow {
  id: string;
  affiliate_id: string;
  payout_document_id: string | null;
  payout_batch_id: string | null;
  commission_type: string;
  period_month: string | null;
  amount_base_czk: number;
  vat_rate: number | null;
  amount_total_czk: number;
  source_invoice_id: string | null;
  company_ref_id: string | null;
  status: string;
  created_at: string;
  // joined — obchodník
  affiliate_name: string | null;
  affiliate_ref_code: string | null;
  commission_rate_company: number | null;
  // joined — platební údaje příjemce (OneMil → obchodník)
  payout_account: string | null;
  payout_bank: string | null;
  affiliate_ico: string | null;
  affiliate_vat_id: string | null;
  affiliate_is_vat_payer: boolean | null;
  payout_document_number: string | null;
  payout_document_type: string | null;
  payout_pdf_storage_path: string | null;
  payout_pdf_generated_at: string | null;
  payout_email_status: string | null;
  // joined — firma + faktura (zdroj výpočtu)
  company_name: string | null;
  invoice_number: string | null;
  invoice_base_ex_vat: number | null;
  invoice_vat_amount: number | null;
  invoice_total_inc_vat: number | null;
}

type PendingAction = {
  id: string;
  newStatus: "approved";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "calculated":
      return <Badge variant="warning">Vypočteno</Badge>;
    case "approved":
      return <Badge variant="success">Schváleno</Badge>;
    case "payout_document_created":
      return <Badge variant="outline">Doklad vytvořen</Badge>;
    case "ready_to_pay":
      return <Badge variant="warning">Připraveno k dávce</Badge>;
    case "in_payment_batch":
      return <Badge variant="info">V dávce</Badge>;
    case "paid":
      return <Badge variant="info">Vyplaceno</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function payoutDocumentBadge(row: CommissionRow) {
  if (!row.payout_document_number) {
    return <Badge variant="outline">Bez dokladu</Badge>;
  }

  if (row.payout_pdf_storage_path && row.payout_email_status) {
    return <Badge variant="success">PDF + e-mail</Badge>;
  }

  if (row.payout_pdf_storage_path) {
    return <Badge variant="warning">PDF připraveno</Badge>;
  }

  return <Badge variant="outline">Doklad bez PDF</Badge>;
}

function formatMonth(isoDate: string | null): string {
  if (!isoDate) return "—";
  try {
    return format(new Date(isoDate), "LLLL yyyy", { locale: cs });
  } catch {
    return isoDate;
  }
}

function formatCzk(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value} %`;
}

/** Když vazba/údaj chybí, ukaž jednotné „Neuvedeno" — nic nehádáme. */
function Neuvedeno() {
  return <span className="text-muted-foreground text-xs italic">Neuvedeno</span>;
}

function lastMonths(n: number): { label: string; value: string }[] {
  const result: { label: string; value: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = startOfMonth(subMonths(new Date(), i));
    result.push({
      label: format(d, "LLLL yyyy", { locale: cs }),
      value: format(d, "yyyy-MM-dd"),
    });
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminAffiliateCommissions() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // commission id being updated
  const [documentLoading, setDocumentLoading] = useState<string | null>(null);
  const [batchCreating, setBatchCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Potvrzovací dialog
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Filtry
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAffiliate, setFilterAffiliate] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");

  const monthOptions = useMemo(() => lastMonths(12), []);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: commissions, error: commErr } = await supabase
        .from("affiliate_commissions")
        .select(
          `id,
           affiliate_id,
           payout_document_id,
           payout_batch_id,
           commission_type,
           period_month,
           amount_base_czk,
           vat_rate,
           amount_total_czk,
           source_invoice_id,
           company_ref_id,
           status,
           created_at,
           affiliate_accounts!affiliate_commissions_affiliate_id_fkey(
             name,
             ref_code,
             commission_rate_company,
             payout_account,
             payout_bank,
             ico,
             vat_id,
             is_vat_payer
           )`
        )
        .eq("commission_type", "company_invoice")
        .order("created_at", { ascending: false });

      if (commErr) throw commErr;

      if (!commissions || commissions.length === 0) {
        setRows([]);
        return;
      }

      const invoiceIds = commissions.map((r: any) => r.source_invoice_id).filter(Boolean) as string[];
      const refIds = commissions.map((r: any) => r.company_ref_id).filter(Boolean) as string[];

      // Detail faktury (zdroj výpočtu provize): firma, č. faktury, základ, DPH, celkem.
      interface InvoiceDetail {
        company: string;
        invoice_number: string | null;
        amount_ex_vat: number | null;
        vat_amount: number | null;
        amount_inc_vat: number | null;
      }
      const invoiceDetailMap: Record<string, InvoiceDetail> = {};
      if (invoiceIds.length > 0) {
        const { data: invData } = await supabase
          .from("partner_invoices")
          .select(
            "id, partner_id, invoice_number, amount_ex_vat, vat_amount, amount_inc_vat, partners!partner_invoices_partner_id_fkey(company_name, name)"
          )
          .in("id", invoiceIds);
        for (const inv of invData ?? []) {
          const p = (inv as any).partners;
          invoiceDetailMap[(inv as any).id] = {
            company: p ? (p.company_name || p.name || "Neuvedeno") : "Neuvedeno",
            invoice_number: (inv as any).invoice_number ?? null,
            amount_ex_vat: (inv as any).amount_ex_vat ?? null,
            vat_amount: (inv as any).vat_amount ?? null,
            amount_inc_vat: (inv as any).amount_inc_vat ?? null,
          };
        }
      }

      const refPartnerMap: Record<string, string> = {};
      if (refIds.length > 0) {
        const { data: refData } = await supabase
          .from("affiliate_company_refs")
          .select("id, partner_id, partners!affiliate_company_refs_partner_id_fkey(company_name, name)")
          .in("id", refIds);
        for (const ref of refData ?? []) {
          const p = (ref as any).partners;
          if (p) refPartnerMap[ref.id] = p.company_name || p.name || "Neuvedeno";
        }
      }

      const commissionIds = commissions.map((r: any) => r.id).filter(Boolean) as string[];
      const payoutDocumentMap: Record<string, any> = {};
      if (commissionIds.length > 0) {
        const { data: docData, error: docError } = await (supabase as any)
          .from("affiliate_payout_documents")
          .select("commission_id,document_number,document_type,pdf_storage_path,pdf_generated_at,email_status")
          .in("commission_id", commissionIds);
        if (docError) {
          console.warn("affiliate_payout_documents fetch skipped:", docError.message);
        }
        for (const doc of docData ?? []) {
          payoutDocumentMap[doc.commission_id] = doc;
        }
      }

      const result: CommissionRow[] = commissions.map((r: any) => {
        const aa = r.affiliate_accounts;
        const inv = r.source_invoice_id ? invoiceDetailMap[r.source_invoice_id] : undefined;
        const doc = payoutDocumentMap[r.id];
        // Firma: primárně z faktury (zdroj výpočtu), fallback z atribuce. Nikdy nehádat.
        let companyName: string | null = null;
        if (inv) {
          companyName = inv.company;
        } else if (r.company_ref_id && refPartnerMap[r.company_ref_id]) {
          companyName = refPartnerMap[r.company_ref_id];
        }
        return {
          id: r.id,
          affiliate_id: r.affiliate_id,
          payout_document_id: r.payout_document_id ?? null,
          payout_batch_id: r.payout_batch_id ?? null,
          commission_type: r.commission_type,
          period_month: r.period_month,
          amount_base_czk: r.amount_base_czk ?? 0,
          vat_rate: r.vat_rate,
          amount_total_czk: r.amount_total_czk ?? 0,
          source_invoice_id: r.source_invoice_id,
          company_ref_id: r.company_ref_id,
          status: r.status,
          created_at: r.created_at,
          affiliate_name: aa?.name ?? null,
          affiliate_ref_code: aa?.ref_code ?? null,
          commission_rate_company: aa?.commission_rate_company ?? null,
          payout_account: aa?.payout_account ?? null,
          payout_bank: aa?.payout_bank ?? null,
          affiliate_ico: aa?.ico ?? null,
          affiliate_vat_id: aa?.vat_id ?? null,
          affiliate_is_vat_payer: aa?.is_vat_payer ?? null,
          payout_document_number: doc?.document_number ?? null,
          payout_document_type: doc?.document_type ?? null,
          payout_pdf_storage_path: doc?.pdf_storage_path ?? null,
          payout_pdf_generated_at: doc?.pdf_generated_at ?? null,
          payout_email_status: doc?.email_status ?? null,
          company_name: companyName,
          invoice_number: inv?.invoice_number ?? null,
          invoice_base_ex_vat: inv?.amount_ex_vat ?? null,
          invoice_vat_amount: inv?.vat_amount ?? null,
          invoice_total_inc_vat: inv?.amount_inc_vat ?? null,
        };
      });

      setRows(result);
    } catch (err: any) {
      console.error("AdminAffiliateCommissions fetch error:", err);
      toast.error("Nepodařilo se načíst provize obchodníků.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ─── Action — volání RPC ─────────────────────────────────────────────────────

  const executeAction = async (commissionId: string, newStatus: "approved") => {
    setActionLoading(commissionId);
    try {
      const rpcArgs: Record<string, unknown> = {
        p_commission_id: commissionId,
        p_new_status: newStatus,
      };

      const { data, error } = await supabase.rpc("admin_set_affiliate_commission_status", rpcArgs);

      if (error) throw error;

      const result = data as { status: string; from?: string; to?: string };

      if (result?.status === "updated") {
        toast.success("Provize byla schválena.");
        setRows((prev) =>
          prev.map((r) => (r.id === commissionId ? { ...r, status: newStatus } : r))
        );
        fetchData(true);
        setPendingAction(null);
      } else {
        // Konkrétní hlášky pro nové guardy RPC
        const map: Record<string, string> = {
          forbidden: "Nemáte oprávnění tuto akci provést.",
          invalid_transition: "Tento přechod stavu není povolen.",
          not_found: "Provize nebyla nalezena.",
        };
        const msg = map[result?.status ?? ""] ?? "Provizi se nepodařilo aktualizovat.";
        console.error("admin_set_affiliate_commission_status result:", result);
        toast.error(msg);
      }
    } catch (err: any) {
      console.error("admin_set_affiliate_commission_status error:", err);
      toast.error("Provizi se nepodařilo aktualizovat.");
    } finally {
      setActionLoading(null);
    }
  };

  const createPayoutDocument = async (commissionId: string) => {
    setDocumentLoading(commissionId);
    try {
      const { data, error } = await supabase.functions.invoke("create-affiliate-payout-document", {
        body: { commission_id: commissionId },
      });

      if (error) throw error;

      const result = data as {
        success?: boolean;
        status?: string;
        document_number?: string;
        error?: string;
      };

      if (result?.success && result.status === "created") {
        toast.success(`Payout doklad ${result.document_number ?? ""} byl vytvořen.`);
        fetchData(true);
        return;
      }

      const map: Record<string, string> = {
        missing_accounting_email: "Chybí settings.accounting_email.",
        invalid_commission_status: "Doklad lze vytvořit jen pro schválenou provizi.",
        missing_recipient_name: "Provizi chybí jméno příjemce.",
        missing_recipient_email: "Provizi chybí e-mail příjemce.",
        missing_recipient_vat_id: "Plátci DPH chybí DIČ.",
        invalid_amount: "Provize má neplatnou částku.",
        payout_document_already_linked: "Provize už má payout doklad.",
      };
      toast.error(map[result?.error ?? result?.status ?? ""] ?? "Payout doklad se nepodařilo vytvořit.");
    } catch (err) {
      console.error("create-affiliate-payout-document error:", err);
      toast.error("Payout doklad se nepodařilo vytvořit.");
    } finally {
      setDocumentLoading(null);
    }
  };

  const createPayoutBatch = async () => {
    if (selectedIds.length === 0) {
      toast.error("Vyberte alespoň jednu provizi připravenou k dávce.");
      return;
    }

    setBatchCreating(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_affiliate_payout_batch", {
        p_commission_ids: selectedIds,
      });

      if (error) throw error;

      const result = data as {
        status?: string;
        batch_id?: string;
        batch_number?: string;
        item_count?: number;
      };

      if (result?.status === "created" && result.batch_id) {
        toast.success(`Platební dávka ${result.batch_number ?? ""} byla vytvořena.`);
        setSelectedIds([]);
        navigate(`/admin/affiliate-payouts/${result.batch_id}`);
        return;
      }

      const map: Record<string, string> = {
        empty_selection: "Vyberte alespoň jednu provizi.",
        invalid_commission_status: "Některá provize už není připravená k dávce.",
        already_in_batch: "Některá provize už je v jiné dávce.",
        invalid_amount: "Některá provize má neplatnou částku.",
        missing_recipient_name: "Některé provizi chybí příjemce.",
        missing_recipient_account: "Některé provizi chybí účet příjemce.",
        invalid_recipient_account: "Některá provize má neplatný tvar účtu příjemce.",
        missing_recipient_bank_code: "Některé provizi chybí kód banky.",
        invalid_recipient_bank_code: "Některá provize má neplatný kód banky příjemce.",
        forbidden: "Nemáte oprávnění vytvořit dávku.",
      };
      toast.error(map[result?.status ?? ""] ?? "Platební dávku se nepodařilo vytvořit.");
    } catch (err) {
      console.error("create_affiliate_payout_batch error:", err);
      toast.error("Platební dávku se nepodařilo vytvořit.");
    } finally {
      setBatchCreating(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !roleLoading && isAdmin) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, roleLoading, isAdmin]);

  // ─── Auth guards ────────────────────────────────────────────────────────────

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

  // ─── Filtered rows ──────────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterAffiliate !== "all" && r.affiliate_id !== filterAffiliate) return false;
    if (filterMonth !== "all") {
      const rowMonth = (r.period_month ?? "").substring(0, 7);
      const selMonth = filterMonth.substring(0, 7);
      if (rowMonth !== selMonth) return false;
    }
    return true;
  });

  const affiliateOptions = Array.from(
    new Map(rows.map((r) => [r.affiliate_id, r.affiliate_name ?? r.affiliate_id])).entries()
  );

  // ─── Dialog texts ────────────────────────────────────────────────────────────

  const readyRows = filtered.filter((r) => r.status === "ready_to_pay" && !r.payout_batch_id);
  const allReadySelected =
    readyRows.length > 0 && readyRows.every((r) => selectedIds.includes(r.id));

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );
  };

  const toggleAllReady = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !readyRows.some((r) => r.id === id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...readyRows.map((r) => r.id)])));
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Potvrzovací dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) { setPendingAction(null); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Schválit provizi?</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete schválit tuto provizi? Stav se změní z Vypočteno na Schváleno. Tato akce je nevratná.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!actionLoading}
              onClick={(e) => {
                if (pendingAction) {
                  executeAction(pendingAction.id, pendingAction.newStatus);
                }
              }}
            >
              {actionLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Schvaluji…</>
              ) : (
                "Schválit"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" />
            Provize obchodníků
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            B2B provize z uhrazených faktur firem (<code>commission_type = company_invoice</code>)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-400" />
        <span>
          Provize se počítají z uhrazených faktur firem. Automatický výpočet běží každý měsíc (2.
          v měsíci 03:00 UTC). Pokud žádné záznamy nevidíš, buď ještě neproběhl výpočet, nebo za
          dané období nebyly žádné zaplacené faktury.
        </span>
      </div>

      {/* Filtry */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Stav" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny stavy</SelectItem>
                <SelectItem value="calculated">Vypočteno</SelectItem>
                <SelectItem value="approved">Schváleno</SelectItem>
                <SelectItem value="payout_document_created">Doklad vytvořen</SelectItem>
                <SelectItem value="ready_to_pay">Připraveno k dávce</SelectItem>
                <SelectItem value="in_payment_batch">V dávce</SelectItem>
                <SelectItem value="paid">Vyplaceno</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterAffiliate} onValueChange={setFilterAffiliate}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Obchodník" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všichni obchodníci</SelectItem>
                {affiliateOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Měsíc" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny měsíce</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filterStatus !== "all" || filterAffiliate !== "all" || filterMonth !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStatus("all");
                  setFilterAffiliate("all");
                  setFilterMonth("all");
                }}
              >
                Zrušit filtry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabulka */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Provize
            {filtered.length !== rows.length && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                ({filtered.length} z {rows.length})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Status flow: Vypočteno → Schválit → doklad → připraveno k dávce → platební dávka → vyplaceno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-3">
            <div className="text-sm text-muted-foreground">
              Vybráno <span className="font-semibold text-foreground">{selectedIds.length}</span> provizí pro platební dávku.
            </div>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={selectedIds.length === 0 || batchCreating}
              onClick={createPayoutBatch}
              data-testid="btn-create-affiliate-payout-batch"
            >
              {batchCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="h-4 w-4" />
              )}
              Vytvořit platební dávku
            </Button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {rows.length === 0
                ? "Žádné B2B provize obchodníků zatím nebyly vypočítány."
                : "Žádné záznamy neodpovídají zvoleným filtrům."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        aria-label="Vybrat všechny provize připravené k dávce"
                        checked={allReadySelected}
                        onCheckedChange={(checked) => toggleAllReady(checked === true)}
                        data-testid="checkbox-select-all-ready-commissions"
                      />
                    </TableHead>
                    <TableHead>Měsíc</TableHead>
                    <TableHead>Obchodník</TableHead>
                    <TableHead>Ref kód</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>Č. faktury</TableHead>
                    <TableHead className="text-right">Faktura zákl. (bez DPH)</TableHead>
                    <TableHead className="text-right">Faktura DPH</TableHead>
                    <TableHead className="text-right">Faktura celkem</TableHead>
                    <TableHead className="text-right">Sazba</TableHead>
                    <TableHead className="text-right">Provize zákl.</TableHead>
                    <TableHead className="text-right">Provize DPH</TableHead>
                    <TableHead className="text-right">Provize celkem</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Doklad</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                    <TableHead className="text-center">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const vatAmount = row.amount_total_czk - row.amount_base_czk;
                    const vatLabel = row.vat_rate != null
                      ? `DPH ${Math.round(row.vat_rate * 100)} %`
                      : "DPH";
                    const isActioning = actionLoading === row.id;
                    const canSelectForBatch = row.status === "ready_to_pay" && !row.payout_batch_id;

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-center">
                          {canSelectForBatch ? (
                            <Checkbox
                              aria-label={`Vybrat provizi ${row.id}`}
                              checked={selectedIds.includes(row.id)}
                              onCheckedChange={(checked) => toggleSelected(row.id, checked === true)}
                              data-testid={`checkbox-payout-commission-${row.id}`}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatMonth(row.period_month)}
                        </TableCell>
                        <TableCell>
                          {row.affiliate_name ?? (
                            <span className="text-muted-foreground text-xs">{row.affiliate_id.slice(0, 8)}…</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.affiliate_ref_code ? (
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {row.affiliate_ref_code}
                            </code>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.company_name ?? <Neuvedeno />}
                        </TableCell>
                        {/* Zdroj výpočtu — faktura firmy */}
                        <TableCell>
                          {row.invoice_number ? (
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{row.invoice_number}</code>
                          ) : (
                            <Neuvedeno />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.invoice_base_ex_vat != null ? formatCzk(row.invoice_base_ex_vat) : <Neuvedeno />}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {row.invoice_vat_amount != null ? formatCzk(row.invoice_vat_amount) : <Neuvedeno />}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.invoice_total_inc_vat != null ? formatCzk(row.invoice_total_inc_vat) : <Neuvedeno />}
                        </TableCell>
                        {/* Sazba provize obchodníka */}
                        <TableCell className="text-right font-mono text-sm">
                          {formatPercent(row.commission_rate_company)}
                        </TableCell>
                        {/* Vypočtená provize */}
                        <TableCell className="text-right font-mono text-sm">
                          {formatCzk(row.amount_base_czk)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground" title={vatLabel}>
                          {formatCzk(vatAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCzk(row.amount_total_czk)}
                        </TableCell>
                        <TableCell>{statusBadge(row.status)}</TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-36">
                            {payoutDocumentBadge(row)}
                            {row.payout_document_number && (
                              <div className="font-mono text-xs">{row.payout_document_number}</div>
                            )}
                            {row.payout_email_status && (
                              <div className="text-xs text-muted-foreground">E-mail: {row.payout_email_status}</div>
                            )}
                            {row.payout_pdf_storage_path && (
                              <div
                                className="max-w-44 truncate text-xs text-muted-foreground"
                                title={row.payout_pdf_storage_path}
                              >
                                PDF: storage
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {format(new Date(row.created_at), "d. M. yyyy HH:mm", { locale: cs })}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.status === "calculated" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              disabled={isActioning}
                              data-testid={`btn-approve-${row.id}`}
                              onClick={() => setPendingAction({ id: row.id, newStatus: "approved" })}
                            >
                              {isActioning ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              Schválit
                            </Button>
                          )}
                          {row.status === "approved" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs"
                                disabled={documentLoading === row.id}
                                data-testid={`btn-create-payout-document-${row.id}`}
                                onClick={() => createPayoutDocument(row.id)}
                              >
                                {documentLoading === row.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <FileText className="h-3 w-3" />
                                )}
                                Vytvořit doklad
                              </Button>
                              <span className="sr-only">Čeká na doklad</span>
                            </>
                          )}
                          {row.status === "payout_document_created" && (
                            <span className="text-muted-foreground text-xs">Čeká na zařazení</span>
                          )}
                          {row.status === "ready_to_pay" && (
                            <span className="text-muted-foreground text-xs">Vybrat vlevo</span>
                          )}
                          {row.status === "in_payment_batch" && (
                            <span className="text-muted-foreground text-xs">V dávce</span>
                          )}
                          {row.status === "paid" && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
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
  );
}
