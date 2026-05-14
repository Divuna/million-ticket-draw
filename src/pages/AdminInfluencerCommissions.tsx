/**
 * INFLUENCER SYSTEM (Admin Commissions) — Monetary CZK payouts, invoiced, admin-controlled.
 * Overview of influencer_commissions with partner name joins and status management.
 * ⚠️  Intentionally separate from the Player referral system. MUST NOT be unified.
 */
import React, { useEffect, useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AlertCircle, CheckCircle, Clock, Info, Loader2, RefreshCw, Banknote, Download, FileDown } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { generateAboFile, downloadAboFile, type AboPaymentRow } from "@/lib/airbank-abo-export";

interface CommissionRow {
  id: string;
  influencer_partner_id: string;
  period_month: string;
  amount_czk: number;
  status: string;
  updated_at: string;
  partner_name: string;
  payout_account: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Vše" },
  { value: "calculated", label: "Vypočteno" },
  { value: "approved", label: "Schváleno" },
  { value: "paid", label: "Vyplaceno" },
] as const;

const NEXT_STATUS: Record<string, string> = {
  calculated: "approved",
  approved: "paid",
};

const ACTION_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  calculated: { label: "Schválit", icon: CheckCircle },
  approved: { label: "Označit jako vyplaceno", icon: Banknote },
};

