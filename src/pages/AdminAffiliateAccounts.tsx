/**
 * AFFILIATE v2 (Admin) — read + status workflow over the standalone affiliate model.
 * Reads:  affiliate_accounts, affiliate_commissions.
 * Writes: ONLY via RPC admin_set_affiliate_commission_status (calculated→approved)
 *         and direct UPDATE on affiliate_accounts for pending→approved / pending→rejected
 *         (allowed by aff_accounts_admin_write RLS policy FOR ALL TO authenticated USING is_admin()).
 *
 * Intentionally separate from the legacy influencer pages (partners table).
 * Does not touch customer accounts, Partner portal, payments, tickets, contests,
 * wallet, or buy_ticket_atomic.
 *
 * NOTE: affiliate_* tables are not yet in generated Supabase types,
 * so queries use `(supabase as any)` casts on purpose.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
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
import { RefreshCw, Eye, CheckCircle, Loader2, Megaphone, Briefcase, Users, UserCheck, XCircle, Mail } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

interface AffiliateAccount {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  ref_code: string;
  modes: string[];
  status: string;
  phone: string | null;
  vat_id: string | null;
  ico: string | null;
  commission_rate_customer: number;
  commission_rate_company: number;
  is_vat_payer: boolean;
  payout_account: string | null;
  payout_bank: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  website_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  facebook_url: string | null;
  audience_size: string | null;
  content_categories: string | null;
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

const NEXT_STATUS: Record<string, string> = { calculated: "approved" };
// Full column set — all profile/social columns exist on staging + production.
// No fallback: a fallback that omits social columns would silently show admins
// empty Instagram/TikTok/YouTube/Facebook/audience/categories despite saved data.
const AFFILIATE_ACCOUNT_SELECT =
  "id, auth_user_id, name, email, phone, ref_code, modes, status, commission_rate_customer, commission_rate_company, is_vat_payer, vat_id, payout_account, payout_bank, ico, billing_street, billing_city, billing_zip, billing_country, website_url, instagram_url, tiktok_url, youtube_url, facebook_url, audience_size, content_categories, created_at";

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
    case "payout_document_created": return <Badge variant="outline">Doklad vytvořen</Badge>;
    case "ready_to_pay": return <Badge variant="warning">Připraveno k dávce</Badge>;
    case "in_payment_batch": return <Badge variant="info">V dávce</Badge>;
    case "paid":       return <Badge variant="info">Vyplaceno</Badge>;
    default:           return <Badge variant="outline">{status}</Badge>;
  }
}

const czk = (n: number) => `${(n ?? 0).toLocaleString("cs-CZ")} Kč`;

const formatModes = (modes?: string[]) => {
  if (!modes?.length) return "Neuvedeno";
  return modes.map((mode) => mode === "influencer" ? "Influencer" : mode === "sales_rep" ? "Obchodník" : mode).join(" + ");
};

const fieldValue = (value?: string | null) => value && value.trim() ? value : "Neuvedeno";

function DetailField({ label, value, mono = false, testId }: { label: string; value?: string | null; mono?: boolean; testId?: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p data-testid={testId} className={`text-sm text-foreground break-words ${mono ? "font-mono" : ""}`}>{fieldValue(value)}</p>
    </div>
  );
}

const AdminAffiliateAccounts = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AffiliateAccount[]>([]);
  const [aggByAffiliate, setAggByAffiliate] = useState<Map<string, AccountAgg>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail dialog
  const [detailAccount, setDetailAccount] = useState<AffiliateAccount | null>(null);
  const [detailRows, setDetailRows] = useState<CommissionRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Account approval / rejection
  const [accountActionTarget, setAccountActionTarget] = useState<{ account: AffiliateAccount; action: "approve" | "reject" } | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: accData, error: accErr } = await (supabase as any)
        .from("affiliate_accounts")
        .select(AFFILIATE_ACCOUNT_SELECT)
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
        toast.success("Provize schválena");
        setDetailRows((prev) => prev.map((r) =>
          r.id === row.id ? { ...r, status: newStatus } : r
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

  const runAccountAction = async () => {
    if (!accountActionTarget) return;
    const { account, action } = accountActionTarget;
    setAccountActionLoading(true);
    try {
      const now = new Date().toISOString();
      const patch = action === "approve"
        ? { status: "approved", approved_at: now }
        : { status: "rejected", rejected_at: now };

      const { error: err } = await (supabase as any)
        .from("affiliate_accounts")
        .update(patch)
        .eq("id", account.id);

      if (err) throw err;

      toast.success(action === "approve"
        ? `Affiliate účet ${account.name} byl schválen.`
        : `Affiliate účet ${account.name} byl zamítnut.`);

      setAccountActionTarget(null);
      fetchData();
    } catch (err: any) {
      console.error("Error updating affiliate account status:", err);
      toast.error(err.message || "Nepodařilo se změnit stav účtu");
    } finally {
      setAccountActionLoading(false);
    }
  };

  const handleAction = (row: CommissionRow) => {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
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
            Samostatný affiliate model — účty, režimy a schvalování provizí. Vyplacení probíhá přes dávky.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums">{accounts.length}</p>
          <p className="text-xs text-muted-foreground">Affiliate účtů</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums text-amber-600">
            {accounts.filter((a) => a.status === "pending").length}
          </p>
          <p className="text-xs text-muted-foreground">Čeká na schválení</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums text-green-600">
            {accounts.filter((a) => a.status === "approved").length}
          </p>
          <p className="text-xs text-muted-foreground">Schválených účtů</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <p className="text-2xl font-bold tabular-nums text-amber-600">{totalCalculatedCount}</p>
          <p className="text-xs text-muted-foreground">Provizí ke schválení</p>
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
                          <div className="flex items-center justify-end gap-1">
                            {a.status === "pending" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-green-600 border-green-600 hover:bg-green-50"
                                  onClick={() => setAccountActionTarget({ account: a, action: "approve" })}
                                  title="Schválit affiliate účet"
                                  data-testid={`approve-affiliate-${a.id}`}
                                >
                                  <UserCheck className="w-4 h-4 mr-1" />
                                  Schválit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive border-destructive hover:bg-destructive/10"
                                  onClick={() => setAccountActionTarget({ account: a, action: "reject" })}
                                  title="Zamítnout affiliate účet"
                                  data-testid={`reject-affiliate-${a.id}`}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Zamítnout
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openDetail(a)} title="Detail účtu a provizí" data-testid={`detail-affiliate-${a.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
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
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="admin-affiliate-registration-detail">
                <DetailField label="Jméno / název" value={detailAccount.name} testId="admin-affiliate-detail-name" />
                <DetailField label="E-mail" value={detailAccount.email} testId="admin-affiliate-detail-email" />
                <DetailField label="Telefon" value={detailAccount.phone} testId="admin-affiliate-detail-phone" />
                <DetailField label="Zvolené zaměření" value={formatModes(detailAccount.modes)} testId="admin-affiliate-detail-modes" />
                <DetailField label="Ref kód" value={detailAccount.ref_code} mono testId="admin-affiliate-detail-ref-code" />
                <DetailField label="Stav účtu" value={detailAccount.status} testId="admin-affiliate-detail-status" />
                <DetailField label="Hlavní kanál / web / profil" value={detailAccount.website_url} testId="admin-affiliate-detail-website" />
                <DetailField label="Instagram" value={detailAccount.instagram_url} testId="admin-affiliate-detail-instagram" />
                <DetailField label="TikTok" value={detailAccount.tiktok_url} testId="admin-affiliate-detail-tiktok" />
                <DetailField label="YouTube" value={detailAccount.youtube_url} testId="admin-affiliate-detail-youtube" />
                <DetailField label="Facebook" value={detailAccount.facebook_url} testId="admin-affiliate-detail-facebook" />
                <DetailField label="Velikost publika / dosah" value={detailAccount.audience_size} testId="admin-affiliate-detail-audience" />
                <DetailField label="Kategorie obsahu" value={detailAccount.content_categories} testId="admin-affiliate-detail-categories" />
                <DetailField label="IČO" value={detailAccount.ico} testId="admin-affiliate-detail-ico" />
                <DetailField label="DIČ" value={detailAccount.vat_id} testId="admin-affiliate-detail-vat-id" />
                <DetailField label="Plátce DPH" value={detailAccount.is_vat_payer ? "Ano" : "Ne"} testId="admin-affiliate-detail-vat-payer" />
                <DetailField
                  label="Fakturační adresa"
                  value={[detailAccount.billing_street, detailAccount.billing_city, detailAccount.billing_zip, detailAccount.billing_country].filter(Boolean).join(", ")}
                  testId="admin-affiliate-detail-billing"
                />
                <DetailField label="Bankovní účet / IBAN" value={detailAccount.payout_account} testId="admin-affiliate-detail-payout-account" />
                <DetailField label="Banka" value={detailAccount.payout_bank} testId="admin-affiliate-detail-payout-bank" />
                <DetailField
                  label="Provizní sazby"
                  value={`Zákazníci ${detailAccount.commission_rate_customer} % · firmy ${detailAccount.commission_rate_company} %`}
                />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {detailAccount.auth_user_id
                    ? "Napište affiliate partnerovi přímo do jeho schránky zpráv."
                    : "Účet zatím nemá přihlášení (auth) — zprávu nelze zaslat."}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!detailAccount.auth_user_id}
                  data-testid="admin-affiliate-detail-message"
                  onClick={() => { if (detailAccount.auth_user_id) navigate(`/admin/messages/${detailAccount.auth_user_id}`); }}
                >
                  <Mail className="w-4 h-4 mr-1.5" />
                  Napsat zprávu
                </Button>
              </div>
            </div>
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
                            variant="outline"
                            disabled={actionLoadingId === r.id}
                            onClick={() => handleAction(r)}
                            data-testid={`affiliate-account-commission-approve-${r.id}`}
                          >
                            {actionLoadingId === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><CheckCircle className="w-4 h-4 mr-1" />Schválit</>
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

      {/* Confirm account approve / reject */}
      <AlertDialog
        open={!!accountActionTarget}
        onOpenChange={(o) => { if (!o && !accountActionLoading) setAccountActionTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accountActionTarget?.action === "approve" ? "Schválit affiliate účet?" : "Zamítnout affiliate účet?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accountActionTarget?.action === "approve"
                ? `Účet ${accountActionTarget?.account.name} (${accountActionTarget?.account.ref_code}) bude nastaven na schváleno. Affiliate bude moci přijímat atribuce.`
                : `Účet ${accountActionTarget?.account.name} (${accountActionTarget?.account.ref_code}) bude zamítnut. Akci lze v případě potřeby vrátit ručně.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accountActionLoading}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              disabled={accountActionLoading}
              onClick={runAccountAction}
              className={accountActionTarget?.action === "reject" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {accountActionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : accountActionTarget?.action === "approve" ? (
                <UserCheck className="w-4 h-4 mr-2" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              {accountActionTarget?.action === "approve" ? "Schválit" : "Zamítnout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default AdminAffiliateAccounts;
