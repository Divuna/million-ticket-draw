import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase, withEdgeInternalToken } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, CheckCircle, XCircle, Eye, Coins, FileText, Calendar, Key, Copy, Check, Receipt, Send, Download, UserPlus, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cs } from 'date-fns/locale';
import { jsPDF } from 'jspdf';

type PartnerStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string;
  website_url: string;
  contact_email: string | null;
  contact_phone: string | null;
  ico: string | null;
  dic: string | null;
  status: PartnerStatus;
  created_at: string;
  notes: string | null;
}

interface PartnerDetail extends Partner {
  activations: {
    code: string;
    coins: number;
    activated_at: string;
    external_order_id: string | null;
  }[];
  apiKeys: {
    id: string;
    key_prefix: string;
    created_at: string;
    revoked_at: string | null;
  }[];
  invoiceSummary: {
    totalActivations: number;
    totalCoins: number;
    periodStart: string;
    periodEnd: string;
  };
}

interface Invoice {
  id: string;
  partner_id: string;
  partner_name?: string;
  period_start: string;
  period_end: string;
  coins_total: number | null;
  amount_net: number | null;
  vat_amount: number;
  amount_gross: number | null;
  status: InvoiceStatus;
  created_at: string;
  issued_at: string | null;
}

interface InvoiceDetail extends Invoice {
  activationsSummary: string;
  partner: Partner | null;
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

const statusLabels: Record<PartnerStatus, string> = {
  pending: 'Čeká na schválení',
  approved: 'Schváleno',
  suspended: 'Pozastaveno',
  rejected: 'Zamítnuto',
};

const statusColors: Record<PartnerStatus, "pending" | "success" | "destructive" | "outline"> = {
  pending: "pending",
  approved: "success",
  suspended: "destructive",
  rejected: "outline",
};

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: 'Koncept',
  issued: 'Vydáno',
  paid: 'Zaplaceno',
  void: 'Stornováno',
};

const invoiceStatusColors: Record<InvoiceStatus, "pending" | "info" | "success" | "destructive"> = {
  draft: "pending",
  issued: "info",
  paid: "success",
  void: "destructive",
};

