/**
 * AdminAffiliateCommissions — fáze 1 (read-only)
 *
 * Zobrazuje B2B provize obchodníků z affiliate_commissions kde commission_type = 'company_invoice'.
 * Fáze 1: pouze přehled, žádné schvalování, žádné vyplácení, žádný ABO export.
 * Provize se počítají automaticky 2. každého měsíce (pg_cron job 25).
 */
import React, { useState, useEffect, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, RefreshCw, Banknote } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommissionRow {
  id: string;
  affiliate_id: string;
  commission_type: string;
  period_month: string | null;
  amount_czk: number;
  commission_rate: number | null;
  source_invoice_id: string | null;
  company_ref_id: string | null;
  status: string;
  created_at: string;
  // joined
  affiliate_name: string | null;
  affiliate_ref_code: string | null;
  company_name: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
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

/** Generuj seznam posledních N měsíců (YYYY-MM-DD string pro period_month). */
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

const VAT_RATE = 0.21; // DPH 21 %

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminAffiliateCommissions() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      // 1. Načti affiliate_commissions (commission_type='company_invoice') + affiliate_accounts join
      const { data: commissions, error: commErr } = await supabase
        .from("affiliate_commissions")
        .select(
          `id, affiliate_id, commission_type, period_month, amount_czk, commission_rate,
           source_invoice_id, company_ref_id, status, created_at,
           affiliate_accounts!affiliate_commissions_affiliate_id_fkey(
             full_name, ref_code
           )`
        )
        .eq("commission_type", "company_invoice")
        .order("created_at", { ascending: false });

      if (commErr) throw commErr;

      // 2. Pokud máme source_invoice_id → dohledej company přes partner_invoices → partners
      //    Pokud máme company_ref_id → dohledej company přes affiliate_company_refs → partners
      //    V obou případech NULL → "Neuvedeno"

      const invoiceIds = (commissions ?? [])
        .map((r: any) => r.source_invoice_id)
        .filter(Boolean) as string[];

      const refIds = (commissions ?? [])
        .map((r: any) => r.company_ref_id)
        .filter(Boolean) as string[];

      // Batch load partner names from partner_invoices
      const invoicePartnerMap: Record<string, string> = {};
      if (invoiceIds.length > 0) {
        const { data: invData } = await supabase
          .from("partner_invoices")
          .select("id, partner_id, partners!partner_invoices_partner_id_fkey(company_name, name)")
          .in("id", invoiceIds);
        for (const inv of invData ?? []) {
          const p = (inv as any).partners;
          invoicePartnerMap[inv.id] = p?.company_name || p?.name || "Neuvedeno";
        }
      }

      // Batch load partner names from affiliate_company_refs
      const refPartnerMap: Record<string, string> = {};
      if (refIds.length > 0) {
        const { data: refData } = await supabase
          .from("affiliate_company_refs")
          .select("id, partner_id, partners!affiliate_company_refs_partner_id_fkey(company_name, name)")
          .in("id", refIds);
        for (const ref of refData ?? []) {
          const p = (ref as any).partners;
          refPartnerMap[ref.id] = p?.company_name || p?.name || "Neuvedeno";
        }
      }

      // 3. Sestavení výsledných řádků
      const result: CommissionRow[] = (commissions ?? []).map((r: any) => {
        const aa = r.affiliate_accounts;
        let companyName: string | null = null;
        if (r.source_invoice_id && invoicePartnerMap[r.source_invoice_id]) {
          companyName = invoicePartnerMap[r.source_invoice_id];
        } else if (r.company_ref_id && refPartnerMap[r.company_ref_id]) {
          companyName = refPartnerMap[r.company_ref_id];
        }
        return {
          id: r.id,
          affiliate_id: r.affiliate_id,
          commission_type: r.commission_type,
          period_month: r.period_month,
          amount_czk: r.amount_czk,
          commission_rate: r.commission_rate,
          source_invoice_id: r.source_invoice_id,
          company_ref_id: r.company_ref_id,
          status: r.status,
          created_at: r.created_at,
          affiliate_name: aa?.full_name ?? null,
          affiliate_ref_code: aa?.ref_code ?? null,
          company_name: companyName,
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
      // period_month is stored as YYYY-MM-DD; compare first 7 chars
      const rowMonth = (r.period_month ?? "").substring(0, 7);
      const selMonth = filterMonth.substring(0, 7);
      if (rowMonth !== selMonth) return false;
    }
    return true;
  });

  // Unique affiliates for filter dropdown
  const affiliateOptions = Array.from(
    new Map(rows.map((r) => [r.affiliate_id, r.affiliate_name ?? r.affiliate_id])).entries()
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
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
            {/* Stav */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Stav" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny stavy</SelectItem>
                <SelectItem value="calculated">Vypočteno</SelectItem>
                <SelectItem value="approved">Schváleno</SelectItem>
                <SelectItem value="paid">Vyplaceno</SelectItem>
              </SelectContent>
            </Select>

            {/* Obchodník */}
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

            {/* Měsíc */}
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

            {/* Reset */}
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
          <CardDescription>Read-only přehled. Schvalování a výplaty budou v další fázi.</CardDescription>
        </CardHeader>
        <CardContent>
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
                    <TableHead>Měsíc</TableHead>
                    <TableHead>Obchodník</TableHead>
                    <TableHead>Ref kód</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>Typ provize</TableHead>
                    <TableHead className="text-right">Základ (bez DPH)</TableHead>
                    <TableHead className="text-right">DPH 21 %</TableHead>
                    <TableHead className="text-right">Celkem</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const vatAmount = row.amount_czk * VAT_RATE;
                    const totalAmount = row.amount_czk + vatAmount;
                    return (
                      <TableRow key={row.id}>
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
                          {row.company_name ?? (
                            <span className="text-muted-foreground text-xs italic">Neuvedeno</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {row.commission_type}
                          </code>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCzk(row.amount_czk)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatCzk(vatAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCzk(totalAmount)}
                        </TableCell>
                        <TableCell>{statusBadge(row.status)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {format(new Date(row.created_at), "d. M. yyyy HH:mm", { locale: cs })}
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
