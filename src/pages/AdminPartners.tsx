import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, ExternalLink, Upload, CheckCircle, XCircle, Loader2, Clock, Building2, Globe, Phone, FileText, Image, Key, Eye, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface Partner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  created_at: string;
  updated_at: string;
  status: string;
  logo_status: string;
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
  last_used_at: string | null;
}

const AdminPartners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    website_url: ''
  });
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Pending registrations state
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  // Partner detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [partnerApiKeys, setPartnerApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    fetchPartners();
    loadPendingRegistrations();
  }, []);

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error('Error fetching partners:', error);
      toast.error('Nepodařilo se načíst partnery');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRegistrations = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('No session for pending registrations');
        setPendingLoading(false);
        return;
      }

      const response = await supabase.functions.invoke('get-pending-partner-registrations', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (response.error) {
        throw response.error;
      }

      const data = response.data as { success: boolean; registrations: PendingRegistration[] };
      
      if (data.success) {
        setPendingRegistrations(data.registrations || []);
      }
    } catch (error) {
      console.error('Error loading pending registrations:', error);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleApproveRegistration = async (registration: PendingRegistration, action: 'approve' | 'reject') => {
    setApprovalLoading(registration.id);

    const previousRegistrations = [...pendingRegistrations];
    setPendingRegistrations(pendingRegistrations.filter(r => r.id !== registration.id));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Nejste přihlášen');
      }

      const response = await supabase.functions.invoke('approve-partner-registration', {
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

      toast.success(action === 'approve' ? 'Partner byl schválen' : 'Registrace byla zamítnuta');
      
      if (action === 'approve') {
        fetchPartners();
      }
    } catch (error) {
      console.error('Error approving registration:', error);
      setPendingRegistrations(previousRegistrations);
      toast.error('Nepodařilo se zpracovat registraci');
    } finally {
      setApprovalLoading(null);
    }
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('partner-logos')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('partner-logos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.website_url) {
      toast.error('Název partnera a URL webu jsou povinné');
      return;
    }

    if (!editingPartner && !selectedFile) {
      toast.error('Logo je povinné pro nového partnera');
      return;
    }

    try {
      setUploading(true);
      let logoUrl = formData.logo_url;

      if (selectedFile) {
        logoUrl = await uploadLogo(selectedFile);
      }

      const partnerData = {
        name: formData.name,
        logo_url: logoUrl,
        website_url: formData.website_url
      };

      if (editingPartner) {
        const { error } = await supabase
          .from('partners')
          .update(partnerData)
          .eq('id', editingPartner.id);

        if (error) throw error;
        toast.success('Partner byl úspěšně upraven');
      } else {
        const { error } = await supabase
          .from('partners')
          .insert([partnerData]);

        if (error) throw error;
        toast.success('Partner byl úspěšně přidán');
      }

      setDialogOpen(false);
      setEditingPartner(null);
      setFormData({ name: '', logo_url: '', website_url: '' });
      setSelectedFile(null);
      fetchPartners();
    } catch (error) {
      console.error('Error saving partner:', error);
      toast.error('Nepodařilo se uložit partnera');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      logo_url: partner.logo_url,
      website_url: partner.website_url
    });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Opravdu chcete smazat tohoto partnera?')) return;

    try {
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Partner byl úspěšně smazán');
      fetchPartners();
    } catch (error) {
      console.error('Error deleting partner:', error);
      toast.error('Nepodařilo se smazat partnera');
    }
  };

  const handleLogoApproval = async (partnerId: string, action: 'approve' | 'reject') => {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('partners')
        .update({ logo_status: newStatus })
        .eq('id', partnerId);

      if (error) throw error;
      
      toast.success(action === 'approve' ? 'Logo bylo schváleno' : 'Logo bylo zamítnuto');
      fetchPartners();
    } catch (error) {
      console.error('Error updating logo status:', error);
      toast.error('Nepodařilo se aktualizovat status loga');
    }
  };

  const getLogoStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />Schváleno</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Čeká</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Zamítnuto</Badge>;
      default:
        return <Badge variant="outline"><Image className="w-3 h-3 mr-1" />Není</Badge>;
    }
  };

  const getPartnerStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Aktivní</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Čeká</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const partnersWithPendingLogos = partners.filter(p => p.logo_status === 'pending');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Povolené formáty: PNG, JPG, SVG');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Maximální velikost souboru je 5MB');
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const openDialog = () => {
    setEditingPartner(null);
    setFormData({ name: '', logo_url: '', website_url: '' });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  // Partner detail and API key functions
  const openPartnerDetail = async (partner: Partner) => {
    setSelectedPartner(partner);
    setDetailDialogOpen(true);
    setNewlyGeneratedKey(null);
    setCopiedKey(false);
    await loadPartnerApiKeys(partner.id);
  };

  const loadPartnerApiKeys = async (partnerId: string) => {
    setApiKeysLoading(true);
    try {
      const { data, error } = await supabase
        .from('partner_api_keys')
        .select('id, key_prefix, created_at, revoked_at, last_used_at')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartnerApiKeys(data || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error('Nepodařilo se načíst API klíče');
    } finally {
      setApiKeysLoading(false);
    }
  };

  const generateApiKey = async () => {
    if (!selectedPartner) return;
    
    setGeneratingKey(true);
    setNewlyGeneratedKey(null);
    
    try {
      const { data, error } = await supabase.rpc('generate_partner_api_key', {
        p_partner_id: selectedPartner.id
      });

      if (error) throw error;
      
      // The RPC returns an array with api_key, created_at, key_id, key_prefix
      if (data && data.length > 0) {
        setNewlyGeneratedKey(data[0].api_key);
        toast.success('API klíč byl úspěšně vygenerován');
      }
      
      // Reload API keys list
      await loadPartnerApiKeys(selectedPartner.id);
    } catch (error) {
      console.error('Error generating API key:', error);
      toast.error('Nepodařilo se vygenerovat API klíč');
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyNewApiKey = () => {
    if (newlyGeneratedKey) {
      navigator.clipboard.writeText(newlyGeneratedKey);
      setCopiedKey(true);
      toast.success('API klíč byl zkopírován do schránky');
      setTimeout(() => setCopiedKey(false), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Načítání partnerů...</p>
            </div>
          </div>
        </div>
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Správa partnerů</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openDialog} className="gap-2">
                <Plus className="w-4 h-4" />
                Přidat partnera
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingPartner ? 'Upravit partnera' : 'Přidat partnera'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Název partnera</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Zadejte název partnera"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="logo">Logo partnera</Label>
                  <div className="space-y-2">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      onChange={handleFileSelect}
                      className="cursor-pointer"
                    />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Upload className="w-4 h-4" />
                      <span>PNG, JPG, SVG (max 5MB)</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Doporučené rozměry: 16:9 poměr stran (např. 320×180px nebo 640×360px)
                    </p>
                    {selectedFile && (
                      <p className="text-sm text-green-600">
                        Vybrán soubor: {selectedFile.name}
                      </p>
                    )}
                    {editingPartner && !selectedFile && (
                      <p className="text-sm text-muted-foreground">
                        Aktuálně: {editingPartner.name} logo
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="website_url">URL webu</Label>
                  <Input
                    id="website_url"
                    value={formData.website_url}
                    onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1" disabled={uploading}>
                    {uploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                        Nahrávání...
                      </>
                    ) : (
                      editingPartner ? 'Uložit změny' : 'Přidat partnera'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={uploading}
                  >
                    Zrušit
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="partners" className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="w-4 h-4" />
              Čekající registrace
              {pendingRegistrations.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pendingRegistrations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="logos" className="gap-2">
              <Image className="w-4 h-4" />
              Schválení log
              {partnersWithPendingLogos.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {partnersWithPendingLogos.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="partners" className="gap-2">
              <Building2 className="w-4 h-4" />
              Partneři
            </TabsTrigger>
          </TabsList>

          {/* Pending Registrations Tab */}
          <TabsContent value="pending" className="mt-6">
            {pendingLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : pendingRegistrations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Clock className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Žádné čekající registrace
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingRegistrations.map((registration) => (
                  <Card key={registration.id} className="border-2 border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Building2 className="w-5 h-5 text-amber-600" />
                        <span className="truncate">{registration.company_name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="font-medium">E-mail:</span>
                          <span className="truncate">{registration.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="w-4 h-4 flex-shrink-0" />
                          <a 
                            href={registration.website_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {registration.website_url}
                          </a>
                        </div>
                        {registration.contact_phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-4 h-4 flex-shrink-0" />
                            <span>{registration.contact_phone}</span>
                          </div>
                        )}
                        {(registration.ico || registration.dic) && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <FileText className="w-4 h-4 flex-shrink-0" />
                            <span>
                              {registration.ico && `IČO: ${registration.ico}`}
                              {registration.ico && registration.dic && ' | '}
                              {registration.dic && `DIČ: ${registration.dic}`}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4 flex-shrink-0" />
                          <span>
                            {format(new Date(registration.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          className="flex-1 gap-1"
                          onClick={() => handleApproveRegistration(registration, 'approve')}
                          disabled={approvalLoading === registration.id}
                        >
                          {approvalLoading === registration.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                          Schválit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1"
                          onClick={() => handleApproveRegistration(registration, 'reject')}
                          disabled={approvalLoading === registration.id}
                        >
                          <XCircle className="w-4 h-4" />
                          Zamítnout
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Logo Approval Tab */}
          <TabsContent value="logos" className="mt-6">
            {partnersWithPendingLogos.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Image className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Žádná loga ke schválení
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {partnersWithPendingLogos.map((partner) => (
                  <Card key={partner.id} className="border-2 border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Building2 className="w-5 h-5 text-amber-600" />
                        <span className="truncate">{partner.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden border-2 border-border">
                        {partner.logo_url ? (
                          <img
                            src={partner.logo_url}
                            alt={partner.name}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <Image className="w-12 h-12 text-muted-foreground/50" />
                        )}
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="w-4 h-4 flex-shrink-0" />
                          <a 
                            href={partner.website_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {partner.website_url}
                          </a>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Status partnera:</span>
                          {getPartnerStatusBadge(partner.status)}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          className="flex-1 gap-1"
                          onClick={() => handleLogoApproval(partner.id, 'approve')}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Schválit logo
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1"
                          onClick={() => handleLogoApproval(partner.id, 'reject')}
                        >
                          <XCircle className="w-4 h-4" />
                          Zamítnout
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Partners Tab */}
          <TabsContent value="partners" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {partners.map((partner) => (
                <Card key={partner.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="truncate">{partner.name}</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPartnerDetail(partner)}
                          title="Zobrazit detail"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(partner.website_url, '_blank')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(partner)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(partner.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                        {partner.logo_url ? (
                          <img
                            src={partner.logo_url}
                            alt={partner.name}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : (
                          <Image className="w-8 h-8 text-muted-foreground/50" />
                        )}
                        <div className="hidden flex-col items-center justify-center text-muted-foreground">
                          <span className="text-sm">Chyba načítání loga</span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-2">
                        <div className="flex items-center justify-between">
                          <span><strong>Status:</strong></span>
                          {getPartnerStatusBadge(partner.status)}
                        </div>
                        <div className="flex items-center justify-between">
                          <span><strong>Logo:</strong></span>
                          {getLogoStatusBadge(partner.logo_status)}
                        </div>
                        <p><strong>Web:</strong> {partner.website_url}</p>
                        <p><strong>Vytvořeno:</strong> {new Date(partner.created_at).toLocaleDateString('cs-CZ')}</p>
                        
                        {partner.logo_status === 'pending' && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              className="flex-1 gap-1"
                              onClick={() => handleLogoApproval(partner.id, 'approve')}
                            >
                              <CheckCircle className="w-4 h-4" />
                              Schválit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1"
                              onClick={() => handleLogoApproval(partner.id, 'reject')}
                            >
                              <XCircle className="w-4 h-4" />
                              Zamítnout
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {partners.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground text-center mb-4">
                    Zatím nejsou přidáni žádní partneři
                  </p>
                  <Button onClick={openDialog} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Přidat prvního partnera
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Partner Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) {
            setNewlyGeneratedKey(null);
            setCopiedKey(false);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Detail partnera: {selectedPartner?.name}
              </DialogTitle>
            </DialogHeader>
            
            {selectedPartner && (
              <div className="space-y-6">
                {/* Partner Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Základní informace</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                        {selectedPartner.logo_url ? (
                          <img
                            src={selectedPartner.logo_url}
                            alt={selectedPartner.name}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <Image className="w-6 h-6 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{selectedPartner.name}</span>
                          {getPartnerStatusBadge(selectedPartner.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Globe className="w-4 h-4" />
                          <a 
                            href={selectedPartner.website_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {selectedPartner.website_url}
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Logo status:</span>
                      {getLogoStatusBadge(selectedPartner.logo_status)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Vytvořeno: {format(new Date(selectedPartner.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                    </div>
                  </CardContent>
                </Card>

                {/* API Keys Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Key className="w-5 h-5" />
                      API klíče partnera
                    </CardTitle>
                    <CardDescription>
                      Spravujte API klíče pro tohoto partnera
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Newly generated key warning */}
                    {newlyGeneratedKey && (
                      <Alert className="border-amber-500/50 bg-amber-500/10">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="space-y-3">
                          <p className="font-medium text-amber-700">
                            ⚠️ DŮLEŽITÉ: Tento API klíč se zobrazí pouze jednou!
                          </p>
                          <p className="text-sm text-amber-600">
                            Zkopírujte si klíč nyní a bezpečně ho uložte. Po zavření tohoto dialogu už nebude možné klíč znovu zobrazit.
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <code className="flex-1 text-sm font-mono bg-background px-3 py-2 rounded border break-all">
                              {newlyGeneratedKey}
                            </code>
                            <Button
                              size="sm"
                              variant={copiedKey ? "default" : "outline"}
                              onClick={copyNewApiKey}
                              className="flex-shrink-0"
                            >
                              {copiedKey ? (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  Zkopírováno
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4 mr-1" />
                                  Kopírovat
                                </>
                              )}
                            </Button>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Generate new key button */}
                    <div className="flex items-center justify-between">
                      <Button
                        onClick={generateApiKey}
                        disabled={generatingKey || selectedPartner.status !== 'approved'}
                        className="gap-2"
                      >
                        {generatingKey ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        {partnerApiKeys.filter(k => !k.revoked_at).length > 0 
                          ? 'Rotovat API klíč' 
                          : 'Vygenerovat API klíč'}
                      </Button>
                      {selectedPartner.status !== 'approved' && (
                        <span className="text-sm text-muted-foreground">
                          Partner musí být schválen pro generování klíčů
                        </span>
                      )}
                    </div>

                    {/* Existing keys list */}
                    {apiKeysLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : partnerApiKeys.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Key className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p>Partner zatím nemá žádné API klíče</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Existující klíče:</p>
                        {partnerApiKeys.map((key) => (
                          <div
                            key={key.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              key.revoked_at 
                                ? 'bg-muted/30 border-border/50 opacity-60' 
                                : 'bg-muted/50 border-border'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Key className="w-4 h-4 text-muted-foreground" />
                              <code className="text-sm font-mono">
                                {key.key_prefix}••••••••••••••••
                              </code>
                              {key.revoked_at && (
                                <Badge variant="destructive" className="text-xs">Zneplatněn</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminPartners;
