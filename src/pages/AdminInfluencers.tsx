import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Eye,
  Search,
  Instagram,
  Youtube,
  Facebook,
  Users,
  Globe,
  Mail,
  Phone,
  Calendar,
} from "lucide-react";
import { AdminMenu } from "@/components/AdminMenu";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";

/* ===================== TYPES ===================== */

type InfluencerStatus = "pending" | "approved" | "rejected" | "suspended";

interface InfluencerMeta {
  type: string;
  social_networks?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    facebook?: string;
  };
  follower_range?: string;
  content_category?: string;
}

interface Influencer {
  id: string;
  name: string;
  company_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string;
  logo_url: string | null;
  status: InfluencerStatus;
  created_at: string;
  updated_at: string;
  notes: string | null;
  meta: InfluencerMeta | null;
}

const statusLabels: Record<InfluencerStatus, string> = {
  pending: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  suspended: "Pozastaveno",
};

const statusColors: Record<InfluencerStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  suspended: "outline",
};

function parseInfluencerMeta(notes: string | null): InfluencerMeta | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed?.type === "influencer") return parsed;
    return null;
  } catch {
    return null;
  }
}

function isInfluencer(notes: string | null): boolean {
  return parseInfluencerMeta(notes) !== null;
}

/* ===================== COMPONENT ===================== */

