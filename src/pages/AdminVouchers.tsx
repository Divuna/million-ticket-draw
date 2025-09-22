import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Upload, Calendar as CalendarIcon, Infinity, Hash, Image as ImageIcon } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface VoucherForm {
  code: string;
  value: number;
  imageFile: File | null;
  bannerFile: File | null;
  maxQuantity: number | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
}

interface Voucher {
  id: string;
  code: string;
  value: number;
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [voucherForm, setVoucherForm] = useState<VoucherForm>({
    code: '',
    value: 0,
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
        .select('*')
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
    if (!voucherForm.code || !voucherForm.imageFile || voucherForm.value <= 0) {
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
          code: voucherForm.code,
          value: voucherForm.value,
          image_url: imageUrl,
          banner_url: bannerUrl,
          max_quantity: voucherForm.maxQuantity,
          redeemed_count: 0,
          start_date: voucherForm.startDate?.toISOString(),
          end_date: voucherForm.endDate?.toISOString(),
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
      code: '',
      value: 0,
      imageFile: null,
      bannerFile: null,
      maxQuantity: null,
      startDate: undefined,
      endDate: undefined,
    });
  };

  const filteredVouchers = vouchers.filter(voucher =>
    voucher.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Správa Voucherů</h1>
            <p className="text-muted-foreground">
              Vytvářejte a spravujte vouchery s obrázky a bannery
            </p>
          </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Kód voucheru *</Label>
                    <Input
                      id="code"
                      value={voucherForm.code}
                      onChange={(e) => setVoucherForm({...voucherForm, code: e.target.value})}
                      placeholder="Např. SAVE20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="value">Hodnota *</Label>
                    <Input
                      id="value"
                      type="number"
                      min="0"
                      step="0.01"
                      value={voucherForm.value}
                      onChange={(e) => setVoucherForm({...voucherForm, value: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Popis</Label>
                  <Textarea
                    id="description"
                    value={voucherForm.description}
                    onChange={(e) => setVoucherForm({...voucherForm, description: e.target.value})}
                    placeholder="Popis voucheru..."
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

        <div className="space-y-4">
          <Input
            placeholder="Hledat vouchery..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />

          <div className="grid gap-4">
            {filteredVouchers.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'Žádné vouchery nebyly nalezeny.' : 'Zatím nebyly vytvořeny žádné vouchery.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredVouchers.map((voucher) => (
                <Card key={voucher.id} className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex gap-4 flex-1">
                        {voucher.image_url && (
                          <img 
                            src={voucher.image_url} 
                            alt={voucher.code}
                            className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                          />
                        )}
                        
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{voucher.code}</h3>
                            {getStatusBadge(voucher)}
                          </div>
                          
                          {voucher.description && (
                            <p className="text-muted-foreground text-sm">{voucher.description}</p>
                          )}
                          
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span>Hodnota: {voucher.value} Kč</span>
                            <span>
                              Uplatněno: {voucher.redeemed_count}
                              {voucher.max_quantity && ` / ${voucher.max_quantity}`}
                            </span>
                            {voucher.max_quantity && (
                              <span>
                                Zbývá: {voucher.max_quantity - voucher.redeemed_count}
                              </span>
                            )}
                          </div>
                          
                          {(voucher.start_date || voucher.end_date) && (
                            <div className="text-sm text-muted-foreground">
                              {voucher.start_date && (
                                <span>Od: {format(new Date(voucher.start_date), 'dd.MM.yyyy')} </span>
                              )}
                              {voucher.end_date && (
                                <span>Do: {format(new Date(voucher.end_date), 'dd.MM.yyyy')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {voucher.banner_url && (
                        <img 
                          src={voucher.banner_url} 
                          alt={`${voucher.code} banner`}
                          className="w-32 h-20 object-cover rounded-lg"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      <AdminMenu />
    </div>
  );
};

export default AdminVouchers;