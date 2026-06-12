import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

type InvoiceStatus = 'draft' | 'issued' | 'paid';

interface Invoice {
  id: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  coins_total: number | null;
  amount_net: number | null;
  vat_amount: number;
  amount_gross: number | null;
  status: InvoiceStatus;
  created_at: string;
  partner?: { name: string; company_name: string | null };
}

interface InvoiceLine {
  id: number;
  invoice_id: string;
  activation_id: string;
  coins: number;
  activated_at: string;
  external_order_id: string | null;
}

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
}

const statusLabels: Record<InvoiceStatus, string> = {
  draft: 'Koncept',
  issued: 'Odesláno',
  paid: 'Zaplaceno',
};

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  issued: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  paid: 'bg-green-500/10 text-green-600 border-green-500/20',
};

const AdminInvoices: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPartner, setSelectedPartner] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Drawer state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const currentWeekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchPartners();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchInvoices();
  }, [selectedPartner, selectedStatus, weekOffset, user, isAdmin]);

  const fetchPartners = async () => {
    const { data } = await supabase
      .from('partners')
      .select('id, name, company_name')
      .order('name');
    if (data) setPartners(data);
  };

  const fetchInvoices = async () => {
    setLoading(true);
    let query = supabase
      .from('partner_invoices')
      .select('*, partner:partners(name, company_name)')
      .order('period_start', { ascending: false });

    if (selectedPartner !== 'all') {
      query = query.eq('partner_id', selectedPartner);
    }
    if (selectedStatus !== 'all') {
      query = query.eq('status', selectedStatus);
    }

    // Filter by week period
    query = query
      .gte('period_start', format(currentWeekStart, 'yyyy-MM-dd'))
      .lte('period_start', format(currentWeekEnd, 'yyyy-MM-dd'));

    const { data, error } = await query;
    if (error) {
      toast.error('Chyba při načítání faktur');
      console.error(error);
    } else {
      setInvoices(data || []);
    }
    setLoading(false);
  };

  const fetchInvoiceLines = async (invoiceId: string) => {
    setLinesLoading(true);
    const { data, error } = await supabase
      .from('partner_invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('activated_at', { ascending: false });

    if (error) {
      toast.error('Chyba při načítání položek faktury');
      console.error(error);
    } else {
      setInvoiceLines(data || []);
    }
    setLinesLoading(false);
  };

  const openInvoiceDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPdfUrl(null);
    fetchInvoiceLines(invoice.id);
    fetchExistingPdf(invoice.id);
  };

  const closeDrawer = () => {
    setSelectedInvoice(null);
    setInvoiceLines([]);
    setPdfUrl(null);
  };

  const fetchExistingPdf = async (invoiceId: string) => {
    const { data } = await supabase
      .from('partner_invoice_exports')
      .select('file_url')
      .eq('invoice_id', invoiceId)
      .eq('format', 'pdf')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.file_url) setPdfUrl(data.file_url);
  };

  const generatePdf = async () => {
    if (!selectedInvoice) return;
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-partner-invoice-pdf', {
        body: { invoice_id: selectedInvoice.id },
      });
      if (error) throw error;
      if (data?.file_url) {
        setPdfUrl(data.file_url);
        toast.success('PDF faktura byla vygenerována');
      } else {
        throw new Error('Chybí URL souboru');
      }
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast.error('Chyba při generování PDF faktury');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ISDOC generation temporarily disabled
  // const generateIsdoc = async () => {
  //   if (!selectedInvoice) return;
  //   setGeneratingIsdoc(true);
  //
  //   try {
  //     const { data, error } = await supabase.functions.invoke('generate-isdoc', {
  //       body: { invoice_id: selectedInvoice.id }
  //     });
  //
  //     if (error) throw error;
  //
  //     if (data?.file_url) {
  //       toast.success('ISDOC vygenerován');
  //       window.open(data.file_url, '_blank');
  //     }
  //   } catch (err) {
  //     toast.error('Chyba při generování ISDOC');
  //     console.error(err);
  //   } finally {
  //     setGeneratingIsdoc(false);
  //   }
  // };

  const sendInvoiceEmail = async () => {
    if (!selectedInvoice) return;

    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-partner-invoice-email', {
        body: { invoice_id: selectedInvoice.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Faktura byla odeslána na ${data.sent_to}`);
    } catch (err: any) {
      console.error('Error sending invoice email:', err);
      toast.error(err?.message || 'Chyba při odesílání faktury emailem');
    } finally {
      setSendingEmail(false);
    }
  };

  const resendInvoiceEmail = async () => {
    if (!selectedInvoice) return;

    if (!pdfUrl) {
      toast.error('PDF faktura zatím není k dispozici.');
      return;
    }

    setResendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-partner-invoice-email', {
        body: { invoice_id: selectedInvoice.id, resend: true },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Faktura byla znovu odeslána.');
    } catch (err) {
      console.error('Error resending invoice email:', err);
      toast.error('Fakturu se nepodařilo znovu odeslat.');
    } finally {
      setResendingEmail(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(amount);
  };

  const getPartnerDisplayName = (invoice: Invoice) => {
    return invoice.partner?.company_name || invoice.partner?.name || 'Neznámý partner';
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh] py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <NavigateToLogin />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
    <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Faktury</h1>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Partner filter */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Partner</label>
                <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                  <SelectTrigger>
                    <SelectValue placeholder="Všichni partneři" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Všichni partneři</SelectItem>
                    {partners.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.company_name || p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status filter */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Stav</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Všechny stavy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Všechny stavy</SelectItem>
                    <SelectItem value="draft">Koncept</SelectItem>
                    <SelectItem value="issued">Odesláno</SelectItem>
                    <SelectItem value="paid">Zaplaceno</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Week navigation */}
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Období</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setWeekOffset(prev => prev - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center font-medium">
                    {format(currentWeekStart, 'd. M.', { locale: cs })} – {format(currentWeekEnd, 'd. M. yyyy', { locale: cs })}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setWeekOffset(prev => prev + 1)}
                    disabled={weekOffset >= 0}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {weekOffset !== 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                      Tento týden
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Seznam faktur
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Žádné faktury pro vybrané období
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Období</TableHead>
                      <TableHead className="text-right">Coiny</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">DPH</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(invoice => (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openInvoiceDetail(invoice)}
                      >
                        <TableCell className="font-medium">
                          {getPartnerDisplayName(invoice)}
                        </TableCell>
                        <TableCell>
                          {format(new Date(invoice.period_start), 'd. M.', { locale: cs })} – {format(new Date(invoice.period_end), 'd. M.', { locale: cs })}
                        </TableCell>
                        <TableCell className="text-right">
                          {(invoice.coins_total ?? 0).toLocaleString('cs-CZ')}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(invoice.amount_net ?? 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(invoice.vat_amount))}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(Number(invoice.amount_gross ?? 0))}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[invoice.status]}>
                            {statusLabels[invoice.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice Detail Drawer */}
      <Drawer open={!!selectedInvoice} onOpenChange={(open) => !open && closeDrawer()}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>
              Detail faktury – {selectedInvoice && getPartnerDisplayName(selectedInvoice)}
            </DrawerTitle>
            <DrawerDescription>
              {selectedInvoice && (
                <>
                  Období: {format(new Date(selectedInvoice.period_start), 'd. M.', { locale: cs })} – {format(new Date(selectedInvoice.period_end), 'd. M. yyyy', { locale: cs })}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 overflow-y-auto max-h-[50vh]">
            {/* Summary */}
            {selectedInvoice && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Coiny</div>
                  <div className="font-semibold">{(selectedInvoice.coins_total ?? 0).toLocaleString('cs-CZ')}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Netto</div>
                  <div className="font-semibold">{formatCurrency(Number(selectedInvoice.amount_net ?? 0))}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">DPH</div>
                  <div className="font-semibold">{formatCurrency(Number(selectedInvoice.vat_amount))}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Brutto</div>
                  <div className="font-semibold">{formatCurrency(Number(selectedInvoice.amount_gross ?? 0))}</div>
                </div>
              </div>
            )}

            {/* Lines */}
            <div className="mb-4">
              <h4 className="font-medium mb-2">Položky faktury</h4>
              {linesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : invoiceLines.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Žádné položky
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum aktivace</TableHead>
                        <TableHead>Ext. objednávka</TableHead>
                        <TableHead className="text-right">Coiny</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceLines.map(line => (
                        <TableRow key={line.id}>
                          <TableCell>
                            {format(new Date(line.activated_at), 'd. M. yyyy HH:mm', { locale: cs })}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {line.external_order_id || '–'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {line.coins.toLocaleString('cs-CZ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DrawerFooter className="flex-row flex-wrap gap-2">
            {/* Status badge & action */}
            {selectedInvoice && (
              <>
                <Badge className={`${statusColors[selectedInvoice.status]} mr-auto`}>
                  {statusLabels[selectedInvoice.status]}
                </Badge>

                {/* Generate PDF button - admin only */}
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generatePdf}
                      disabled={generatingPdf}
                    >
                      {generatingPdf ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Generovat PDF
                    </Button>
                    {pdfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-2" />
                          Stáhnout PDF
                        </a>
                      </Button>
                    )}
                  </div>
                )}

                {/* Send email button - initial send for draft invoices only */}
                {selectedInvoice.status === 'draft' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendInvoiceEmail}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Odeslat fakturu emailem
                  </Button>
                )}

                {selectedInvoice.status === 'issued' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resendInvoiceEmail}
                    disabled={resendingEmail}
                  >
                    {resendingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Znovu odeslat
                  </Button>
                )}

              </>
            )}
            <DrawerClose asChild>
              <Button variant="ghost" size="sm">Zavřít</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default AdminInvoices;
