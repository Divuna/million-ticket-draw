/**
 * INFLUENCER SYSTEM (Admin Commissions) — Monetary CZK payouts, invoiced, admin-controlled.
 * Overview of influencer_commissions with partner name joins and status management.
 * ⚠️  Intentionally separate from the Player referral system. MUST NOT be unified.
 */
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, CheckCircle, Clock, Info, Loader2, RefreshCw, Banknote } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

interface CommissionRow {
  id: string;
  influencer_partner_id: string;
  period_month: string;
  amount_czk: number;
  status: string;
  updated_at: string;
  partner_name: string;
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
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Vypočteno</Badge>;
    case "approved":
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Schváleno</Badge>;
    case "paid":
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Vyplaceno</Badge>;
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
        .select("id, name, company_name")
        .in("id", partnerIds);

      const partnerMap = new Map(
        (partners || []).map((p) => [p.id, p.company_name || p.name])
      );

      const rows: CommissionRow[] = data.map((c) => ({
        ...c,
        partner_name: partnerMap.get(c.influencer_partner_id) || "Neznámý",
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

  /* ── Status transition ── */

  const handleStatusChange = async (commission: CommissionRow) => {
    const newStatus = NEXT_STATUS[commission.status];
    if (!newStatus) return;

    // If transitioning to "paid", require confirmation
    if (newStatus === "paid") {
      setConfirmTarget(commission);
      return;
    }

    await executeStatusChange(commission, newStatus);
  };

  const executeStatusChange = async (commission: CommissionRow, newStatus: string) => {
    setActionLoadingId(commission.id);

    // Optimistic update
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

  /* ── Guards ── */

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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

  if (role !== 'admin' && role !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Provize influencerů</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Přehled automaticky vypočtených provizí influencerů
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
                    <TableHead>Influencer</TableHead>
                    <TableHead>Období</TableHead>
                    <TableHead className="text-right">Částka (CZK)</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Aktualizováno</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => {
                    const nextStatus = NEXT_STATUS[c.status];
                    const actionMeta = ACTION_LABELS[c.status];
                    const isLoading = actionLoadingId === c.id;

                    return (
                      <TableRow key={c.id}>
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

      {/* Confirmation dialog for marking as paid */}
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
                  pro influencera{" "}
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
    </div>
  );
}
