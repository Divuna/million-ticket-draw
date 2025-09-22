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
import { Gift, Plus, Calendar, Search, Infinity, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface Voucher {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
  max_quantity: number | null;
  redeemed_count: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export const AdminVouchers: React.FC = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('id, name, image_url, banner_url, max_quantity, redeemed_count, start_date, end_date, created_at')
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

  const getStatusBadge = (voucher: Voucher) => {
    const now = new Date();
    const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
    const endDate = voucher.end_date ? new Date(voucher.end_date) : null;
    const remainingQuantity = voucher.max_quantity ? voucher.max_quantity - voucher.redeemed_count : null;

    if (startDate && now < startDate) {
      return <Badge variant="secondary">Naplánováno</Badge>;
    }
    if (endDate && now > endDate) {
      return <Badge variant="destructive">Vypršelo</Badge>;
    }
    if (remainingQuantity !== null && remainingQuantity <= 0) {
      return <Badge variant="destructive">Vyčerpáno</Badge>;
    }
    return <Badge variant="default">Aktivní</Badge>;
  };

  const getRemainingText = (voucher: Voucher) => {
    if (!voucher.max_quantity) return 'Neomezené';
    const remaining = voucher.max_quantity - voucher.redeemed_count;
    return `${remaining} / ${voucher.max_quantity}`;
  };

  const filteredVouchers = vouchers.filter(voucher =>
    voucher.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <CardTitle className="text-sm font-medium">Aktivní vouchery</CardTitle>
            <Gift className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {vouchers.filter(v => {
                const now = new Date();
                const startDate = v.start_date ? new Date(v.start_date) : null;
                const endDate = v.end_date ? new Date(v.end_date) : null;
                const remainingQuantity = v.max_quantity ? v.max_quantity - v.redeemed_count : null;

                if (startDate && now < startDate) return false;
                if (endDate && now > endDate) return false;
                if (remainingQuantity !== null && remainingQuantity <= 0) return false;
                return true;
              }).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Celkem uplatněno</CardTitle>
            <Hash className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {vouchers.reduce((sum, v) => sum + v.redeemed_count, 0)}
            </div>
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
                Přehled voucherů
              </CardTitle>
              <CardDescription>
                Zobrazení všech vytvořených voucherů a jejich statistik
              </CardDescription>
            </div>
            <Button onClick={() => window.location.href = '/admin/vouchers'}>
              <Plus className="w-4 h-4 mr-2" />
              Správa voucherů
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center space-x-2 mb-4">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Hledat podle názvu..."
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
                  <TableHead>Voucher</TableHead>
                  <TableHead>Zbývající</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Platnost</TableHead>
                  <TableHead>Vytvořen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVouchers.map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {voucher.image_url && (
                          <img 
                            src={voucher.image_url} 
                            alt={voucher.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        )}
                        <div>
                          <div className="font-medium">{voucher.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Uplatněno: {voucher.redeemed_count}x
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {voucher.max_quantity ? (
                          <Hash className="h-3 w-3" />
                        ) : (
                          <Infinity className="h-3 w-3" />
                        )}
                        {getRemainingText(voucher)}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(voucher)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {voucher.start_date && voucher.end_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(voucher.start_date), 'dd.MM.yy')} - {format(new Date(voucher.end_date), 'dd.MM.yy')}
                        </div>
                      ) : voucher.end_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Do {format(new Date(voucher.end_date), 'dd.MM.yyyy')}
                        </div>
                      ) : voucher.start_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Od {format(new Date(voucher.start_date), 'dd.MM.yyyy')}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(voucher.created_at), 'dd.MM.yyyy')}
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