function getStatusBadge(status: string) {
  switch (status) {
    case "calculated":
      return <Badge variant="warning">Vypočteno</Badge>;
    case "approved":
      return <Badge variant="success">Schváleno</Badge>;
    case "paid":
      return <Badge variant="info">Vyplaceno</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminInfluencerCommissions() {
  const { user } = useAuth();
  const { role, isAdmin, loading: roleLoading } = useUserRole();

  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Confirmation dialog for "paid"
  const [confirmTarget, setConfirmTarget] = useState<CommissionRow | null>(null);

  // Checkbox selection for manual export
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk confirm paid dialog
  const [confirmBulkPaid, setConfirmBulkPaid] = useState<CommissionRow[] | null>(null);
  const [bulkPaidLoading, setBulkPaidLoading] = useState(false);

  // Exported rows tracking (for "Potvrdit vyplacení" button)
  const [exportedIds, setExportedIds] = useState<Set<string>>(new Set());

  const fetchCommissions = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("influencer_commissions")
        .select("id, influencer_partner_id, period_month, amount_czk, status, updated_at")
        .order("period_month", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        setCommissions([]);
        setLoading(false);
        return;
      }

      const partnerIds = [...new Set(data.map((c) => c.influencer_partner_id))];
      const { data: partners } = await supabase
        .from("partners")
        .select("id, name, company_name, payout_account")
        .in("id", partnerIds);

      const partnerMap = new Map(
        (partners || []).map((p) => [p.id, { name: p.company_name || p.name, payout_account: p.payout_account || "" }])
      );

      const rows: CommissionRow[] = data.map((c) => ({
        ...c,
        partner_name: partnerMap.get(c.influencer_partner_id)?.name || "Neznámý",
        payout_account: partnerMap.get(c.influencer_partner_id)?.payout_account || "",
      }));

      setCommissions(rows);
    } catch (err: any) {
      setError(err.message || "Chyba při načítání dat");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchCommissions();
    }
  }, [isAdmin, statusFilter]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [commissions]);

  /* ── Unique months for bulk export ── */
  const approvedMonths = useMemo(() => {
    const months = new Set(
      commissions.filter((c) => c.status === "approved").map((c) => c.period_month)
    );
    return [...months].sort().reverse();
  }, [commissions]);

  /* ── Selection helpers ── */
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllApproved = () => {
    const approvedIds = commissions.filter((c) => c.status === "approved").map((c) => c.id);
    const allSelected = approvedIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvedIds));
    }
  };

  /* ── ABO Export ── */
  const exportRows = (rows: CommissionRow[]) => {
    const missingAccount = rows.filter((r) => !r.payout_account);
    if (missingAccount.length > 0) {
      toast.error(
        `Nelze exportovat: ${missingAccount.map((r) => r.partner_name).join(", ")} nemá vyplněný platební účet.`
      );
      return;
    }

    const paymentRows: AboPaymentRow[] = rows.map((r) => ({
      id: r.id,
      influencer_partner_id: r.influencer_partner_id,
      period_month: r.period_month,
      amount_czk: r.amount_czk,
      partner_name: r.partner_name,
      payout_account: r.payout_account,
    }));

    try {
      const abo = generateAboFile(paymentRows);
      const period = rows.length === 1 ? rows[0].period_month : "mix";
      downloadAboFile(abo, `onemil-vyplaty-${period}-${Date.now()}.kpc`);

      // Track exported IDs
      setExportedIds((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => next.add(r.id));
        return next;
      });

      toast.info("Po odeslání v bance potvrďte vyplacení.", { duration: 6000 });
    } catch (err: any) {
      toast.error(err.message || "Chyba při generování ABO souboru.");
    }
  };

  const handleBulkExportMonth = (month: string) => {
    const rows = commissions.filter((c) => c.period_month === month && c.status === "approved");
    if (rows.length === 0) {
      toast.warning("Žádné schválené provize pro tento měsíc.");
      return;
    }
    exportRows(rows);
  };

  const handleExportSelected = () => {
    const rows = commissions.filter((c) => selectedIds.has(c.id));
    if (rows.length === 0) {
      toast.warning("Nejsou vybrány žádné řádky.");
      return;
    }
    exportRows(rows);
  };

  /* ── Status transition ── */
  const handleStatusChange = async (commission: CommissionRow) => {
    const newStatus = NEXT_STATUS[commission.status];
    if (!newStatus) return;

    if (newStatus === "paid") {
      setConfirmTarget(commission);
      return;
    }

    await executeStatusChange(commission, newStatus);
  };

  const executeStatusChange = async (commission: CommissionRow, newStatus: string) => {
    setActionLoadingId(commission.id);

    const previous = [...commissions];
    const now = new Date().toISOString();
    setCommissions((prev) =>
      prev.map((c) =>
        c.id === commission.id ? { ...c, status: newStatus, updated_at: now } : c
      )
    );

    try {
      const { error } = await supabase
        .from("influencer_commissions")
        .update({ status: newStatus, updated_at: now })
        .eq("id", commission.id);

      if (error) throw error;

      toast.success(
        newStatus === "approved"
          ? "Provize schválena"
          : "Provize označena jako vyplacená"
      );
    } catch (err) {
      console.error("Error updating commission status:", err);
      setCommissions(previous);
      toast.error("Nepodařilo se aktualizovat stav provize");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmPaid = async () => {
    if (!confirmTarget) return;
    setConfirmTarget(null);
    await executeStatusChange(confirmTarget, "paid");
  };

  /* ── Bulk confirm paid (exported rows) ── */
  const exportedApprovedRows = useMemo(
    () => commissions.filter((c) => exportedIds.has(c.id) && c.status === "approved"),
    [commissions, exportedIds]
  );

  const handleBulkConfirmPaid = async () => {
    if (!confirmBulkPaid || confirmBulkPaid.length === 0) return;
    setBulkPaidLoading(true);

    const now = new Date().toISOString();
    const ids = confirmBulkPaid.map((c) => c.id);
    const previous = [...commissions];

    setCommissions((prev) =>
      prev.map((c) => (ids.includes(c.id) ? { ...c, status: "paid", updated_at: now } : c))
    );

    try {
      const { error } = await supabase
        .from("influencer_commissions")
        .update({ status: "paid", updated_at: now })
        .in("id", ids);

      if (error) throw error;

      setExportedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      toast.success(`${ids.length} provizí označeno jako vyplacené`);
    } catch (err) {
      console.error("Error bulk-updating commission status:", err);
      setCommissions(previous);
      toast.error("Nepodařilo se hromadně aktualizovat stav");
    } finally {
      setBulkPaidLoading(false);
      setConfirmBulkPaid(null);
    }
  };

  /* ── Guards ── */
  if (!user) return <NavigateToLogin />;

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Načítám...</p>
        </div>
      </div>
    );
  }

  if (role !== "admin" && role !== "superadmin") return <Navigate to="/" replace />;

  const approvedInTable = commissions.filter((c) => c.status === "approved");
  const allApprovedSelected = approvedInTable.length > 0 && approvedInTable.every((c) => selectedIds.has(c.id));

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Výplaty Affiliate partnerů</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Přehled automaticky vypočtených Affiliate provizí
        </p>
      </div>

      {/* Automation status info */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Stav automatizace</p>
            <p className="text-sm text-muted-foreground mt-1">
              Automatický výpočet provizí běží denně ve 02:00 CET (pg_cron).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* XML Export section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileDown className="w-5 h-5" />
            Export ABO (CZK) pro Air Bank
          </CardTitle>
          <CardDescription>
            Hromadný export schválených provizí ve formátu ABO (.kpc) pro import do Air Bank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bulk export by month */}
          {approvedMonths.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Export celého měsíce (schválené):</p>
              <div className="flex flex-wrap gap-2">
                {approvedMonths.map((month) => (
                  <Button
                    key={month}
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkExportMonth(month)}
                    className="gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {format(new Date(month), "LLLL yyyy", { locale: cs })}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Žádné schválené provize k exportu.</p>
          )}

          {/* Manual export selected */}
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleExportSelected}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export ABO (vybrané: {selectedIds.size})
            </Button>
            {selectedIds.size > 0 && (
              <span className="text-xs text-muted-foreground">
                Celkem: {commissions
                  .filter((c) => selectedIds.has(c.id))
                  .reduce((s, c) => s + c.amount_czk, 0)
                  .toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč
              </span>
            )}
          </div>

          {/* Confirm paid after export */}
          {exportedApprovedRows.length > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button
                variant="default"
                size="sm"
                onClick={() => setConfirmBulkPaid(exportedApprovedRows)}
                className="gap-1.5"
              >
                <Banknote className="w-3.5 h-3.5" />
                Potvrdit vyplacení ({exportedApprovedRows.length})
              </Button>
              <span className="text-xs text-muted-foreground">
                Po odeslání v bance potvrďte vyplacení.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters & refresh */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Seznam provizí</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchCommissions} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Obnovit
            </Button>
          </div>
          <CardDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {STATUS_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={statusFilter === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(opt.value)}
                  className="text-xs"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 text-destructive mb-4 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : commissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Žádné provize k zobrazení</p>
              {statusFilter !== "all" && (
                <p className="text-xs mt-1">Zkuste změnit filtr stavu</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allApprovedSelected && approvedInTable.length > 0}
                        onCheckedChange={toggleAllApproved}
                        aria-label="Vybrat vše"
                      />
                    </TableHead>
                    <TableHead>Affiliate partner</TableHead>
                    <TableHead>Období</TableHead>
                    <TableHead className="text-right">Částka (CZK)</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Účet</TableHead>
                    <TableHead>Aktualizováno</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => {
                    const nextStatus = NEXT_STATUS[c.status];
                    const actionMeta = ACTION_LABELS[c.status];
                    const isLoading = actionLoadingId === c.id;
                    const isApproved = c.status === "approved";

                    return (
                      <TableRow key={c.id} data-state={selectedIds.has(c.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSelection(c.id)}
                            disabled={!isApproved}
                            aria-label={`Vybrat ${c.partner_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{c.partner_name}</TableCell>
                        <TableCell>
                          {format(new Date(c.period_month), "LLLL yyyy", { locale: cs })}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(c.amount_czk).toLocaleString("cs-CZ", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>{getStatusBadge(c.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={c.payout_account}>
                          {c.payout_account || <span className="text-destructive">chybí</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(c.updated_at), "d. M. yyyy HH:mm", { locale: cs })}
                        </TableCell>
                        <TableCell className="text-right">
                          {nextStatus && actionMeta ? (
                            <Button
                              variant={nextStatus === "paid" ? "default" : "outline"}
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleStatusChange(c)}
                              className="gap-1.5"
                            >
                              {isLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <actionMeta.icon className="w-3.5 h-3.5" />
                              )}
                              {actionMeta.label}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
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

      {/* Confirmation dialog for marking single as paid */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Označit provizi jako vyplacenou?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && (
                <>
                  Potvrzujete výplatu provize{" "}
                  <span className="font-semibold">
                    {Number(confirmTarget.amount_czk).toLocaleString("cs-CZ")} Kč
                  </span>{" "}
                  pro Affiliate partnera{" "}
                  <span className="font-semibold">{confirmTarget.partner_name}</span>{" "}
                  za období{" "}
                  <span className="font-semibold">
                    {format(new Date(confirmTarget.period_month), "LLLL yyyy", { locale: cs })}
                  </span>
                  . Tuto akci nelze vrátit zpět.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPaid}>
              Potvrdit výplatu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for bulk confirm paid */}
      <AlertDialog open={!!confirmBulkPaid} onOpenChange={(open) => !open && setConfirmBulkPaid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potvrdit hromadné vyplacení?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulkPaid && (
                <>
                  Označíte{" "}
                  <span className="font-semibold">{confirmBulkPaid.length} provizí</span>{" "}
                  v celkové výši{" "}
                  <span className="font-semibold">
                    {confirmBulkPaid
                      .reduce((s, c) => s + c.amount_czk, 0)
                      .toLocaleString("cs-CZ")} Kč
                  </span>{" "}
                  jako vyplacené. Tuto akci nelze vrátit zpět.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPaidLoading}>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkConfirmPaid} disabled={bulkPaidLoading}>
              {bulkPaidLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Potvrdit vyplacení
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
