import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Eye,
  Users,
  Globe,
  Mail,
  Phone,
  RefreshCw,
} from "lucide-react";
import { AdminMenu } from "@/components/AdminMenu";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";

/* ===================== TYPES ===================== */

type InfluencerStatus = "pending" | "approved" | "rejected";

interface Influencer {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string | null;
  website_url: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: InfluencerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const statusLabels: Record<InfluencerStatus, string> = {
  pending: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
};

const statusColors: Record<InfluencerStatus, "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

const statusIcons: Record<InfluencerStatus, React.ElementType> = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
};

/* ===================== COMPONENT ===================== */

const AdminInfluencers = () => {
  const { loading: roleLoading, isAdmin } = useUserRole();

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);

  /* ===================== DATA ===================== */

  const fetchInfluencers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, company_name, logo_url, website_url, contact_email, contact_phone, status, notes, created_at, updated_at")
        .ilike("notes", "%influencer%")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInfluencers((data || []) as Influencer[]);
    } catch (error) {
      console.error("Error fetching influencers:", error);
      toast.error("Nepodařilo se načíst influencery");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfluencers();
  }, []);

  /* ===================== ACTIONS ===================== */

  const handleStatusChange = async (influencerId: string, newStatus: "approved" | "rejected") => {
    setActionLoading(influencerId);

    const previousInfluencers = [...influencers];
    setInfluencers(
      influencers.map((i) =>
        i.id === influencerId ? { ...i, status: newStatus } : i
      )
    );

    try {
      const { error } = await supabase
        .from("partners")
        .update({ status: newStatus })
        .eq("id", influencerId);

      if (error) throw error;

      toast.success(
        newStatus === "approved"
          ? "Influencer byl schválen"
          : "Influencer byl zamítnut"
      );

      // Update detail dialog if open
      if (selectedInfluencer?.id === influencerId) {
        setSelectedInfluencer({ ...selectedInfluencer, status: newStatus });
      }
    } catch (error) {
      console.error("Error updating influencer status:", error);
      setInfluencers(previousInfluencers);
      toast.error("Nepodařilo se aktualizovat stav influencera");
    } finally {
      setActionLoading(null);
    }
  };

  /* ===================== DETAIL ===================== */

  const openDetail = (influencer: Influencer) => {
    setSelectedInfluencer(influencer);
    setDetailOpen(true);
  };

  /* ===================== LOADING / AUTH ===================== */

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <AdminMenu />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Nemáte oprávnění k zobrazení této stránky.</p>
        <AdminMenu />
      </div>
    );
  }

  /* ===================== STATS ===================== */

  const pendingCount = influencers.filter((i) => i.status === "pending").length;
  const approvedCount = influencers.filter((i) => i.status === "approved").length;
  const rejectedCount = influencers.filter((i) => i.status === "rejected").length;

  /* ===================== RENDER ===================== */

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Správa influencerů</h1>
            <p className="text-sm text-muted-foreground">
              Přehled a schvalování registrací influencerů
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInfluencers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Obnovit
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Čeká na schválení</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">Schváleno</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{rejectedCount}</p>
                <p className="text-xs text-muted-foreground">Zamítnuto</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Influenceři ({influencers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {influencers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Zatím žádní influenceři.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jméno</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Web / Sociální sítě</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead>Registrace</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {influencers.map((influencer) => {
                      const StatusIcon = statusIcons[influencer.status as InfluencerStatus] || Clock;
                      const isActionLoading = actionLoading === influencer.id;

                      return (
                        <TableRow key={influencer.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {influencer.logo_url ? (
                                <img
                                  src={influencer.logo_url}
                                  alt={influencer.name}
                                  className="w-8 h-8 rounded-full object-cover border border-border/50"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Users className="w-4 h-4 text-primary" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium">{influencer.name}</p>
                                {influencer.company_name && (
                                  <p className="text-xs text-muted-foreground">{influencer.company_name}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {influencer.contact_email ? (
                              <span className="text-sm">{influencer.contact_email}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {influencer.website_url ? (
                              <a
                                href={influencer.website_url.startsWith("http") ? influencer.website_url : `https://${influencer.website_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                              >
                                <Globe className="w-3 h-3" />
                                {influencer.website_url.replace(/^https?:\/\//, "").slice(0, 30)}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColors[influencer.status as InfluencerStatus] || "secondary"}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusLabels[influencer.status as InfluencerStatus] || influencer.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(influencer.created_at), "d. M. yyyy", { locale: cs })}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDetail(influencer)}
                                title="Detail"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {influencer.status === "pending" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleStatusChange(influencer.id, "approved")}
                                    disabled={isActionLoading}
                                    title="Schválit"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleStatusChange(influencer.id, "rejected")}
                                    disabled={isActionLoading}
                                    title="Zamítnout"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <XCircle className="w-4 h-4" />
                                    )}
                                  </Button>
                                </>
                              )}
                              {influencer.status === "approved" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleStatusChange(influencer.id, "rejected")}
                                  disabled={isActionLoading}
                                  title="Zamítnout"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                >
                                  {isActionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <XCircle className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                              {influencer.status === "rejected" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleStatusChange(influencer.id, "approved")}
                                  disabled={isActionLoading}
                                  title="Schválit"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                >
                                  {isActionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
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
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Detail influencera
            </DialogTitle>
          </DialogHeader>

          {selectedInfluencer && (
            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <Badge
                  variant={statusColors[selectedInfluencer.status as InfluencerStatus] || "secondary"}
                  className="text-sm"
                >
                  {statusLabels[selectedInfluencer.status as InfluencerStatus] || selectedInfluencer.status}
                </Badge>
                <div className="flex gap-1">
                  {selectedInfluencer.status !== "approved" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(selectedInfluencer.id, "approved")}
                      disabled={actionLoading === selectedInfluencer.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {actionLoading === selectedInfluencer.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      )}
                      Schválit
                    </Button>
                  )}
                  {selectedInfluencer.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleStatusChange(selectedInfluencer.id, "rejected")}
                      disabled={actionLoading === selectedInfluencer.id}
                    >
                      {actionLoading === selectedInfluencer.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      Zamítnout
                    </Button>
                  )}
                </div>
              </div>

              {/* Info fields */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Jméno</Label>
                  <p className="text-sm font-medium">{selectedInfluencer.name}</p>
                </div>

                {selectedInfluencer.company_name && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Společnost</Label>
                    <p className="text-sm">{selectedInfluencer.company_name}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> E-mail
                    </Label>
                    <p className="text-sm">{selectedInfluencer.contact_email || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Telefon
                    </Label>
                    <p className="text-sm">{selectedInfluencer.contact_phone || "—"}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Web / Sociální sítě
                  </Label>
                  {selectedInfluencer.website_url ? (
                    <a
                      href={selectedInfluencer.website_url.startsWith("http") ? selectedInfluencer.website_url : `https://${selectedInfluencer.website_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {selectedInfluencer.website_url}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>

                {selectedInfluencer.logo_url && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Profilový obrázek</Label>
                    <img
                      src={selectedInfluencer.logo_url}
                      alt={selectedInfluencer.name}
                      className="w-16 h-16 rounded-lg object-cover border border-border/50 mt-1"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Registrace</Label>
                    <p className="text-sm">
                      {format(new Date(selectedInfluencer.created_at), "d. M. yyyy HH:mm", { locale: cs })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Poslední změna</Label>
                    <p className="text-sm">
                      {format(new Date(selectedInfluencer.updated_at), "d. M. yyyy HH:mm", { locale: cs })}
                    </p>
                  </div>
                </div>

                {/* Notes (raw, read-only) */}
                <div>
                  <Label className="text-xs text-muted-foreground">Poznámky (raw)</Label>
                  <Textarea
                    value={selectedInfluencer.notes || ""}
                    readOnly
                    className="mt-1 text-xs font-mono bg-muted/50 resize-none"
                    rows={6}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AdminMenu />
    </div>
  );
};

export default AdminInfluencers;
