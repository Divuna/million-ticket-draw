import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Search, CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';

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
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('všechny');

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

  const updatePaymentStatus = async (paymentId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: newStatus })
        .eq('id', paymentId);

      if (error) throw error;

      // Log admin action
      await supabase.rpc('log_admin_action', {
        action_name: 'payment_status_updated',
        entity_type: 'payment',
        entity_id: paymentId,
        new_data: { status: newStatus }
      });

      await fetchPayments();
      toast({
        title: "Úspěch",
        description: "Status platby byl aktualizován",
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat status platby",
        variant: "destructive",
      });
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.users?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'všechny' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Dokončeno</Badge>;
      case 'pending':
        return <Badge variant="secondary">Čekající</Badge>;
      case 'failed':
        return <Badge variant="destructive">Neúspěšné</Badge>;
      case 'refunded':
        return <Badge variant="outline">Vráceno</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalAmount = () => {
    return filteredPayments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 pb-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Celkové příjmy</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getTotalAmount()} Kč</div>
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
                      <TableHead>Částka</TableHead>
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
                        <TableCell className="font-medium">{payment.amount} Kč</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell>{payment.method}</TableCell>
                        <TableCell>
                          {new Date(payment.created_at).toLocaleDateString('cs-CZ')}
                        </TableCell>
                        <TableCell>
                          {payment.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updatePaymentStatus(payment.id, 'refunded')}
                            >
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              Vrátit
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
      <AdminMenu />
    </div>
  );
};

export default AdminPayments;