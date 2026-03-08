import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CreditCard, DollarSign, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';

interface Payment {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  stripe_session_id: string | null;
  created_at: string;
  user: {
    email: string;
    name?: string;
  };
}

interface PaymentStats {
  total_payments: number;
  total_amount: number;
  completed_amount: number;
  pending_amount: number;
  failed_amount: number;
  completed_count: number;
  pending_count: number;
  failed_count: number;
}

export const AdminPayments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats>({
    total_payments: 0,
    total_amount: 0,
    completed_amount: 0,
    pending_amount: 0,
    failed_amount: 0,
    completed_count: 0,
    pending_count: 0,
    failed_count: 0
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          user:users(email, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setPayments(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst platby.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (paymentsData: Payment[]) => {
    const stats = paymentsData.reduce((acc, payment) => {
      acc.total_payments += 1;
      acc.total_amount += payment.amount;

      switch (payment.status) {
        case 'completed':
          acc.completed_amount += payment.amount;
          acc.completed_count += 1;
          break;
        case 'pending':
          acc.pending_amount += payment.amount;
          acc.pending_count += 1;
          break;
        case 'failed':
        case 'cancelled':
          acc.failed_amount += payment.amount;
          acc.failed_count += 1;
          break;
      }

      return acc;
    }, {
      total_payments: 0,
      total_amount: 0,
      completed_amount: 0,
      pending_amount: 0,
      failed_amount: 0,
      completed_count: 0,
      pending_count: 0,
      failed_count: 0
    });

    setStats(stats);
  };

  const handleRefundPayment = async (paymentId: string) => {
    if (!confirm('Opravdu chcete provést refundaci této platby? Tato akce nelze vrátit.')) {
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Nejste přihlášeni.');

      const response = await fetch(
        `https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/stripe-refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U',
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
        description: 'Platba byla úspěšně refundována.',
      });

      await fetchPayments();
    } catch (err: any) {
      console.error('Refund error:', err);
      toast({
        title: 'Chyba',
        description: err?.message || 'Nepodařilo se provést refundaci.',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Dokončeno</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Čeká</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Selhalo</Badge>;
      case 'cancelled':
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Zrušeno</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'stripe':
        return <Badge variant="outline"><CreditCard className="w-3 h-3 mr-1" />Stripe</Badge>;
      case 'paypal':
        return <Badge variant="outline"><DollarSign className="w-3 h-3 mr-1" />PayPal</Badge>;
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.user.name && payment.user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      payment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.stripe_session_id && payment.stripe_session_id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesMethod = methodFilter === 'all' || payment.method === methodFilter;

    return matchesSearch && matchesStatus && matchesMethod;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem plateb</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_payments}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total_amount.toFixed(2)} MioCoins celkem
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dokončené</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed_count}</div>
            <p className="text-xs text-muted-foreground">
              {stats.completed_amount.toFixed(2)} MioCoins
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čekající</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending_count}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pending_amount.toFixed(2)} MioCoins
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Neúspěšné</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed_count}</div>
            <p className="text-xs text-muted-foreground">
              {stats.failed_amount.toFixed(2)} MioCoins
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Správa plateb
              </CardTitle>
              <CardDescription>
                Přehled a správa všech plateb v systému
              </CardDescription>
            </div>
            <Button onClick={fetchPayments} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Obnovit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Hledat podle emailu, jména nebo ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-80"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny stavy</SelectItem>
                <SelectItem value="completed">Dokončeno</SelectItem>
                <SelectItem value="pending">Čeká</SelectItem>
                <SelectItem value="failed">Selhalo</SelectItem>
                <SelectItem value="cancelled">Zrušeno</SelectItem>
              </SelectContent>
            </Select>

            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Metoda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny metody</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Načítám platby...</p>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || methodFilter !== 'all' 
                  ? 'Žádné platby nenalezeny dle zadaných filtrů.' 
                  : 'Žádné platby nebyly provedeny.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID platby</TableHead>
                  <TableHead>Uživatel</TableHead>
                  <TableHead className="text-right">Částka</TableHead>
                  <TableHead>Metoda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vytvořeno</TableHead>
                  <TableHead>Stripe Session</TableHead>
                  <TableHead>Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-sm">
                      {payment.id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{payment.user.name || 'Bez jména'}</div>
                        <div className="text-sm text-muted-foreground">{payment.user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {payment.amount.toFixed(2)} MC
                    </TableCell>
                    <TableCell>{getMethodBadge(payment.method)}</TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(payment.created_at).toLocaleString('cs-CZ')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {payment.stripe_session_id 
                        ? `${payment.stripe_session_id.substring(0, 12)}...`
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {payment.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefundPayment(payment.id)}
                        >
                          Refund
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};