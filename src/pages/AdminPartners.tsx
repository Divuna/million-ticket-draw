import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Building2,
  Globe,
  Phone,
  FileText,
  Image,
  Key,
  Eye,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { AdminMenu } from "@/components/AdminMenu";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";

/* ===================== TYPES ===================== */

type PartnerStatus = "pending" | "approved" | "suspended" | "rejected";
type LogoStatus = "none" | "pending" | "approved" | "rejected";

interface Partner {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string;
  created_at: string;
  updated_at: string;
  status: PartnerStatus;
  logo_status: LogoStatus;
  contact_email?: string | null;
  contact_phone?: string | null;
  ico?: string | null;
  dic?: string | null;
}

interface PendingRegistration {
  id: string;
  email: string;
  company_name: string;
  website_url: string;
  contact_phone: string | null;
  ico: string | null;
  dic: string | null;
  created_at: string;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
}

const statusLabels: Record<PartnerStatus, string> = {
  pending: "Čeká na schválení",
  approved: "Schváleno",
  suspended: "Pozastaveno",
  rejected: "Zamítnuto",
};

const statusColors: Record<PartnerStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  suspended: "destructive",
  rejected: "outline",
};

const logoStatusLabels: Record<LogoStatus, string> = {
  none: "Bez loga",
  pending: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
};

