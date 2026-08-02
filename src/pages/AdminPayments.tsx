import React, { useEffect, useState } from 'react';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Search, CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  formatCreditedMiocoins,
  formatDerivedPaidCzk,
  formatPaymentReportingTotal,
  summarizePaymentReporting,
} from '@/lib/paymentReporting';

interface Payment {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  method: string;
  stripe_session_id?: string;
  created_at: string;
  users?: {
    email: string;
    name?: string;
  };
}

const AdminPayments: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('všechny');
  // ID platby, na které právě běží požadavek — brání opakovanému klikání.
  const [refundingPaymentId, setRefundingPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchPayments();
    }
  }, [isAdmin]);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          users (
            email,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst platby",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefundPayment = async (paymentId: string, isRetry: boolean) => {
    if (refundingPaymentId) {
      return;
    }

    const question = isRetry
      ? 'Tato refundace je rozpracovaná — MioCoiny už byly odečteny. Chcete ji bezpečně dokončit? Druhá refundace ani druhý odečet nevzniknou.'
      : 'Opravdu chcete provést refundaci této platby? Tato akce nelze vrátit.';

    if (!confirm(question)) {
      return;
    }

    setRefundingPaymentId(paymentId);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Nejste přihlášeni.');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({ payment_id: paymentId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Nepodařilo se provést refundaci.');
      }

      toast({
        title: 'Refundace úspěšná',
        description: 'Platba byla refundována a MioCoiny odečteny.',
      });

      await fetchPayments();
    } catch (err: unknown) {
      console.error('Refund error:', err);
      const message = err instanceof Error ? err.message : 'Nepodařilo se provést refundaci.';
      toast({
        title: 'Chyba',
        description: message,
        variant: 'destructive',
      });
      // Rozpracovaná refundace se musí v seznamu ukázat jako „Refundace čeká“.
      await fetchPayments();
    } finally {
      setRefundingPaymentId(null);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const email = typeof payment.users?.email === "string" ? payment.users.email : "";
    const matchesSearch =
      email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'všechny' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="success">Dokončeno</Badge>;
      case "pending":
        return <Badge variant="pending">Čekající</Badge>;
      case "failed":
        return <Badge variant="destructive">Neúspěšné</Badge>;
      case "refund_pending":
        return <Badge variant="pending">Refundace čeká</Badge>;
      case "refunded":
        return <Badge variant="warning">Vráceno</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCompletedPaymentSummary = () => {
    return summarizePaymentReporting(filteredPayments.filter(p => p.status === 'completed'));
  };

  const completedPaymentSummary = getCompletedPaymentSummary();

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (authLoading) {
    return null;
  }

  if (!user || !isAdmin) {
    return <NavigateToLogin />;
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tržba Kč</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatPaymentReportingTotal(completedPaymentSummary)}
              </div>
              <p className="text-xs text-muted-foreground">Odvozeno ze známých balíčků</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Připsané MioCoiny</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCreditedMiocoins(completedPaymentSummary.creditedMiocoins)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Celkem plateb</CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{payments.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Správa plateb
            </CardTitle>
            <CardDescription>
              Přehled všech plateb, jejich statusů a možnost refundace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Hledejte podle emailu nebo ID platby..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrovat podle statusu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="všechny">Všechny statusy</SelectItem>
                  <SelectItem value="completed">Dokončeno</SelectItem>
                  <SelectItem value="pending">Čekající</SelectItem>
                  <SelectItem value="failed">Neúspěšné</SelectItem>
                  <SelectItem value="refund_pending">Refundace čeká</SelectItem>
                  <SelectItem value="refunded">Vráceno</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8">Načítání plateb...</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID platby</TableHead>
                      <TableHead>Uživatel</TableHead>
                      <TableHead>Tržba Kč</TableHead>
                      <TableHead>Připsané MioCoiny</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Metoda</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-xs">
                          {payment.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{payment.users?.email}</TableCell>
                        <TableCell className="font-medium">{formatDerivedPaidCzk(payment.amount)}</TableCell>
                        <TableCell>{formatCreditedMiocoins(payment.amount)}</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell>{payment.method}</TableCell>
                        <TableCell>
                          {new Date(payment.created_at).toLocaleDateString('cs-CZ')}
                        </TableCell>
                        <TableCell>
                          {(payment.status === 'completed' || payment.status === 'refund_pending') && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={refundingPaymentId !== null}
                              onClick={() =>
                                handleRefundPayment(payment.id, payment.status === 'refund_pending')
                              }
                            >
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {refundingPaymentId === payment.id
                                ? 'Zpracovává se…'
                                : payment.status === 'refund_pending'
                                  ? 'Dokončit refundaci'
                                  : 'Vrátit'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredPayments.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                Nenalezeny žádné platby podle zadaných kritérií.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
};

export default AdminPayments;
