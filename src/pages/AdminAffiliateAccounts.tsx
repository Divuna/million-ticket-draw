/**
 * AFFILIATE v2 (Admin) — read + status workflow over the standalone affiliate model.
 * Reads:  affiliate_accounts, affiliate_commissions (staging DB layer, steps 1–4).
 * Writes: ONLY via RPC admin_set_affiliate_commission_status (calculated→approved→paid).
 *
 * Intentionally separate from the legacy influencer pages (partners table).
 * Does not touch customer accounts, Partner portal, payments, tickets, contests,
 * wallet, or buy_ticket_atomic.
 *
 * NOTE: affiliate_* tables are not yet in generated Supabase types (staging-only),
 * so queries use `(supabase as any)` casts on purpose.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Eye, CheckCircle, Banknote, Loader2, Megaphone, Briefcase, Users } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

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
  created_at: string;
}

interface CommissionRow {
  id: string;
  affiliate_id: string;
  commission_type: string;
  period_month: string | null;
  amount_base_czk: number;
  vat_rate: number;
  amount_total_czk: number;
  status: string;
  paid_at: string | null;
}

interface AccountAgg {
  calculatedCount: number;
  calculatedTotal: number;
  approvedTotal: number;
  paidTotal: number;
}

const NEXT_STATUS: Record<string, string> = { calculated: "approved", approved: "paid" };

function statusBadge(status: string) {
  switch (status) {
    case "pending":   return <Badge variant="warning">Čeká</Badge>;
    case "approved":  return <Badge variant="success">Schváleno</Badge>;
    case "suspended": return <Badge variant="outline">Pozastaveno</Badge>;
    case "rejected":  return <Badge variant="destructive">Zamítnuto</Badge>;
    default:          return <Badge variant="outline">{status}</Badge>;
  }
}

function commissionStatusBadge(status: string) {
  switch (status) {
    case "calculated": return <Badge variant="warning">Vypočteno</Badge>;
    case "approved":   return <Badge variant="success">Schváleno</Badge>;
    case "paid":       return <Badge variant="info">Vyplaceno</Badge>;
    default:           return <Badge variant="outline">{status}</Badge>;
  }
}

const czk = (n: number) => `${(n ?? 0).toLocaleString("cs-CZ")} Kč`;

const AdminAffiliateAccounts = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  const [accounts, setAccounts] = useState<AffiliateAccount[]>([]);
  const [aggByAffiliate, setAggByAffiliate] = useState<Map<string, AccountAgg>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail dialog
  const [detailAccount, setDetailAccount] = useState<AffiliateAccount | null>(null);
  const [detailRows, setDetailRows] = useState<CommissionRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmPaid, setConfirmPaid] = useState<CommissionRow | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: accData, error: accErr } = await (supabase as any)
        .from("affiliate_accounts")
        .select("id, name, email, ref_code, modes, status, commission_rate_customer, commission_rate_company, is_vat_payer, created_at")
        .order("created_at", { ascending: false });
      if (accErr) throw accErr;

      const { data: commData, error: commErr } = await (supabase as any)
        .from("affiliate_commissions")
        .select("affiliate_id, amount_total_czk, status");
      if (commErr) throw commErr;

      const agg = new Map<string, AccountAgg>();
      for (const c of (commData || []) as Array<{ affiliate_id: string; amount_total_czk: number; status: string }>) {
        const a = agg.get(c.affiliate_id) || { calculatedCount: 0, calculatedTotal: 0, approvedTotal: 0, paidTotal: 0 };
        if (c.status === "calculated") { a.calculatedCount += 1; a.calculatedTotal += Number(c.amount_total_czk) || 0; }
        else if (c.status === "approved") { a.approvedTotal += Number(c.amount_total_czk) || 0; }
        else if (c.status === "paid") { a.paidTotal += Number(c.amount_total_czk) || 0; }
        agg.set(c.affiliate_id, a);
      }

      setAccounts((accData || []) as AffiliateAccount[]);
      setAggByAffiliate(agg);
    } catch (err: any) {
      console.error("Error loading affiliate accounts:", err);
      setError(err.message || "Chyba při načítání affiliate účtů");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (role === "admin" || role === "superadmin") fetchData(); }, [role, fetchData]);

  const openDetail = async (account: AffiliateAccount) => {
    setDetailAccount(account);
    setDetailLoading(true);
    setDetailRows([]);
    try {
      const { data, error: err } = await (supabase as any)
        .from("affiliate_commissions")
        .select("id, affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status, paid_at")
        .eq("affiliate_id", account.id)
        .order("period_month", { ascending: false });
      if (err) throw err;
      setDetailRows((data || []) as CommissionRow[]);
    } catch (err: any) {
      toast.error(err.message || "Nepodařilo se načíst provize");
    } finally {
      setDetailLoading(false);
    }
  };

  const runStatusChange = async (row: CommissionRow, newStatus: string) => {
    setActionLoadingId(row.id);
    try {
      const { data, error: err } = await (supabase as any).rpc("admin_set_affiliate_commission_status", {
        p_commission_id: row.id,
        p_new_status: newStatus,
      });
      if (err) throw err;

      const status = (data as any)?.status;
      if (status === "updated") {
        toast.success(newStatus === "approved" ? "Provize schválena" : "Provize označena jako vyplacená");
        setDetailRows((prev) => prev.map((r) =>
          r.id === row.id ? { ...r, status: newStatus, paid_at: newStatus === "paid" ? new Date().toISOString() : r.paid_at } : r
        ));
        fetchData();
      } else if (status === "forbidden") {
        toast.error("Nemáte oprávnění k této akci");
      } else if (status === "invalid_transition") {
        toast.error("Neplatný přechod stavu");
      } else {
        toast.error(`Nepodařilo se změnit stav (${status ?? "neznámá chyba"})`);
      }
    } catch (err: any) {
      console.error("Error changing commission status:", err);
      toast.error(err.message || "Nepodařilo se změnit stav provize");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAction = (row: CommissionRow) => {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    if (next === "paid") { setConfirmPaid(row); return; }
    runStatusChange(row, next);
  };

  /* ── Guards ── */
  if (!user) return <NavigateToLogin />;
  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-2 text-muted-foreground">Načítám...</p>
        </div>
      </div>
    );
  }
  if (role !== "admin" && role !== "superadmin") return <Navigate to="/" replace />;

  const totalCalculatedCount = accounts.reduce((s, a) => s + (aggByAffiliate.get(a.id)?.calculatedCount || 0), 0);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Affiliate účty (v2)</h1>
          <p className="text-sm text-muted-foreground">
            Samostatný affiliate model — účty, režimy, provize a workflow schválení/výplaty.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums">{accounts.length}</p>
          <p className="text-xs text-muted-foreground">Affiliate účtů</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums text-green-600">
            {accounts.filter((a) => a.status === "approved").length}
          </p>
          <p className="text-xs text-muted-foreground">Schválených účtů</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums text-amber-600">{totalCalculatedCount}</p>
          <p className="text-xs text-muted-foreground">Provizí ke schválení (calculated)</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Affiliate účty ({accounts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Načítám…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Zatím žádné affiliate účty.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jméno</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Ref kód</TableHead>
                    <TableHead>Režimy</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead className="text-right">Ke schválení</TableHead>
                    <TableHead className="text-right">Schváleno (CZK)</TableHead>
                    <TableHead className="text-right">Vyplaceno (CZK)</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => {
                    const agg = aggByAffiliate.get(a.id);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                        <TableCell><span className="font-mono text-xs">{a.ref_code}</span></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {a.modes?.includes("influencer") && (
                              <Badge variant="outline" className="text-xs"><Megaphone className="w-3 h-3 mr-1" />Influencer</Badge>
                            )}
                            {a.modes?.includes("sales_rep") && (
                              <Badge variant="outline" className="text-xs"><Briefcase className="w-3 h-3 mr-1" />Obchodník</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(a.status)}</TableCell>
                        <TableCell className="text-right">
                          {agg?.calculatedCount ? (
                            <Badge variant="warning" className="tabular-nums">{agg.calculatedCount}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{czk(agg?.approvedTotal || 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{czk(agg?.paidTotal || 0)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openDetail(a)} title="Detail provizí">
                            <Eye className="w-4 h-4" />
                          </Button>
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

      {/* Detail dialog */}
      <Dialog open={!!detailAccount} onOpenChange={(o) => { if (!o) setDetailAccount(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Provize — {detailAccount?.name}{" "}
              <span className="font-mono text-xs text-muted-foreground">({detailAccount?.ref_code})</span>
            </DialogTitle>
          </DialogHeader>
          {detailAccount && (
            <p className="text-xs text-muted-foreground -mt-2 mb-2">
              Sazby: zákazníci {detailAccount.commission_rate_customer} % · firmy {detailAccount.commission_rate_company} %
              {detailAccount.is_vat_payer ? " · plátce DPH" : " · neplátce DPH"}
            </p>
          )}
          {detailLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Načítám provize…</p>
          ) : detailRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Žádné provize.</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Měsíc</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead className="text-right">Základ</TableHead>
                    <TableHead className="text-right">DPH</TableHead>
                    <TableHead className="text-right">Celkem</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {r.period_month ? format(new Date(r.period_month), "LLLL yyyy", { locale: cs }) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.commission_type === "customer_payments" ? "Zákazníci" : "Firmy"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{czk(r.amount_base_czk)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.vat_rate ? `${r.vat_rate} %` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{czk(r.amount_total_czk)}</TableCell>
                      <TableCell>{commissionStatusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        {NEXT_STATUS[r.status] ? (
                          <Button
                            size="sm"
                            variant={r.status === "approved" ? "default" : "outline"}
                            disabled={actionLoadingId === r.id}
                            onClick={() => handleAction(r)}
                          >
                            {actionLoadingId === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : r.status === "calculated" ? (
                              <><CheckCircle className="w-4 h-4 mr-1" />Schválit</>
                            ) : (
                              <><Banknote className="w-4 h-4 mr-1" />Vyplatit</>
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm paid */}
      <AlertDialog open={!!confirmPaid} onOpenChange={(o) => { if (!o) setConfirmPaid(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Označit jako vyplacené?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce nastaví provizi {confirmPaid ? czk(confirmPaid.amount_total_czk) : ""} jako vyplacenou
              a zapíše datum výplaty. Akci nelze vrátit zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const r = confirmPaid; setConfirmPaid(null); if (r) runStatusChange(r, "paid"); }}
            >
              Potvrdit výplatu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAffiliateAccounts;