const logoStatusColors: Record<LogoStatus, "default" | "secondary" | "destructive" | "outline"> = {
  none: "outline",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

/* ===================== COMPONENT ===================== */

const AdminPartners = () => {
  const { loading: roleLoading, isAdmin } = useUserRole();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    website_url: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  const [partnerApiKeys, setPartnerApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [logoApprovalLoading, setLogoApprovalLoading] = useState<string | null>(null);

  /* ===================== INIT ===================== */

  useEffect(() => {
    fetchPartners();
    loadPendingRegistrations();
  }, []);

  /* ===================== DATA ===================== */

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });

      if (error) throw error;
      setPartners((data || []) as Partner[]);
    } catch {
      toast.error("Nepodařilo se načíst partnery");
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRegistrations = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error("No session for pending registrations");
        setPendingLoading(false);
        return;
      }

      const res = await supabase.functions.invoke("get-pending-partner-registrations", {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (res.error) {
        throw res.error;
      }

      const data = res.data as { success: boolean; registrations: PendingRegistration[] };
      if (data.success) {
        setPendingRegistrations(data.registrations || []);
      }
    } catch (error) {
      console.error("Error loading pending registrations:", error);
    } finally {
      setPendingLoading(false);
    }
  };

  /* ===================== UPLOAD ===================== */

  const uploadLogo = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("partner-logos").upload(path, file);

    if (error) throw error;

    return supabase.storage.from("partner-logos").getPublicUrl(path).data.publicUrl;
  };

  /* ===================== CRUD ===================== */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setUploading(true);
      let logo = formData.logo_url;

      if (selectedFile) {
        logo = await uploadLogo(selectedFile);
      }

      if (editingPartner) {
        const { error } = await supabase
          .from("partners")
          .update({
            name: formData.name,
            website_url: formData.website_url,
            logo_url: logo || null,
          })
          .eq("id", editingPartner.id);

        if (error) throw error;
        toast.success("Partner byl aktualizován");
      } else {
        const { error } = await supabase.from("partners").insert({
          name: formData.name,
          website_url: formData.website_url,
          logo_url: logo || null,
        });

        if (error) throw error;
        toast.success("Partner byl vytvořen");
      }

      setDialogOpen(false);
      setEditingPartner(null);
      setFormData({ name: "", logo_url: "", website_url: "" });
      setSelectedFile(null);
      fetchPartners();
    } catch (error) {
      console.error("Error saving partner:", error);
      toast.error("Nepodařilo se uložit partnera");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (partnerId: string) => {
    if (!confirm("Opravdu chcete smazat tohoto partnera?")) return;

    try {
      const { error } = await supabase.from("partners").delete().eq("id", partnerId);
      if (error) throw error;
      toast.success("Partner byl smazán");
      fetchPartners();
    } catch {
      toast.error("Nepodařilo se smazat partnera");
    }
  };

  const openEditDialog = (partner: Partner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      logo_url: partner.logo_url || "",
      website_url: partner.website_url,
    });
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingPartner(null);
    setFormData({ name: "", logo_url: "", website_url: "" });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  /* ===================== PENDING REGISTRATIONS ===================== */

  const handleApproveRegistration = async (registration: PendingRegistration, action: "approve" | "reject") => {
    setApprovalLoading(registration.id);

    const previousRegistrations = [...pendingRegistrations];
    setPendingRegistrations(pendingRegistrations.filter((r) => r.id !== registration.id));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Nejste přihlášen");
      }

      const response = await supabase.functions.invoke("approve-partner-registration", {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          auth_user_id: registration.id,
          action: action,
        },
      });

      if (response.error) {
        throw response.error;
      }

      const data = response.data as { success: boolean; message: string };

      if (!data.success) {
        throw new Error(data.message);
      }

      toast.success(action === "approve" ? "Partner byl schválen" : "Registrace byla zamítnuta");

      if (action === "approve") {
        fetchPartners();
      }
    } catch (error) {
      console.error("Error approving registration:", error);
      setPendingRegistrations(previousRegistrations);
      toast.error("Nepodařilo se zpracovat registraci");
    } finally {
      setApprovalLoading(null);
    }
  };

  /* ===================== LOGO APPROVAL ===================== */

  const handleLogoApproval = async (partnerId: string, newStatus: LogoStatus) => {
    setLogoApprovalLoading(partnerId);

    const previousPartners = [...partners];
    setPartners(partners.map((p) => (p.id === partnerId ? { ...p, logo_status: newStatus } : p)));

    try {
      const { error } = await supabase
        .from("partners")
        .update({ logo_status: newStatus })
        .eq("id", partnerId);

      if (error) throw error;
      toast.success(newStatus === "approved" ? "Logo bylo schváleno" : "Logo bylo zamítnuto");
    } catch (error) {
      console.error("Error updating logo status:", error);
      setPartners(previousPartners);
      toast.error("Nepodařilo se aktualizovat stav loga");
    } finally {
      setLogoApprovalLoading(null);
    }
  };

  /* ===================== PARTNER DETAIL ===================== */

  const openPartnerDetail = async (partner: Partner) => {
    setSelectedPartner(partner);
    setNewlyGeneratedKey(null);
    setCopiedKey(false);
    setDetailDialogOpen(true);
    await loadPartnerApiKeys(partner.id);
  };

  /* ===================== API KEYS ===================== */

  const loadPartnerApiKeys = async (partnerId: string) => {
    setApiKeysLoading(true);
    try {
      const { data, error } = await supabase
        .from("partner_api_keys")
        .select("id, key_prefix, created_at, revoked_at")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPartnerApiKeys((data || []) as ApiKey[]);
    } catch (error) {
      console.error("Error loading API keys:", error);
      toast.error("Nepodařilo se načíst API klíče");
    } finally {
      setApiKeysLoading(false);
    }
  };

  const generateOrRotateApiKey = async () => {
    if (!selectedPartner || roleLoading) return;

    // Check session first
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      toast.error("Nejste přihlášen. Obnovte stránku a přihlaste se znovu.");
      return;
    }

    setGeneratingKey(true);
    setNewlyGeneratedKey(null);

    try {
      const res = await supabase.functions.invoke("rotate-partner-api-key", {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          partner_id: selectedPartner.id,
        },
      });

      if (res.error) {
        console.error("Edge function error:", res.error);
        throw new Error(res.error.message || "Chyba při volání Edge Function");
      }

      const data = res.data as { success: boolean; api_key?: string; error?: string; message?: string };

      if (data.success && data.api_key) {
        setNewlyGeneratedKey(data.api_key);
        toast.success("API klíč byl úspěšně vygenerován");
        await loadPartnerApiKeys(selectedPartner.id);
      } else {
        throw new Error(data.error || data.message || "Nepodařilo se vygenerovat API klíč");
      }
    } catch (error) {
      console.error("Error generating API key:", error);
      const errorMessage = error instanceof Error ? error.message : "Nepodařilo se vygenerovat API klíč";
      toast.error(errorMessage);
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyNewApiKey = () => {
    if (!newlyGeneratedKey) return;
    navigator.clipboard.writeText(newlyGeneratedKey);
    setCopiedKey(true);
    toast.success("API klíč zkopírován do schránky");
    setTimeout(() => setCopiedKey(false), 3000);
  };

  /* ===================== LOADING ===================== */

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <AdminMenu />
      </div>
    );
  }

  const pendingLogoPartners = partners.filter((p) => p.logo_status === "pending");

  /* ===================== RENDER ===================== */

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Správa partnerů
            </h1>
            <p className="text-muted-foreground mt-1">Správa partnerských účtů a registrací</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {pendingRegistrations.length} čekajících
            </Badge>
            <Badge variant="secondary" className="text-sm flex items-center gap-1">
              <Image className="w-3 h-3" />
              {pendingLogoPartners.length} log ke schválení
            </Badge>
            <Button onClick={openNewDialog} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Přidat partnera
            </Button>
          </div>
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Čekající registrace
            </TabsTrigger>
            <TabsTrigger value="partners" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Partneři
            </TabsTrigger>
            <TabsTrigger value="logos" className="flex items-center gap-2">
              <Image className="w-4 h-4" />
              Schválení log
            </TabsTrigger>
          </TabsList>

          {/* Pending Registrations Tab */}
          <TabsContent value="pending">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Čekající registrace
                </CardTitle>
                <CardDescription>Partnerské registrace čekající na schválení</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : pendingRegistrations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Žádné čekající registrace</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pendingRegistrations.map((reg) => (
                      <Card key={reg.id} className="border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{reg.company_name || "Bez názvu"}</CardTitle>
                          <CardDescription className="text-xs">{reg.email}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Web:</span>
                              <a
                                href={reg.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate max-w-[150px]"
                              >
                                {reg.website_url}
                              </a>
                            </div>
                            {reg.ico && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">IČO:</span>
                                <span className="font-mono">{reg.ico}</span>
                              </div>
                            )}
                            {reg.dic && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">DIČ:</span>
                                <span className="font-mono">{reg.dic}</span>
                              </div>
                            )}
                            {reg.contact_phone && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Telefon:</span>
                                <span>{reg.contact_phone}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Registrace:</span>
                              <span className="text-xs">
                                {format(new Date(reg.created_at), "dd.MM.yyyy HH:mm", { locale: cs })}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleApproveRegistration(reg, "approve")}
                              disabled={approvalLoading === reg.id}
                            >
                              {approvalLoading === reg.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-2" />
                              )}
                              Schválit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleApproveRegistration(reg, "reject")}
                              disabled={approvalLoading === reg.id}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Partners Tab */}
          <TabsContent value="partners">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Seznam partnerů</CardTitle>
                <CardDescription>Všechny registrované partnerské účty</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Web</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Logo</TableHead>
                      <TableHead>Registrace</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((partner) => (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {partner.logo_url ? (
                              <img
                                src={partner.logo_url}
                                alt={partner.name}
                                className="w-10 h-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="font-medium">{partner.name}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <a
                            href={partner.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            {partner.website_url}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[partner.status]}>{statusLabels[partner.status]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={logoStatusColors[partner.logo_status]}>
                            {logoStatusLabels[partner.logo_status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(partner.created_at), "dd.MM.yyyy", { locale: cs })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openPartnerDetail(partner)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(partner)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(partner.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {partners.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Zatím nejsou žádní partneři
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logo Approval Tab */}
          <TabsContent value="logos">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5 text-primary" />
                  Schválení log partnerů
                </CardTitle>
                <CardDescription>Loga čekající na schválení před zveřejněním na homepage</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingLogoPartners.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Image className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Žádná loga ke schválení</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pendingLogoPartners.map((partner) => (
                      <Card key={partner.id} className="border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{partner.name}</CardTitle>
                          <CardDescription className="text-xs">
                            <a
                              href={partner.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {partner.website_url}
                            </a>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {partner.logo_url ? (
                            <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                              <img
                                src={partner.logo_url}
                                alt={`Logo ${partner.name}`}
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                              <p className="text-muted-foreground text-sm">Bez loga</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleLogoApproval(partner.id, "approved")}
                              disabled={logoApprovalLoading === partner.id}
                            >
                              {logoApprovalLoading === partner.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-2" />
                              )}
                              Schválit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleLogoApproval(partner.id, "rejected")}
                              disabled={logoApprovalLoading === partner.id}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Partner Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPartner ? "Upravit partnera" : "Přidat partnera"}</DialogTitle>
            <DialogDescription>
              {editingPartner ? "Upravte údaje partnera" : "Vyplňte údaje nového partnera"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Název partnera</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Název e-shopu"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website_url">Webová stránka</Label>
              <Input
                id="website_url"
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://www.example.cz"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo">Logo</Label>
              <Input
                id="logo"
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              {formData.logo_url && !selectedFile && (
                <div className="mt-2">
                  <img
                    src={formData.logo_url}
                    alt="Current logo"
                    className="h-16 object-contain rounded border"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Ukládám...
                  </>
                ) : editingPartner ? (
                  "Uložit změny"
                ) : (
                  "Vytvořit"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Partner Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedPartner && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selectedPartner.logo_url ? (
                    <img
                      src={selectedPartner.logo_url}
                      alt={selectedPartner.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <div>{selectedPartner.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={statusColors[selectedPartner.status]}>
                        {statusLabels[selectedPartner.status]}
                      </Badge>
                      <Badge variant={logoStatusColors[selectedPartner.logo_status]}>
                        {logoStatusLabels[selectedPartner.logo_status]}
                      </Badge>
                    </div>
                  </div>
                </DialogTitle>
                <DialogDescription>Detail partnera a správa API klíčů</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Partner Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Web:</span>
                    <a
                      href={selectedPartner.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-primary hover:underline"
                    >
                      {selectedPartner.website_url}
                    </a>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Registrace:</span>
                    <span className="ml-2">
                      {format(new Date(selectedPartner.created_at), "dd.MM.yyyy HH:mm", { locale: cs })}
                    </span>
                  </div>
                  {selectedPartner.contact_email && (
                    <div>
                      <span className="text-muted-foreground">E-mail:</span>
                      <span className="ml-2">{selectedPartner.contact_email}</span>
                    </div>
                  )}
                  {selectedPartner.contact_phone && (
                    <div>
                      <span className="text-muted-foreground">Telefon:</span>
                      <span className="ml-2">{selectedPartner.contact_phone}</span>
                    </div>
                  )}
                  {selectedPartner.ico && (
                    <div>
                      <span className="text-muted-foreground">IČO:</span>
                      <span className="ml-2 font-mono">{selectedPartner.ico}</span>
                    </div>
                  )}
                  {selectedPartner.dic && (
                    <div>
                      <span className="text-muted-foreground">DIČ:</span>
                      <span className="ml-2 font-mono">{selectedPartner.dic}</span>
                    </div>
                  )}
                </div>

                {/* API Keys Management */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        API klíče
                      </CardTitle>
                      {isAdmin && selectedPartner.status === "approved" && (
                        <Button size="sm" onClick={generateOrRotateApiKey} disabled={generatingKey}>
                          {generatingKey ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-2" />
                          )}
                          {partnerApiKeys.some((k) => !k.revoked_at)
                            ? "Rotovat API klíč"
                            : "Vygenerovat API klíč"}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedPartner.status !== "approved" && (
                      <Alert>
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          API klíče lze generovat pouze pro schválené partnery.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Newly generated key - show full key once */}
                    {newlyGeneratedKey && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-green-600 mb-1">Nově vygenerovaný klíč</p>
                            <code className="text-sm font-mono bg-background px-2 py-1 rounded break-all block">
                              {newlyGeneratedKey}
                            </code>
                          </div>
                          <Button variant="ghost" size="sm" onClick={copyNewApiKey} className="ml-2 shrink-0">
                            {copiedKey ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          ⚠️ Tento klíč se zobrazí pouze jednou. Zkopírujte ho a uložte na bezpečné místo.
                        </p>
                      </div>
                    )}

                    {/* Existing API keys */}
                    {apiKeysLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : partnerApiKeys.length === 0 && !newlyGeneratedKey ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Partner zatím nemá žádné API klíče
                      </p>
                    ) : (
                      partnerApiKeys.map((key) => (
                        <div
                          key={key.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            key.revoked_at
                              ? "bg-muted/20 border-border/30 opacity-50"
                              : "bg-muted/30 border-border/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                              {key.key_prefix}••••••••••••••••
                            </code>
                            {key.revoked_at && (
                              <Badge variant="destructive" className="text-xs">
                                Zrušeno
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground block">
                              {format(new Date(key.created_at), "dd.MM.yyyy HH:mm", { locale: cs })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AdminMenu />
    </div>
  );
};

export default AdminPartners;
