import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Gift, Plus, CheckCircle, Clock, Search } from 'lucide-react';

interface Voucher {
  id: string;
  code: string;
  value: number;
  user_id: string;
  redeemed: boolean;
  redeemed_at: string | null;
  created_at: string;
  user: {
    email: string;
    name?: string;
  };
}

interface VoucherForm {
  code: string;
  value: number;
  user_email: string;
}

export const AdminVouchers: React.FC = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [voucherForm, setVoucherForm] = useState<VoucherForm>({
    code: '',
    value: 0,
    user_email: ''
  });

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select(`
          *,
          user:users(email, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVouchers(data || []);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst vouchery.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateVoucherCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const handleCreateVoucher = async () => {
    if (!voucherForm.user_email || voucherForm.value <= 0) {
      toast({
        title: "Chyba",
        description: "Vyplňte všechna povinná pole.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Find user by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', voucherForm.user_email)
        .single();

      if (userError || !userData) {
        toast({
          title: "Chyba",
          description: "Uživatel s tímto emailem nebyl nalezen.",
          variant: "destructive"
        });
        return;
      }

      const voucherCode = voucherForm.code || generateVoucherCode();
      
      const { error } = await supabase
        .from('vouchers')
        .insert({
          code: voucherCode,
          value: voucherForm.value,
          user_id: userData.id
        });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: "Voucher byl úspěšně vytvořen.",
      });

      // Reset form and refresh data
      setVoucherForm({ code: '', value: 0, user_email: '' });
      setShowCreateDialog(false);
      fetchVouchers();

    } catch (error: any) {
      console.error('Error creating voucher:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se vytvořit voucher.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (voucher: Voucher) => {
    if (voucher.redeemed) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Uplatněn</Badge>;
    }
    return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Čeká</Badge>;
  };

  const filteredVouchers = vouchers.filter(voucher =>
    voucher.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    voucher.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (voucher.user.name && voucher.user.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalValue = vouchers.reduce((sum, v) => sum + v.value, 0);
  const redeemedValue = vouchers.filter(v => v.redeemed).reduce((sum, v) => sum + v.value, 0);
  const pendingValue = totalValue - redeemedValue;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem voucherů</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vouchers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celková hodnota</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalValue.toFixed(2)} MC</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uplatněno</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{redeemedValue.toFixed(2)} MC</div>
            <p className="text-xs text-muted-foreground">
              {vouchers.filter(v => v.redeemed).length} voucherů
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čeká na uplatnění</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingValue.toFixed(2)} MC</div>
            <p className="text-xs text-muted-foreground">
              {vouchers.filter(v => !v.redeemed).length} voucherů
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Voucher Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Správa voucherů
              </CardTitle>
              <CardDescription>
                Vytvářejte a spravujte vouchery pro uživatele
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nový voucher
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vytvořit nový voucher</DialogTitle>
                  <DialogDescription>
                    Vyplňte údaje pro vytvoření nového voucheru
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="user_email">Email uživatele *</Label>
                    <Input
                      id="user_email"
                      type="email"
                      value={voucherForm.user_email}
                      onChange={(e) => setVoucherForm({...voucherForm, user_email: e.target.value})}
                      placeholder="uzivatel@example.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="value">Hodnota (MioCoins) *</Label>
                    <Input
                      id="value"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={voucherForm.value}
                      onChange={(e) => setVoucherForm({...voucherForm, value: parseFloat(e.target.value) || 0})}
                      placeholder="10.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="code">Kód voucheru (volitelné)</Label>
                    <Input
                      id="code"
                      value={voucherForm.code}
                      onChange={(e) => setVoucherForm({...voucherForm, code: e.target.value.toUpperCase()})}
                      placeholder="Nechte prázdné pro automatické generování"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Pokud nevyplníte, bude vygenerován automaticky
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Zrušit
                  </Button>
                  <Button onClick={handleCreateVoucher}>
                    Vytvořit voucher
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center space-x-2 mb-4">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Hledat podle kódu, emailu nebo jména..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Načítám vouchery...</p>
            </div>
          ) : filteredVouchers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm ? 'Žádné vouchery nenalezeny.' : 'Žádné vouchery nebyly vytvořeny.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kód</TableHead>
                  <TableHead>Uživatel</TableHead>
                  <TableHead className="text-right">Hodnota</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Vytvořen</TableHead>
                  <TableHead>Uplatněn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVouchers.map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell className="font-mono font-medium">{voucher.code}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{voucher.user.name || 'Bez jména'}</div>
                        <div className="text-sm text-muted-foreground">{voucher.user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {voucher.value.toFixed(2)} MC
                    </TableCell>
                    <TableCell>{getStatusBadge(voucher)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(voucher.created_at).toLocaleDateString('cs-CZ')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {voucher.redeemed_at 
                        ? new Date(voucher.redeemed_at).toLocaleDateString('cs-CZ')
                        : '-'
                      }
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