const AdminInfluencers = () => {
  const { loading: roleLoading, isAdmin } = useUserRole();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Influencer | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchInfluencers();
  }, []);

  const fetchInfluencers = async () => {
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, company_name, contact_email, contact_phone, website_url, logo_url, status, created_at, updated_at, notes")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const filtered = (data || [])
        .filter((p) => isInfluencer(p.notes))
        .map((p) => ({
          ...p,
          status: p.status as InfluencerStatus,
          meta: parseInfluencerMeta(p.notes),
        }));

      setInfluencers(filtered);
    } catch {
      toast.error("Nepodařilo se načíst influencery");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (influencer: Influencer, newStatus: "approved" | "rejected") => {
    setActionLoading(influencer.id);
    const prev = [...influencers];
    setInfluencers((list) =>
      list.map((i) => (i.id === influencer.id ? { ...i, status: newStatus } : i))
    );

    try {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "approved") {
        updateData.approved_at = new Date().toISOString();
      } else if (newStatus === "rejected") {
        updateData.rejected_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("partners")
        .update(updateData)
        .eq("id", influencer.id);

      if (error) throw error;
      toast.success(newStatus === "approved" ? "Influencer schválen" : "Influencer zamítnut");
    } catch {
      setInfluencers(prev);
      toast.error("Nepodařilo se změnit status");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    let list = influencers;
    if (statusFilter !== "all") {
      list = list.filter((i) => i.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.contact_email && i.contact_email.toLowerCase().includes(q)) ||
          (i.company_name && i.company_name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [influencers, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: influencers.length, pending: 0, approved: 0, rejected: 0 };
    influencers.forEach((i) => {
      if (i.status in c) (c as Record<string, number>)[i.status]++;
    });
    return c;
  }, [influencers]);

  /* ===================== RENDER ===================== */

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
        <p className="text-muted-foreground">Nemáte přístup k této sekci.</p>
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Správa influencerů
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Hledat podle jména nebo emailu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Tabs */}
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">Vše ({counts.all})</TabsTrigger>
                <TabsTrigger value="pending">Čekající ({counts.pending})</TabsTrigger>
                <TabsTrigger value="approved">Schválení ({counts.approved})</TabsTrigger>
                <TabsTrigger value="rejected">Zamítnutí ({counts.rejected})</TabsTrigger>
              </TabsList>

              <TabsContent value={statusFilter} className="mt-4">
                {filtered.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Žádní influenceři v této kategorii.
                  </p>
                ) : (
                  <div className="rounded-md border border-border/50 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jméno</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Registrace</TableHead>
                          <TableHead className="text-right">Akce</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((inf) => (
                          <TableRow key={inf.id}>
                            <TableCell className="font-medium">{inf.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {inf.contact_email || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusColors[inf.status]}>
                                {inf.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                                {inf.status === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
                                {inf.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                                {statusLabels[inf.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(inf.created_at), "d. M. yyyy", { locale: cs })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelected(inf);
                                    setDetailOpen(true);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {inf.status === "pending" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                      disabled={actionLoading === inf.id}
                                      onClick={() => handleStatusChange(inf, "approved")}
                                    >
                                      {actionLoading === inf.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                      disabled={actionLoading === inf.id}
                                      onClick={() => handleStatusChange(inf, "rejected")}
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {inf.status === "approved" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                    disabled={actionLoading === inf.id}
                                    onClick={() => handleStatusChange(inf, "rejected")}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                )}
                                {inf.status === "rejected" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                    disabled={actionLoading === inf.id}
                                    onClick={() => handleStatusChange(inf, "approved")}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Detail influencera
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Jméno</p>
                  <p className="font-medium">{selected.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={statusColors[selected.status]}>
                    {statusLabels[selected.status]}
                  </Badge>
                </div>
                {selected.contact_email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm">{selected.contact_email}</p>
                    </div>
                  </div>
                )}
                {selected.contact_phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefon</p>
                      <p className="text-sm">{selected.contact_phone}</p>
                    </div>
                  </div>
                )}
                {selected.website_url && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Web</p>
                      <a
                        href={selected.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {selected.website_url}
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Registrace</p>
                    <p className="text-sm">
                      {format(new Date(selected.created_at), "d. MMMM yyyy, HH:mm", { locale: cs })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Social & meta */}
              {selected.meta && (
                <div className="border-t border-border/50 pt-3 space-y-3">
                  <h4 className="text-sm font-semibold">Sociální sítě</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.meta.social_networks?.instagram && (
                      <div className="flex items-center gap-2 text-sm">
                        <Instagram className="w-4 h-4 text-pink-500" />
                        <span>{selected.meta.social_networks.instagram}</span>
                      </div>
                    )}
                    {selected.meta.social_networks?.tiktok && (
                      <div className="flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9a6.33 6.33 0 00-.79-.05A6.34 6.34 0 003.15 15.3a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.05a8.27 8.27 0 004.76 1.5V7.12a4.83 4.83 0 01-1-.43z" />
                        </svg>
                        <span>{selected.meta.social_networks.tiktok}</span>
                      </div>
                    )}
                    {selected.meta.social_networks?.youtube && (
                      <div className="flex items-center gap-2 text-sm">
                        <Youtube className="w-4 h-4 text-red-500" />
                        <span>{selected.meta.social_networks.youtube}</span>
                      </div>
                    )}
                    {selected.meta.social_networks?.facebook && (
                      <div className="flex items-center gap-2 text-sm">
                        <Facebook className="w-4 h-4 text-blue-500" />
                        <span>{selected.meta.social_networks.facebook}</span>
                      </div>
                    )}
                  </div>

                  {selected.meta.follower_range && (
                    <div>
                      <p className="text-xs text-muted-foreground">Počet sledujících</p>
                      <p className="text-sm">{selected.meta.follower_range}</p>
                    </div>
                  )}
                  {selected.meta.content_category && (
                    <div>
                      <p className="text-xs text-muted-foreground">Kategorie obsahu</p>
                      <p className="text-sm">{selected.meta.content_category}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            {selected && selected.status !== "approved" && (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={actionLoading === selected.id}
                onClick={() => {
                  handleStatusChange(selected, "approved");
                  setDetailOpen(false);
                }}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Schválit
              </Button>
            )}
            {selected && selected.status !== "rejected" && (
              <Button
                variant="destructive"
                disabled={actionLoading === selected?.id}
                onClick={() => {
                  if (selected) {
                    handleStatusChange(selected, "rejected");
                    setDetailOpen(false);
                  }
                }}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Zamítnout
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminMenu />
    </div>
  );
};

export default AdminInfluencers;