const AdminPartnersPortal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  
  // Invoice state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false);
  const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);

  // Pending registrations state
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  useEffect(() => {
    loadPartners();
    loadInvoices();
    loadPendingRegistrations();
  }, []);

  const loadPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartners((data || []) as Partner[]);
    } catch (error) {
      console.error('Error loading partners:', error);
      toast.error('Nepodařilo se načíst partnery');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('partner_invoices')
        .select('*')
        .order('period_start', { ascending: false });

      if (invoicesError) throw invoicesError;

      // Get partner names for invoices
      const partnerIds = [...new Set((invoicesData || []).map(i => i.partner_id))];
      const { data: partnersData } = await supabase
        .from('partners')
        .select('id, name')
        .in('id', partnerIds);

      const partnerMap = new Map((partnersData || []).map(p => [p.id, p.name]));
      
      const invoicesWithNames = (invoicesData || []).map(inv => ({
        ...inv,
        partner_name: partnerMap.get(inv.partner_id) || 'Neznámý partner',
      })) as Invoice[];

      setInvoices(invoicesWithNames);
    } catch (error) {
      console.error('Error loading invoices:', error);
      toast.error('Nepodařilo se načíst faktury');
    } finally {
      setInvoicesLoading(false);
    }
  };

  const loadPendingRegistrations = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('No session for pending registrations');
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

    // Optimistic update - remove from list
    const previousRegistrations = [...pendingRegistrations];
    setPendingRegistrations(pendingRegistrations.filter(r => r.id !== registration.id));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Nejste přihlášen');
      }

      const response = await supabase.functions.invoke('approve-partner-registration', {
        headers: withEdgeInternalToken({
          Authorization: `Bearer ${sessionData.session.access_token}`,
        }),
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
      
      // Reload partners list if approved
      if (action === 'approve') {
        loadPartners();
      }
    } catch (error) {
      console.error('Error approving registration:', error);
      setPendingRegistrations(previousRegistrations);
      toast.error('Nepodařilo se zpracovat registraci');
    } finally {
      setApprovalLoading(null);
    }
  };

  const updatePartnerStatus = async (partnerId: string, newStatus: PartnerStatus) => {
    setActionLoading(partnerId);

    // Optimistic update
    const previousPartners = [...partners];
    setPartners(partners.map(p => p.id === partnerId ? { ...p, status: newStatus } : p));

    try {
      const { error } = await supabase.rpc('admin_set_partner_status', {
        p_partner_id: partnerId,
        p_status: newStatus,
      });

      if (error) throw error;
      toast.success(`Partner ${newStatus === 'approved' ? 'schválen' : newStatus === 'suspended' ? 'pozastaven' : 'aktualizován'}`);
    } catch (error) {
      console.error('Error updating partner status:', error);
      setPartners(previousPartners);
      toast.error('Nepodařilo se aktualizovat status');
    } finally {
      setActionLoading(null);
    }
  };

  const openPartnerDetail = async (partner: Partner) => {
    setNewlyGeneratedKey(null);
    setCopiedKey(false);
    try {
      // Load activations and API keys in parallel
      const [activationsRes, apiKeysRes, monthActivationsRes] = await Promise.all([
        supabase
          .from('partner_coin_activations')
          .select('code, coins, activated_at, external_order_id')
          .eq('partner_id', partner.id)
          .order('activated_at', { ascending: false })
          .limit(50),
        supabase
          .from('partner_api_keys')
          .select('id, key_prefix, created_at, revoked_at')
          .eq('partner_id', partner.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('partner_coin_activations')
          .select('coins')
          .eq('partner_id', partner.id)
          .gte('activated_at', startOfMonth(new Date()).toISOString())
          .lte('activated_at', endOfMonth(new Date()).toISOString()),
      ]);

      const invoiceSummary = {
        totalActivations: monthActivationsRes.data?.length || 0,
        totalCoins: monthActivationsRes.data?.reduce((sum, a) => sum + a.coins, 0) || 0,
        periodStart: format(startOfMonth(new Date()), 'dd.MM.yyyy', { locale: cs }),
        periodEnd: format(endOfMonth(new Date()), 'dd.MM.yyyy', { locale: cs }),
      };

      setSelectedPartner({
        ...partner,
        activations: activationsRes.data || [],
        apiKeys: apiKeysRes.data || [],
        invoiceSummary,
      });
      setDetailOpen(true);
    } catch (error) {
      console.error('Error loading partner detail:', error);
      toast.error('Nepodařilo se načíst detail partnera');
    }
  };

  const generateApiKey = async () => {
    if (!selectedPartner) return;
    
    setGeneratingKey(true);
    try {
      const { data, error } = await supabase.rpc('create_partner_api_key', {
        p_partner_id: selectedPartner.id,
      });

      if (error) throw error;
      
      setNewlyGeneratedKey(data as string);
      toast.success('API klíč byl úspěšně vygenerován');
      
      // Reload API keys
      const { data: apiKeysData } = await supabase
        .from('partner_api_keys')
        .select('id, key_prefix, created_at, revoked_at')
        .eq('partner_id', selectedPartner.id)
        .order('created_at', { ascending: false });
      
      setSelectedPartner({
        ...selectedPartner,
        apiKeys: apiKeysData || [],
      });
    } catch (error) {
      console.error('Error generating API key:', error);
      toast.error('Nepodařilo se vygenerovat API klíč');
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyGeneratedKey = () => {
    if (newlyGeneratedKey) {
      navigator.clipboard.writeText(newlyGeneratedKey);
      setCopiedKey(true);
      toast.success('API klíč zkopírován do schránky');
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const openInvoiceDetail = async (invoice: Invoice) => {
    try {
      // Load partner and activation lines
      const [partnerRes, linesRes] = await Promise.all([
        supabase.from('partners').select('*').eq('id', invoice.partner_id).single(),
        supabase
          .from('partner_invoice_lines')
          .select('coins, activated_at, external_order_id')
          .eq('invoice_id', invoice.id)
          .order('activated_at', { ascending: false }),
      ]);

      // Build STRING_AGG-like summary
      const activationsSummary = (linesRes.data || [])
        .slice(0, 20)
        .map(line => `${line.coins} MioCoins (${format(new Date(line.activated_at), 'dd.MM.', { locale: cs })})`)
        .join(', ');

      setSelectedInvoice({
        ...invoice,
        partner: partnerRes.data as Partner | null,
        activationsSummary: activationsSummary || 'Žádné aktivace',
      });
      setInvoiceDetailOpen(true);
    } catch (error) {
      console.error('Error loading invoice detail:', error);
      toast.error('Nepodařilo se načíst detail faktury');
    }
  };

  const issueInvoice = async () => {
    if (!selectedInvoice) return;

    setIssuingInvoice(true);

    // Optimistic update
    const previousInvoices = [...invoices];
    setInvoices(invoices.map(inv => 
      inv.id === selectedInvoice.id 
        ? { ...inv, status: 'issued' as InvoiceStatus, issued_at: new Date().toISOString() } 
        : inv
    ));
    setSelectedInvoice({ ...selectedInvoice, status: 'issued', issued_at: new Date().toISOString() });

    try {
      const { error } = await supabase
        .from('partner_invoices')
        .update({ status: 'issued', issued_at: new Date().toISOString() })
        .eq('id', selectedInvoice.id);

      if (error) throw error;
      toast.success('Faktura byla úspěšně vydána');
      setIssueConfirmOpen(false);
    } catch (error) {
      console.error('Error issuing invoice:', error);
      setInvoices(previousInvoices);
      setSelectedInvoice({ ...selectedInvoice, status: 'draft', issued_at: null });
      toast.error('Nepodařilo se vydat fakturu');
    } finally {
      setIssuingInvoice(false);
    }
  };

  const downloadInvoicePdf = () => {
    if (!selectedInvoice) return;

    try {
      const doc = new jsPDF();
      const partner = selectedInvoice.partner;
      
      // Title
      doc.setFontSize(20);
      doc.text('FAKTURA', 105, 25, { align: 'center' });
      
      // Status badge
      doc.setFontSize(12);
      doc.text(`Status: ${invoiceStatusLabels[selectedInvoice.status]}`, 105, 35, { align: 'center' });
      
      // Period
      const periodText = `Obdobi: ${format(new Date(selectedInvoice.period_start), 'dd.MM.yyyy', { locale: cs })} - ${format(new Date(selectedInvoice.period_end), 'dd.MM.yyyy', { locale: cs })}`;
      doc.text(periodText, 105, 45, { align: 'center' });
      
      // Divider line
      doc.setLineWidth(0.5);
      doc.line(20, 55, 190, 55);
      
      // Partner details section
      doc.setFontSize(14);
      doc.text('Udaje partnera', 20, 70);
      
      doc.setFontSize(11);
      let yPos = 80;
      
      if (partner) {
        doc.text(`Nazev: ${partner.name}`, 20, yPos);
        yPos += 8;
        if (partner.company_name) {
          doc.text(`Spolecnost: ${partner.company_name}`, 20, yPos);
          yPos += 8;
        }
        if (partner.ico) {
          doc.text(`ICO: ${partner.ico}`, 20, yPos);
          yPos += 8;
        }
        if (partner.dic) {
          doc.text(`DIC: ${partner.dic}`, 20, yPos);
          yPos += 8;
        }
        if (partner.contact_email) {
          doc.text(`E-mail: ${partner.contact_email}`, 20, yPos);
          yPos += 8;
        }
      } else {
        doc.text(`Partner: ${selectedInvoice.partner_name}`, 20, yPos);
        yPos += 8;
      }
      
      // Divider line
      yPos += 5;
      doc.line(20, yPos, 190, yPos);
      yPos += 15;
      
      // Financial details section
      doc.setFontSize(14);
      doc.text('Financni prehled', 20, yPos);
      yPos += 15;
      
      doc.setFontSize(11);
      
      // Create a simple table layout
      const col1 = 30;
      const col2 = 130;
      
      doc.text('MioCoiny celkem:', col1, yPos);
      doc.text(`${(selectedInvoice.coins_total || 0).toLocaleString()}`, col2, yPos);
      yPos += 10;
      
      doc.text('Castka netto:', col1, yPos);
      doc.text(`${(selectedInvoice.amount_net || 0).toLocaleString()} Kc`, col2, yPos);
      yPos += 10;
      
      doc.text('DPH:', col1, yPos);
      doc.text(`${selectedInvoice.vat_amount.toLocaleString()} Kc`, col2, yPos);
      yPos += 10;
      
      // Total with emphasis
      doc.setLineWidth(0.3);
      doc.line(col1 - 5, yPos - 3, col2 + 40, yPos - 3);
      
      doc.setFontSize(13);
      doc.text('Celkem brutto:', col1, yPos + 5);
      doc.text(`${(selectedInvoice.amount_gross || 0).toLocaleString()} Kc`, col2, yPos + 5);
      yPos += 20;
      
      // Issued date if available
      if (selectedInvoice.issued_at) {
        doc.setFontSize(10);
        doc.text(`Vydano: ${format(new Date(selectedInvoice.issued_at), 'dd.MM.yyyy HH:mm', { locale: cs })}`, 20, yPos);
        yPos += 10;
      }
      
      // Footer
      doc.setFontSize(9);
      doc.setTextColor(128);
      doc.text('Vygenerovano z OneMil Partner Portal', 105, 280, { align: 'center' });
      doc.text(`Datum generovani: ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: cs })}`, 105, 286, { align: 'center' });
      
      // Generate filename
      const partnerSlug = (selectedInvoice.partner_name || 'partner').replace(/\s+/g, '-').toLowerCase();
      const periodSlug = format(new Date(selectedInvoice.period_start), 'yyyy-MM');
      const filename = `faktura-${partnerSlug}-${periodSlug}.pdf`;
      
      doc.save(filename);
      toast.success('PDF bylo staženo');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Nepodařilo se vygenerovat PDF');
    }
  };

  if (!user) return <NavigateToLogin />;
  if (roleLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Správa partnerů a fakturace
            </h1>
            <p className="text-muted-foreground mt-1">Schvalování partnerů a správa faktur</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {pendingRegistrations.length} čekajících registrací
            </Badge>
            <Badge variant="secondary" className="text-sm">
              {invoices.filter(i => i.status === 'draft').length} faktur k vydání
            </Badge>
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
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Faktury
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
                <CardDescription>Partnerské registrace čekající na schválení (z auth.users metadata)</CardDescription>
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
                          <CardTitle className="text-base">{reg.company_name || 'Bez názvu'}</CardTitle>
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
                              <span className="text-xs">{format(new Date(reg.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleApproveRegistration(reg, 'approve')}
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
                              onClick={() => handleApproveRegistration(reg, 'reject')}
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
                      <TableHead>Kontakt</TableHead>
                      <TableHead>IČO</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registrace</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((partner) => (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <img
                              src={partner.logo_url}
                              alt={partner.name}
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                            <div>
                              <div className="font-medium">{partner.name}</div>
                              <a
                                href={partner.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary"
                              >
                                {partner.website_url}
                              </a>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{partner.contact_email || '—'}</div>
                          <div className="text-xs text-muted-foreground">{partner.contact_phone || ''}</div>
                        </TableCell>
                        <TableCell className="text-sm">{partner.ico || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[partner.status]}>
                            {statusLabels[partner.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(partner.created_at), 'dd.MM.yyyy', { locale: cs })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPartnerDetail(partner)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {partner.status === 'pending' && (
                              <>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => updatePartnerStatus(partner.id, 'approved')}
                                  disabled={actionLoading === partner.id}
                                >
                                  {actionLoading === partner.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => updatePartnerStatus(partner.id, 'rejected')}
                                  disabled={actionLoading === partner.id}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {partner.status === 'approved' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updatePartnerStatus(partner.id, 'suspended')}
                                disabled={actionLoading === partner.id}
                              >
                                Pozastavit
                              </Button>
                            )}
                            {partner.status === 'suspended' && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => updatePartnerStatus(partner.id, 'approved')}
                                disabled={actionLoading === partner.id}
                              >
                                Obnovit
                              </Button>
                            )}
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

          {/* Invoices Tab */}
          <TabsContent value="invoices">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Seznam faktur</CardTitle>
                <CardDescription>Přehled všech partnerských faktur</CardDescription>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Období</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead className="text-right">MioCoiny</TableHead>
                        <TableHead className="text-right">Částka netto</TableHead>
                        <TableHead className="text-right">DPH</TableHead>
                        <TableHead className="text-right">Částka brutto</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Akce</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="text-sm">
                            {format(new Date(invoice.period_start), 'dd.MM.', { locale: cs })} – {format(new Date(invoice.period_end), 'dd.MM.yyyy', { locale: cs })}
                          </TableCell>
                          <TableCell className="font-medium">{invoice.partner_name}</TableCell>
                          <TableCell className="text-right font-medium text-primary">
                            {(invoice.coins_total || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {(invoice.amount_net || 0).toLocaleString()} Kč
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {invoice.vat_amount.toLocaleString()} Kč
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {(invoice.amount_gross || 0).toLocaleString()} Kč
                          </TableCell>
                          <TableCell>
                            <Badge variant={invoiceStatusColors[invoice.status]}>
                              {invoiceStatusLabels[invoice.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openInvoiceDetail(invoice)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {invoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Zatím nejsou žádné faktury
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Partner Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedPartner && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <img
                    src={selectedPartner.logo_url}
                    alt={selectedPartner.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div>
                    <div>{selectedPartner.name}</div>
                    <Badge variant={statusColors[selectedPartner.status]} className="mt-1">
                      {statusLabels[selectedPartner.status]}
                    </Badge>
                  </div>
                </DialogTitle>
                <DialogDescription>Detail partnera a přehled aktivací</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Partner Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Společnost:</span>
                    <span className="ml-2 font-medium">{selectedPartner.company_name || selectedPartner.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Web:</span>
                    <a href={selectedPartner.website_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline">
                      {selectedPartner.website_url}
                    </a>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IČO:</span>
                    <span className="ml-2 font-medium">{selectedPartner.ico || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DIČ:</span>
                    <span className="ml-2 font-medium">{selectedPartner.dic || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">E-mail:</span>
                    <span className="ml-2 font-medium">{selectedPartner.contact_email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Telefon:</span>
                    <span className="ml-2 font-medium">{selectedPartner.contact_phone || '—'}</span>
                  </div>
                </div>

                {/* API Keys Management */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        API klíče
                      </CardTitle>
                      <Button
                        size="sm"
                        onClick={generateApiKey}
                        disabled={generatingKey}
                      >
                        {generatingKey ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Key className="w-4 h-4 mr-2" />
                        )}
                        Vygenerovat API klíč
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Newly generated key - show full key once */}
                    {newlyGeneratedKey && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-600 mb-1">Nově vygenerovaný klíč</p>
                            <code className="text-sm font-mono bg-background px-2 py-1 rounded break-all">
                              {newlyGeneratedKey}
                            </code>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={copyGeneratedKey}
                          >
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
                    {selectedPartner.apiKeys.length === 0 && !newlyGeneratedKey ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Partner zatím nemá žádné API klíče
                      </p>
                    ) : (
                      selectedPartner.apiKeys.map((key) => (
                        <div
                          key={key.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            key.revoked_at ? 'bg-muted/20 border-border/30 opacity-50' : 'bg-muted/30 border-border/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                              {key.key_prefix}••••••••••••••••
                            </code>
                            {key.revoked_at && (
                              <Badge variant="destructive" className="text-xs">Zrušeno</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>


                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Podklad pro fakturaci
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">{selectedPartner.invoiceSummary.totalActivations}</div>
                        <div className="text-xs text-muted-foreground">Aktivací</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary">{selectedPartner.invoiceSummary.totalCoins.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">MioCoinů</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-sm font-medium flex items-center justify-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {selectedPartner.invoiceSummary.periodStart} – {selectedPartner.invoiceSummary.periodEnd}
                        </div>
                        <div className="text-xs text-muted-foreground">Fakturační období</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Activations */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    Poslední aktivace
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kód</TableHead>
                        <TableHead className="text-right">MioCoiny</TableHead>
                        <TableHead>Objednávka</TableHead>
                        <TableHead>Datum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPartner.activations.slice(0, 10).map((activation, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-sm">{activation.code}</TableCell>
                          <TableCell className="text-right font-medium text-primary">
                            {activation.coins.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {activation.external_order_id || '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(activation.activated_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                          </TableCell>
                        </TableRow>
                      ))}
                      {selectedPartner.activations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                            Zatím žádné aktivace
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={invoiceDetailOpen} onOpenChange={setInvoiceDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Receipt className="w-6 h-6 text-primary" />
                  <div>
                    <div>Faktura – {selectedInvoice.partner_name}</div>
                    <Badge variant={invoiceStatusColors[selectedInvoice.status]} className="mt-1">
                      {invoiceStatusLabels[selectedInvoice.status]}
                    </Badge>
                  </div>
                </DialogTitle>
                <DialogDescription>
                  Období: {format(new Date(selectedInvoice.period_start), 'dd.MM.', { locale: cs })} – {format(new Date(selectedInvoice.period_end), 'dd.MM.yyyy', { locale: cs })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Partner Info */}
                {selectedInvoice.partner && (
                  <div className="grid grid-cols-2 gap-4 text-sm p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div>
                      <span className="text-muted-foreground">Partner:</span>
                      <span className="ml-2 font-medium">{selectedInvoice.partner.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IČO:</span>
                      <span className="ml-2 font-medium">{selectedInvoice.partner.ico || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">DIČ:</span>
                      <span className="ml-2 font-medium">{selectedInvoice.partner.dic || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">E-mail:</span>
                      <span className="ml-2 font-medium">{selectedInvoice.partner.contact_email || '—'}</span>
                    </div>
                  </div>
                )}

                {/* Totals */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      Souhrn fakturace
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">{(selectedInvoice.coins_total || 0).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">MioCoinů</div>
                      </div>
                      <div>
                        <div className="text-xl font-semibold">{(selectedInvoice.amount_net || 0).toLocaleString()} Kč</div>
                        <div className="text-xs text-muted-foreground">Částka netto</div>
                      </div>
                      <div>
                        <div className="text-lg text-muted-foreground">{selectedInvoice.vat_amount.toLocaleString()} Kč</div>
                        <div className="text-xs text-muted-foreground">DPH</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{(selectedInvoice.amount_gross || 0).toLocaleString()} Kč</div>
                        <div className="text-xs text-muted-foreground">Celkem brutto</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Activations Summary */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Přehled aktivací
                  </h4>
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedInvoice.activationsSummary}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-border/50 flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={downloadInvoicePdf}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Stáhnout PDF
                  </Button>
                  
                  {selectedInvoice.status === 'draft' && (
                    <Button
                      onClick={() => setIssueConfirmOpen(true)}
                      className="flex-1"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Vydat fakturu
                    </Button>
                  )}
                </div>

                {selectedInvoice.issued_at && (
                  <div className="text-sm text-muted-foreground text-center">
                    Vydáno: {format(new Date(selectedInvoice.issued_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Issue Invoice Confirmation Dialog */}
      <Dialog open={issueConfirmOpen} onOpenChange={setIssueConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Potvrdit vydání faktury
            </DialogTitle>
            <DialogDescription>
              Opravdu chcete vydat tuto fakturu? Status bude změněn z "Koncept" na "Vydáno".
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="py-4">
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Partner:</span>
                  <span className="font-medium">{selectedInvoice.partner_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MioCoiny:</span>
                  <span className="font-medium text-primary">{(selectedInvoice.coins_total || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Celkem:</span>
                  <span className="font-bold">{(selectedInvoice.amount_gross || 0).toLocaleString()} Kč</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIssueConfirmOpen(false)}
              disabled={issuingInvoice}
            >
              Zrušit
            </Button>
            <Button
              onClick={issueInvoice}
              disabled={issuingInvoice}
            >
              {issuingInvoice ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Vydat fakturu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};

export default AdminPartnersPortal;
