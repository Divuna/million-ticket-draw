import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, CheckCircle, XCircle, Eye, Coins, FileText, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cs } from 'date-fns/locale';
import { AdminMenu } from '@/components/AdminMenu';

type PartnerStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

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
  invoiceSummary: {
    totalActivations: number;
    totalCoins: number;
    periodStart: string;
    periodEnd: string;
  };
}

const statusLabels: Record<PartnerStatus, string> = {
  pending: 'Čeká na schválení',
  approved: 'Schváleno',
  suspended: 'Pozastaveno',
  rejected: 'Zamítnuto',
};

const statusColors: Record<PartnerStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  approved: 'default',
  suspended: 'destructive',
  rejected: 'outline',
};

const AdminPartnersPortal = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadPartners();
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
    try {
      // Load activations
      const { data: activations } = await supabase
        .from('partner_coin_activations')
        .select('code, coins, activated_at, external_order_id')
        .eq('partner_id', partner.id)
        .order('activated_at', { ascending: false })
        .limit(50);

      // Calculate invoice summary for current month
      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());

      const { data: monthActivations } = await supabase
        .from('partner_coin_activations')
        .select('coins')
        .eq('partner_id', partner.id)
        .gte('activated_at', monthStart.toISOString())
        .lte('activated_at', monthEnd.toISOString());

      const invoiceSummary = {
        totalActivations: monthActivations?.length || 0,
        totalCoins: monthActivations?.reduce((sum, a) => sum + a.coins, 0) || 0,
        periodStart: format(monthStart, 'dd.MM.yyyy', { locale: cs }),
        periodEnd: format(monthEnd, 'dd.MM.yyyy', { locale: cs }),
      };

      setSelectedPartner({
        ...partner,
        activations: activations || [],
        invoiceSummary,
      });
      setDetailOpen(true);
    } catch (error) {
      console.error('Error loading partner detail:', error);
      toast.error('Nepodařilo se načíst detail partnera');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Správa partnerů
            </h1>
            <p className="text-muted-foreground mt-1">Schvalování a správa partnerských účtů</p>
          </div>
          <Badge variant="outline" className="text-sm">
            {partners.filter(p => p.status === 'pending').length} čeká na schválení
          </Badge>
        </div>

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

                {/* Invoice Summary */}
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

      <AdminMenu />
    </div>
  );
};

export default AdminPartnersPortal;
