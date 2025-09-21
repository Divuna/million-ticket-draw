import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Search, Gift, Plus, Trash2 } from 'lucide-react';

interface Voucher {
  id: string;
  user_id: string;
  code: string;
  value: number;
  redeemed: boolean;
  redeemed_at?: string;
  created_at: string;
  users?: {
    email: string;
    name?: string;
  };
}

const AdminVouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('všechny');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newVoucher, setNewVoucher] = useState({
    userEmail: '',
    value: 0,
    code: ''
  });

  useEffect(() => {
    if (isAdmin) {
      fetchVouchers();
    }
  }, [isAdmin]);

  const fetchVouchers = async () => {
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select(`
          *,
          users (
            email,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVouchers(data || []);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst vouchery",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createVoucher = async () => {
    try {
      // Find user by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', newVoucher.userEmail)
        .single();

      if (userError) throw new Error('Uživatel s tímto emailem nebyl nalezen');

      const { error } = await supabase
        .from('vouchers')
        .insert({
          user_id: userData.id,
          code: newVoucher.code,
          value: newVoucher.value,
        });

      if (error) throw error;

      // Log admin action
      await supabase.rpc('log_admin_action', {
        action_name: 'voucher_created',
        entity_type: 'voucher',
        new_data: { 
          user_email: newVoucher.userEmail,
          code: newVoucher.code,
          value: newVoucher.value 
        }
      });

      await fetchVouchers();
      setIsCreateModalOpen(false);
      setNewVoucher({ userEmail: '', value: 0, code: '' });
      
      toast({
        title: "Úspěch",
        description: "Voucher byl vytvořen",
      });
    } catch (error: any) {
      console.error('Error creating voucher:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se vytvořit voucher",
        variant: "destructive",
      });
    }
  };

  const deleteVoucher = async (voucherId: string) => {
    try {
      const { error } = await supabase
        .from('vouchers')
        .delete()
        .eq('id', voucherId);

      if (error) throw error;

      // Log admin action
      await supabase.rpc('log_admin_action', {
        action_name: 'voucher_deleted',
        entity_type: 'voucher',
        entity_id: voucherId
      });

      await fetchVouchers();
      toast({
        title: "Úspěch",
        description: "Voucher byl smazán",
      });
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se smazat voucher",
        variant: "destructive",
      });
    }
  };

  const filteredVouchers = vouchers.filter(voucher => {
    const matchesSearch = voucher.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         voucher.users?.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'všechny' || 
                         (statusFilter === 'použité' && voucher.redeemed) ||
                         (statusFilter === 'nepoužité' && !voucher.redeemed);
    return matchesSearch && matchesStatus;
  });

  const generateRandomCode = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setNewVoucher(prev => ({ ...prev, code }));
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
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Správa voucherů
                </CardTitle>
                <CardDescription>
                  Spravujte vouchery, vytvářejte nové a sledujte jejich využití
                </CardDescription>
              </div>
              <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nový voucher
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Vytvořit nový voucher</DialogTitle>
                    <DialogDescription>
                      Vytvořte nový voucher pro uživatele
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="userEmail">Email uživatele</Label>
                      <Input
                        id="userEmail"
                        value={newVoucher.userEmail}
                        onChange={(e) => setNewVoucher(prev => ({ ...prev, userEmail: e.target.value }))}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="value">Hodnota (Kč)</Label>
                      <Input
                        id="value"
                        type="number"
                        value={newVoucher.value || ''}
                        onChange={(e) => setNewVoucher(prev => ({ ...prev, value: Number(e.target.value) }))}
                        placeholder="100"
                      />
                    </div>
                    <div>
                      <Label htmlFor="code">Kód voucheru</Label>
                      <div className="flex gap-2">
                        <Input
                          id="code"
                          value={newVoucher.code}
                          onChange={(e) => setNewVoucher(prev => ({ ...prev, code: e.target.value }))}
                          placeholder="VOUCHER123"
                        />
                        <Button type="button" variant="outline" onClick={generateRandomCode}>
                          Generovat
                        </Button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Zrušit
                    </Button>
                    <Button 
                      onClick={createVoucher}
                      disabled={!newVoucher.userEmail || !newVoucher.code || newVoucher.value <= 0}
                    >
                      Vytvořit
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Hledejte podle kódu nebo emailu..."
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
                  <SelectItem value="všechny">Všechny</SelectItem>
                  <SelectItem value="použité">Použité</SelectItem>
                  <SelectItem value="nepoužité">Nepoužité</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8">Načítání voucherů...</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kód</TableHead>
                      <TableHead>Uživatel</TableHead>
                      <TableHead>Hodnota</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vytvořeno</TableHead>
                      <TableHead>Použito</TableHead>
                      <TableHead>Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVouchers.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell className="font-mono">{voucher.code}</TableCell>
                        <TableCell>{voucher.users?.email}</TableCell>
                        <TableCell className="font-medium">{voucher.value} Kč</TableCell>
                        <TableCell>
                          {voucher.redeemed ? (
                            <Badge variant="secondary">Použité</Badge>
                          ) : (
                            <Badge variant="default">Aktivní</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(voucher.created_at).toLocaleDateString('cs-CZ')}
                        </TableCell>
                        <TableCell>
                          {voucher.redeemed_at 
                            ? new Date(voucher.redeemed_at).toLocaleDateString('cs-CZ')
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {!voucher.redeemed && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteVoucher(voucher.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredVouchers.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                Nenalezeny žádné vouchery podle zadaných kritérií.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminVouchers;