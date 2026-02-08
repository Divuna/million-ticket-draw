import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { toast } from 'sonner';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

type InvoiceStatus = 'draft' | 'issued' | 'paid';

interface PartnerInvoice {
  id: string;
  period_start: string;
  period_end: string;
  amount_gross: number | null;
  status: InvoiceStatus;
}

interface PdfExport {
  invoice_id: string;
  file_url: string | null;
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

const PartnerInvoices: React.FC = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<PartnerInvoice[]>([]);
  const [pdfExports, setPdfExports] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/partner/login');
        return;
      }

      // Get partner ID for logged-in user
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (partnerError || !partnerData) {
        toast.error('Partnerský účet nenalezen');
        navigate('/partner/login');
        return;
      }

      // Load invoices for this partner
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('partner_invoices')
        .select('id, period_start, period_end, amount_gross, status')
        .eq('partner_id', partnerData.id)
        .order('period_start', { ascending: false });

      if (invoicesError) {
        toast.error('Chyba při načítání faktur');
        console.error(invoicesError);
        return;
      }

      setInvoices(invoicesData || []);

      // Load PDF exports for all invoices
      if (invoicesData && invoicesData.length > 0) {
        const invoiceIds = invoicesData.map(inv => inv.id);
        const { data: exportsData } = await supabase
          .from('partner_invoice_exports')
          .select('invoice_id, file_url')
          .in('invoice_id', invoiceIds)
          .eq('format', 'pdf')
          .order('created_at', { ascending: false });

        if (exportsData) {
          const map = new Map<string, string>();
          // Keep only the latest PDF per invoice
          for (const exp of exportsData) {
            if (exp.file_url && !map.has(exp.invoice_id)) {
              map.set(exp.invoice_id, exp.file_url);
            }
          }
          setPdfExports(map);
        }
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
      toast.error('Nepodařilo se načíst faktury');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(amount);
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Moje faktury
          </h1>
          <Button variant="outline" size="sm" onClick={() => navigate('/partner/dashboard')}>
            Zpět na dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Seznam faktur</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Zatím nemáte žádné faktury.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Období</TableHead>
                      <TableHead className="text-right">Částka (brutto)</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead className="text-right">PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(invoice => {
                      const pdfUrl = pdfExports.get(invoice.id);
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            {format(new Date(invoice.period_start), 'd. M.', { locale: cs })}
                            {' – '}
                            {format(new Date(invoice.period_end), 'd. M. yyyy', { locale: cs })}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(Number(invoice.amount_gross ?? 0))}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[invoice.status]}>
                              {statusLabels[invoice.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {pdfUrl ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4 mr-1" />
                                  Stáhnout
                                </a>
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
      </div>
    </div>
  );
};

export default PartnerInvoices;
