import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Building2,
  CheckCircle,
  XCircle,
  Mail,
  Globe,
  User,
  Calendar,
  Hash,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyLead {
  id: string;
  company_name: string;
  company_email: string;
  ico: string | null;
  dic: string | null;
  website: string | null;
  sales_rep_name_snapshot: string | null;
  sales_rep_email_snapshot: string | null;
  sales_rep_ref_code_snapshot: string | null;
  submitted_to_admin_at: string | null;
  company_confirmed_at: string | null;
  status: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AdminCompanyLeads: React.FC = () => {
  const [leads, setLeads] = useState<CompanyLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approve confirm dialog
  const [approveDialogId, setApproveDialogId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Reject dialog
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const MAX_REASON_LENGTH = 1000;

  // ── Fetch leads ─────────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("affiliate_company_leads")
        .select(
          "id, company_name, company_email, ico, dic, website, " +
          "sales_rep_name_snapshot, sales_rep_email_snapshot, sales_rep_ref_code_snapshot, " +
          "submitted_to_admin_at, company_confirmed_at, status",
        )
        .eq("status", "pending_admin_approval")
        .order("submitted_to_admin_at", { ascending: true });

      if (fetchError) throw fetchError;
      setLeads((data as unknown as CompanyLead[]) ?? []);
    } catch (err) {
      console.error("AdminCompanyLeads: fetchLeads failed", err);
      setError("Nepodařilo se načíst žádosti. Zkuste obnovit stránku.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // ── Call Edge Function ───────────────────────────────────────────────────────

  const callApproveEF = async (leadId: string, action: "approve" | "reject", rejectionReason?: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Nejste přihlášeni.");

    const res = await supabase.functions.invoke("approve-affiliate-company-lead", {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        lead_id: leadId,
        action,
        ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
      },
    });

    if (res.error) throw res.error;

    const result = res.data as { success?: boolean; message?: string; setup_link_pending?: boolean } | null;
    if (!result?.success) {
      throw new Error(result?.message ?? "Neznámá chyba.");
    }

    return result;
  };

  // ── Approve ──────────────────────────────────────────────────────────────────

  const handleApproveConfirm = async () => {
    if (!approveDialogId) return;
    const leadId = approveDialogId;
    setApproveDialogId(null);
    setApprovingId(leadId);

    try {
      const result = await callApproveEF(leadId, "approve");
      if (result?.setup_link_pending) {
        toast.warning("Firma schválena, ale e-mail s odkazem se nepodařilo odeslat. Kontaktujte administrátora.");
      } else {
        toast.success("Firma schválena. Partnerský účet byl vytvořen a firma dostala e-mail s odkazem pro nastavení hesla.");
      }
      await fetchLeads();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("company_email_already_has_partner_account")) {
        toast.error("Firma již má partnerský účet s tímto e-mailem.");
      } else if (msg.includes("lead_wrong_status")) {
        toast.error("Žádost již byla zpracována.");
        await fetchLeads();
      } else {
        toast.error(`Schválení selhalo: ${msg}`);
      }
    } finally {
      setApprovingId(null);
    }
  };

  // ── Reject ───────────────────────────────────────────────────────────────────

  const handleRejectOpen = (leadId: string) => {
    setRejectReason("");
    setRejectDialogId(leadId);
  };

  const handleRejectConfirm = async () => {
    if (!rejectDialogId) return;
    if (!rejectReason.trim()) {
      toast.error("Důvod zamítnutí je povinný.");
      return;
    }
    const leadId = rejectDialogId;
    setRejectDialogId(null);
    setRejectingId(leadId);

    try {
      await callApproveEF(leadId, "reject", rejectReason.trim());
      toast.success("Žádost byla zamítnuta.");
      await fetchLeads();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("lead_wrong_status")) {
        toast.error("Žádost již byla zpracována.");
        await fetchLeads();
      } else {
        toast.error(`Zamítnutí selhalo: ${msg}`);
      }
    } finally {
      setRejectingId(null);
      setRejectReason("");
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "d. M. yyyy HH:mm", { locale: cs });
    } catch {
      return iso;
    }
  };

  const leadBeingApproved = leads.find((l) => l.id === approveDialogId);
  const leadBeingRejected = leads.find((l) => l.id === rejectDialogId);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Žádosti firem ke schválení
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Žádosti o registraci firmy jako partnera OneMil — čekají na vaše schválení.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Obnovit
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5 mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && leads.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mb-3 opacity-70" />
            <p className="text-lg font-medium text-muted-foreground">Žádné čekající žádosti</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Všechny potvrzené žádosti firem byly zpracovány.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Leads list */}
      {!loading && !error && leads.length > 0 && (
        <div className="space-y-4">
          {leads.map((lead) => {
            const isApproving = approvingId === lead.id;
            const isRejecting = rejectingId === lead.id;
            const isBusy = isApproving || isRejecting;

            return (
              <Card key={lead.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary shrink-0" />
                        {lead.company_name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1.5 mt-0.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {lead.company_email}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-600 border-amber-500/30 shrink-0"
                    >
                      Čeká na schválení
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 pb-4">
                  {/* Company details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm mb-4">
                    {lead.ico && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Hash className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground/70 mr-1">IČO:</span>
                        <span className="font-mono">{lead.ico}</span>
                      </div>
                    )}
                    {lead.dic && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Hash className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground/70 mr-1">DIČ:</span>
                        <span className="font-mono">{lead.dic}</span>
                      </div>
                    )}
                    {lead.website && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate max-w-[180px]"
                        >
                          {lead.website.replace(/^https?:\/\//, "")}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-foreground/70 mr-1">Obchodník:</span>
                      <span>
                        {lead.sales_rep_name_snapshot ?? lead.sales_rep_email_snapshot ?? "—"}
                        {lead.sales_rep_ref_code_snapshot && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({lead.sales_rep_ref_code_snapshot})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 md:col-span-1">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-foreground/70 mr-1">Odesláno ke schválení:</span>
                      <span>{formatDate(lead.submitted_to_admin_at)}</span>
                    </div>
                    {lead.company_confirmed_at && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        <span className="text-foreground/70 mr-1">Potvrzeno firmou:</span>
                        <span>{formatDate(lead.company_confirmed_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border/40">
                    <Button
                      size="sm"
                      onClick={() => setApproveDialogId(lead.id)}
                      disabled={isBusy}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isApproving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Schválit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRejectOpen(lead.id)}
                      disabled={isBusy}
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {isRejecting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Zamítnout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Approve confirm dialog ─────────────────────────────────────────── */}
      <Dialog open={!!approveDialogId} onOpenChange={(open) => { if (!open) setApproveDialogId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Schválit žádost firmy
            </DialogTitle>
            <DialogDescription>
              {leadBeingApproved ? (
                <>
                  Schválíte žádost firmy{" "}
                  <strong>{leadBeingApproved.company_name}</strong>
                  {" "}({leadBeingApproved.company_email}).
                  <br /><br />
                  Bude vytvořen partnerský účet a firmě bude odeslán e-mail s odkazem pro nastavení hesla.
                  Žádné heslo nebude vygenerováno ani odesláno.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogId(null)}>
              Zrušit
            </Button>
            <Button
              onClick={handleApproveConfirm}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Ano, schválit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!rejectDialogId} onOpenChange={(open) => { if (!open) { setRejectDialogId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Zamítnout žádost firmy
            </DialogTitle>
            <DialogDescription>
              {leadBeingRejected ? (
                <>
                  Zamítnete žádost firmy{" "}
                  <strong>{leadBeingRejected.company_name}</strong>
                  {" "}({leadBeingRejected.company_email}).
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label htmlFor="reject-reason" className="text-sm font-medium">
              Důvod zamítnutí <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
              placeholder="Uveďte důvod zamítnutí, který bude zaznamenán do systému..."
              className="mt-1.5 resize-none"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {rejectReason.length}/{MAX_REASON_LENGTH}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRejectDialogId(null); setRejectReason(""); }}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim()}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Zamítnout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCompanyLeads;
