import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Upload, Calendar as CalendarIcon, Infinity, Hash, Image as ImageIcon, Search, Edit, Trash2, Eye, Gift } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface VoucherForm {
  name: string;
  imageFile: File | null;
  bannerFile: File | null;
  maxQuantity: number | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
}

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
  updated_at: string | null;
}

const AdminVouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  
  const [voucherForm, setVoucherForm] = useState<VoucherForm>({
    name: '',
    imageFile: null,
    bannerFile: null,
    maxQuantity: null,
    startDate: undefined,
    endDate: undefined,
  });

  useEffect(() => {
    if (!roleLoading && (!user || !isAdmin)) {
      navigate('/login');
      return;
    }
    if (user && isAdmin) {
      fetchVouchers();
    }
  }, [user, isAdmin, roleLoading, navigate]);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vouchers')
        .select('id, name, image_url, banner_url, max_quantity, redeemed_count, start_date, end_date, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVouchers(data || []);
    } catch (error: any) {
      console.error('Error fetching vouchers:', error);
      toast.error('Chyba při načítání voucherů');
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File, bucket: string = 'voucher-images'): Promise<string> => {
    const fileName = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleCreateVoucher = async () => {
    if (!voucherForm.name || !voucherForm.imageFile) {
      toast.error('Vyplňte všechna povinná pole');
      return;
    }

    try {
      setCreateLoading(true);

      // Upload images
      const imageUrl = await uploadImage(voucherForm.imageFile);
      let bannerUrl = null;
      if (voucherForm.bannerFile) {
        bannerUrl = await uploadImage(voucherForm.bannerFile);
      }

      // Create voucher
      const { data, error } = await supabase
        .from('vouchers')
        .insert({
          name: voucherForm.name,
          image_url: imageUrl,
          banner_url: bannerUrl,
          max_quantity: voucherForm.maxQuantity,
          redeemed_count: 0,
          start_date: voucherForm.startDate?.toISOString(),
          end_date: voucherForm.endDate?.toISOString(),
          user_id: null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Voucher byl úspěšně vytvořen');
      setShowCreateDialog(false);
      resetForm();
      fetchVouchers();
    } catch (error: any) {
      console.error('Error creating voucher:', error);
      toast.error('Chyba při vytváření voucheru');
    } finally {
      setCreateLoading(false);
    }
  };

  const resetForm = () => {
    setVoucherForm({
      name: '',
      imageFile: null,
      bannerFile: null,
      maxQuantity: null,
      startDate: undefined,
      endDate: undefined,
    });
  };

  const generateTestVouchers = async () => {
    try {
      setCreateLoading(true);
      
      const testVouchers = [
        {
          name: "Test Voucher 1 - Sleva 20%",
          image_url: "/placeholder.svg",
          banner_url: "/placeholder.svg",
          max_quantity: 5,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        },
        {
          name: "Test Voucher 2 - Doprava zdarma",
          image_url: "/placeholder.svg",
          banner_url: "/placeholder.svg",
          max_quantity: 10,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days from now
        },
        {
          name: "Test Voucher 3 - Unlimited",
          image_url: "/placeholder.svg",
          banner_url: "/placeholder.svg",
          max_quantity: null, // unlimited
          start_date: new Date().toISOString(),
          end_date: null, // no end date
        },
        {
          name: "Test Voucher 4 - Exkluzivní nabídka",
          image_url: "/placeholder.svg",
          banner_url: "/placeholder.svg",
          max_quantity: 3,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
        }
      ];

      const { data, error } = await supabase
        .from('vouchers')
        .insert(testVouchers.map(voucher => ({
          ...voucher,
          redeemed_count: 0,
          user_id: null,
        })))
        .select();

      if (error) throw error;

      toast.success(`Vytvořeno ${testVouchers.length} test voucherů`);
      fetchVouchers();
    } catch (error: any) {
      console.error('Error generating test vouchers:', error);
      toast.error('Chyba při generování test voucherů');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteVoucher = async (voucherId: string) => {
    try {
      setDeleteLoading(true);
      
      const { error } = await supabase
        .from('vouchers')
        .delete()
        .eq('id', voucherId);

      if (error) throw error;
      
      toast.success('Voucher byl úspěšně smazán');
      fetchVouchers();
    } catch (error: any) {
      console.error('Error deleting voucher:', error);
      toast.error('Chyba při mazání voucheru');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredVouchers = vouchers.filter(voucher => {
    const matchesSearch = voucher.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (statusFilter === 'all') return matchesSearch;
    
    const now = new Date();
    const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
    const endDate = voucher.end_date ? new Date(voucher.end_date) : null;
    const remainingQuantity = voucher.max_quantity ? voucher.max_quantity - voucher.redeemed_count : null;
    
    let voucherStatus = 'active';
    if (startDate && now < startDate) voucherStatus = 'scheduled';
    else if (endDate && now > endDate) voucherStatus = 'expired';
    else if (remainingQuantity !== null && remainingQuantity <= 0) voucherStatus = 'exhausted';
    
    return matchesSearch && voucherStatus === statusFilter;
  });

  const getRemainingText = (voucher: Voucher) => {
    if (!voucher.max_quantity) return 'Neomezené';
    const remaining = voucher.max_quantity - voucher.redeemed_count;
    return `${remaining} / ${voucher.max_quantity}`;
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

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Načítání...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Přehled voucherů</h1>
            <p className="text-muted-foreground">
              Správa všech voucherů v systému
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={generateTestVouchers}
              variant="outline"
              disabled={createLoading}
            >
              <Gift className="mr-2 h-4 w-4" />
              Generovat Test Vouchery
            </Button>
            
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nový Voucher
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Vytvořit Nový Voucher</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Název voucheru *</Label>
                  <Input
                    id="name"
                    value={voucherForm.name}
                    onChange={(e) => setVoucherForm({...voucherForm, name: e.target.value})}
                    placeholder="Např. Sleva 20% na celý nákup"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mainImage">Hlavní obrázek voucheru *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="mainImage"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setVoucherForm({...voucherForm, imageFile: e.target.files?.[0] || null})}
                        className="flex-1"
                      />
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bannerImage">Banner obrázek</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="bannerImage"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setVoucherForm({...voucherForm, bannerFile: e.target.files?.[0] || null})}
                        className="flex-1"
                      />
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Množství</Label>
                  <Select
                    value={voucherForm.maxQuantity === null ? 'unlimited' : 'limited'}
                    onValueChange={(value) => setVoucherForm({
                      ...voucherForm, 
                      maxQuantity: value === 'unlimited' ? null : 100
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlimited">
                        <div className="flex items-center gap-2">
                          <Infinity className="h-4 w-4" />
                          Neomezené
                        </div>
                      </SelectItem>
                      <SelectItem value="limited">
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4" />
                          Omezené
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {voucherForm.maxQuantity !== null && (
                    <Input
                      type="number"
                      min="1"
                      value={voucherForm.maxQuantity}
                      onChange={(e) => setVoucherForm({
                        ...voucherForm, 
                        maxQuantity: parseInt(e.target.value) || 1
                      })}
                      placeholder="Počet dostupných voucherů"
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Datum začátku</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", 
                            !voucherForm.startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {voucherForm.startDate ? format(voucherForm.startDate, 'dd.MM.yyyy') : 'Vybrat datum'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={voucherForm.startDate}
                          onSelect={(date) => setVoucherForm({...voucherForm, startDate: date})}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Datum konce</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", 
                            !voucherForm.endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {voucherForm.endDate ? format(voucherForm.endDate, 'dd.MM.yyyy') : 'Vybrat datum'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={voucherForm.endDate}
                          onSelect={(date) => setVoucherForm({...voucherForm, endDate: date})}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Zrušit
                  </Button>
                  <Button onClick={handleCreateVoucher} disabled={createLoading}>
                    {createLoading ? 'Vytváření...' : 'Vytvořit Voucher'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

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

        {/* Main Voucher Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Hledat podle názvu..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filtrovat stav" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Všechny</SelectItem>
                    <SelectItem value="active">Aktivní</SelectItem>
                    <SelectItem value="scheduled">Naplánované</SelectItem>
                    <SelectItem value="expired">Vypršelé</SelectItem>
                    <SelectItem value="exhausted">Vyčerpané</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-muted-foreground">Načítání...</p>
              </div>
            ) : filteredVouchers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== 'all' ? 'Žádné vouchery nenalezeny.' : 'Zatím nebyly vytvořeny žádné vouchery.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Zbývající množství</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Platnost</TableHead>
                    <TableHead>Vytvořen</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
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
                      <TableCell className="text-sm">
                        {voucher.start_date && voucher.end_date ? (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {format(new Date(voucher.start_date), 'dd.MM.yy')} - {format(new Date(voucher.end_date), 'dd.MM.yy')}
                          </div>
                        ) : voucher.end_date ? (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            Do {format(new Date(voucher.end_date), 'dd.MM.yyyy')}
                          </div>
                        ) : voucher.start_date ? (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            Od {format(new Date(voucher.start_date), 'dd.MM.yyyy')}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(voucher.created_at), 'dd.MM.yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedVoucher(voucher)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Smazat voucher</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Opravdu chcete smazat voucher "{voucher.name}"? Tato akce je nevratná.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Zrušit</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteVoucher(voucher.id)}
                                  disabled={deleteLoading}
                                >
                                  {deleteLoading ? 'Mazání...' : 'Smazat'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Voucher Preview Dialog */}
        {selectedVoucher && (
          <Dialog open={!!selectedVoucher} onOpenChange={() => setSelectedVoucher(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Náhled voucheru</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-4">
                  {selectedVoucher.image_url && (
                    <img 
                      src={selectedVoucher.image_url} 
                      alt={selectedVoucher.name}
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  )}
                  {selectedVoucher.banner_url && (
                    <img 
                      src={selectedVoucher.banner_url} 
                      alt={`${selectedVoucher.name} banner`}
                      className="w-48 h-32 object-cover rounded-lg"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Název:</strong> {selectedVoucher.name}</div>
                  <div><strong>Stav:</strong> {getStatusBadge(selectedVoucher)}</div>
                  <div><strong>Zbývající:</strong> {getRemainingText(selectedVoucher)}</div>
                  <div><strong>Uplatněno:</strong> {selectedVoucher.redeemed_count}x</div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <AdminMenu />
    </div>
  );
};

export default AdminVouchers;