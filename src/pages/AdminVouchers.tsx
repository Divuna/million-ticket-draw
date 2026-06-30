import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  created_at: string | null;
  updated_at: string | null;
  is_public: boolean;
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** Never throws; invalid / missing → "-" */
function safeFormatDate(iso: string | null | undefined, fmt: string, fallback = '-'): string {
  if (iso == null || iso === '') return fallback;
  const d = new Date(iso);
  if (!isValidDate(d)) return fallback;
  try {
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

/** For comparisons in filters; null if missing or invalid */
function parseBoundaryDate(iso: string | null | undefined): Date | null {
  if (iso == null || iso === '') return null;
  const d = new Date(iso);
  return isValidDate(d) ? d : null;
}

/** For calendar popovers — never throws */
function safeFormatPickerDate(d: Date | undefined, fmt: string): string {
  if (!d || !isValidDate(d)) return 'Vybrat datum';
  try {
    return format(d, fmt);
  } catch {
    return 'Vybrat datum';
  }
}

function parseDateForForm(iso: string | null | undefined): Date | undefined {
  const d = parseBoundaryDate(iso);
  return d ?? undefined;
}

/**
 * Single source of truth for voucher status — same logic already used across
 * the filter, status badge and summary cards in this file, extracted so the
 * section tabs (Aktivní / Naplánované / Archiv) classify identically.
 */
type VoucherStatus = 'active' | 'scheduled' | 'expired' | 'exhausted';
function getVoucherStatus(voucher: Voucher): VoucherStatus {
  const now = new Date();
  const startDate = parseBoundaryDate(voucher.start_date);
  const endDate = parseBoundaryDate(voucher.end_date);
  const redeemed = Number(voucher.redeemed_count ?? 0);
  const safeRedeemed = Number.isFinite(redeemed) ? redeemed : 0;
  const remainingQuantity =
    voucher.max_quantity != null && Number.isFinite(voucher.max_quantity)
      ? voucher.max_quantity - safeRedeemed
      : null;

  if (startDate && now < startDate) return 'scheduled';
  if (endDate && now > endDate) return 'expired';
  if (remainingQuantity !== null && remainingQuantity <= 0) return 'exhausted';
  return 'active';
}

type VoucherSection = 'active' | 'scheduled' | 'archive' | 'purchases';

/** Coerce Supabase row so render never throws on null/odd shapes */
function normalizeVoucherRow(row: Record<string, unknown> | null | undefined): Voucher | null {
  if (!row || row.id == null) return null;
  const id = String(row.id);
  const nameRaw = row.name;
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() !== '' ? nameRaw : '(Bez názvu)';
  const redeemed = Number(row.redeemed_count ?? 0);
  const redeemed_count = Number.isFinite(redeemed) ? redeemed : 0;
  const maxQ = row.max_quantity;
  const maxNum = maxQ == null ? null : Number(maxQ);
  const max_quantity = maxNum != null && Number.isFinite(maxNum) ? maxNum : null;
  const createdRaw = row.created_at;
  const created_at =
    typeof createdRaw === 'string' && createdRaw !== '' ? createdRaw : null;
  const updatedRaw = row.updated_at;
  const updated_at = typeof updatedRaw === 'string' ? updatedRaw : null;
  const img = row.image_url;
  const image_url =
    typeof img === 'string' ? img : img == null ? null : String(img);
  const ban = row.banner_url;
  const banner_url =
    typeof ban === 'string' ? ban : ban == null ? null : String(ban);
  const sd = row.start_date;
  const start_date = typeof sd === 'string' ? sd : null;
  const ed = row.end_date;
  const end_date = typeof ed === 'string' ? ed : null;
  return {
    id,
    name,
    image_url,
    banner_url,
    max_quantity,
    redeemed_count,
    start_date,
    end_date,
    created_at,
    updated_at,
    is_public: Boolean(row.is_public),
  };
}

const AdminVouchers: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionTab, setSectionTab] = useState<VoucherSection>('active');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [voucherPurchases, setVoucherPurchases] = useState<{ id: string; user_email: string; voucher_name: string; created_at: string }[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  
  const [voucherForm, setVoucherForm] = useState<VoucherForm>({
    name: '',
    imageFile: null,
    bannerFile: null,
    maxQuantity: null,
    startDate: undefined,
    endDate: undefined,
  });

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchVouchers();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchVoucherPurchases();
  }, [user, isAdmin]);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      const normalized = list
        .map((row) => normalizeVoucherRow(row as Record<string, unknown>))
        .filter((v): v is Voucher => v != null);
      setVouchers(normalized);
    } catch (error: unknown) {
      console.error('Error fetching vouchers:', error);
      toast.error('Chyba při načítání voucherů');
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVoucherPurchases = async () => {
    try {
      setPurchasesLoading(true);
      const { data, error } = await supabase
        .from('user_vouchers')
        .select(`
          id,
          created_at,
          users!inner(email),
          vouchers!user_vouchers_voucher_id_fkey!inner(name)
        `)
        .eq('redeemed', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const purchases = (data || []).map((row: Record<string, unknown>) => ({
        id: String(row?.id ?? ''),
        user_email:
          (row?.users as { email?: string } | undefined)?.email ?? 'Neznámý uživatel',
        voucher_name:
          (row?.vouchers as { name?: string } | undefined)?.name ?? 'Neznámý voucher',
        created_at: typeof row?.created_at === 'string' ? row.created_at : '',
      }));
      setVoucherPurchases(purchases.filter((p) => p.id !== ''));
    } catch (error: unknown) {
      console.error('Error fetching voucher purchases:', error);
      try {
        const { data: fallback, error: fbErr } = await supabase
          .from('user_vouchers')
          .select('id, created_at')
          .eq('redeemed', true)
          .order('created_at', { ascending: false });
        if (fbErr) throw fbErr;
        const rows = Array.isArray(fallback) ? fallback : [];
        setVoucherPurchases(
          rows.map((r: Record<string, unknown>) => ({
            id: String(r?.id ?? ''),
            user_email: '—',
            voucher_name: '—',
            created_at: typeof r?.created_at === 'string' ? r.created_at : '',
          })).filter((p) => p.id !== '')
        );
      } catch (e2: unknown) {
        console.error('Fallback voucher purchases fetch failed:', e2);
        setVoucherPurchases([]);
        toast.error('Chyba při načítání nákupů voucherů');
      }
    } finally {
      setPurchasesLoading(false);
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

  const openEditDialog = (voucher: Voucher) => {
    setEditingVoucher(voucher);
    setVoucherForm({
      name: voucher.name ?? '(Bez názvu)',
      imageFile: null,
      bannerFile: null,
      maxQuantity:
        voucher.max_quantity != null && Number.isFinite(Number(voucher.max_quantity))
          ? voucher.max_quantity
          : null,
      startDate: parseDateForForm(voucher.start_date),
      endDate: parseDateForForm(voucher.end_date),
    });
    setShowEditDialog(true);
  };

  const handleEditVoucher = async () => {
    if (!voucherForm.name || !editingVoucher?.id) {
      toast.error('Vyplňte všechna povinná pole');
      return;
    }

    try {
      setCreateLoading(true);

      let imageUrl = editingVoucher.image_url;
      let bannerUrl = editingVoucher.banner_url;

      // Upload new images if provided
      if (voucherForm.imageFile) {
        imageUrl = await uploadImage(voucherForm.imageFile);
      }
      if (voucherForm.bannerFile) {
        bannerUrl = await uploadImage(voucherForm.bannerFile);
      }

      // Update voucher
      const { data, error } = await supabase
        .from('vouchers')
        .update({
          name: voucherForm.name,
          image_url: imageUrl,
          banner_url: bannerUrl,
          max_quantity: voucherForm.maxQuantity,
          start_date: voucherForm.startDate?.toISOString(),
          end_date: voucherForm.endDate?.toISOString(),
        })
        .eq('id', String(editingVoucher.id))
        .select()
        .single();

      if (error) throw error;

      toast.success('Voucher byl úspěšně aktualizován');
      setShowEditDialog(false);
      setEditingVoucher(null);
      resetForm();
      fetchVouchers();
    } catch (error: any) {
      console.error('Error updating voucher:', error);
      toast.error('Chyba při aktualizaci voucheru');
    } finally {
      setCreateLoading(false);
    }
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

  const testVoucherTrigger = async () => {
    if (!user?.id) {
      toast.error('Chybí přihlášený uživatel pro test triggeru');
      return;
    }
    try {
      setCreateLoading(true);

      const { data, error } = await supabase.functions.invoke('test-voucher-trigger', {
        body: { testUserId: user.id }
      });

      if (error) throw error;

      console.log('Trigger test results:', data);

      const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (payload?.success === true) {
        const tt = payload.triggerTest as
          | { testVoucherShouldNotTrigger?: unknown; realVoucherShouldTrigger?: unknown }
          | undefined;
        toast.success(
          `Trigger test completed! Test voucher should NOT trigger: ${String(tt?.testVoucherShouldNotTrigger)}, Real voucher should trigger: ${String(tt?.realVoucherShouldTrigger)}`
        );
        fetchVouchers();
      } else {
        toast.error('Trigger test failed');
      }
    } catch (error: any) {
      console.error('Error testing trigger:', error);
      toast.error('Chyba při testování triggeru');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteVoucher = async (voucherId: string) => {
    if (!voucherId) {
      console.error('handleDeleteVoucher: missing id');
      return;
    }
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

  const handleTogglePublic = async (voucherId: string, currentValue: boolean) => {
    if (!voucherId) {
      console.error('handleTogglePublic: missing id');
      return;
    }
    try {
      const { error } = await supabase
        .from('vouchers')
        .update({ is_public: !currentValue })
        .eq('id', voucherId);

      if (error) throw error;
      
      toast.success(`Voucher ${!currentValue ? 'zveřejněn' : 'skryt'}`);
      fetchVouchers();
    } catch (error: any) {
      console.error('Error toggling public status:', error);
      toast.error('Chyba při změně veřejného stavu');
    }
  };

  const safeVouchers = Array.isArray(vouchers) ? vouchers : [];
  const safePurchases = Array.isArray(voucherPurchases) ? voucherPurchases : [];

  const filteredVouchers = safeVouchers.filter((voucher) => {
    if (!voucher || voucher.id == null) return false;
    const matchesSearch = (voucher.name ?? '')
      .toLowerCase()
      .includes((searchTerm ?? '').toLowerCase());
    if (!matchesSearch) return false;

    const status = getVoucherStatus(voucher);
    if (sectionTab === 'active') return status === 'active';
    if (sectionTab === 'scheduled') return status === 'scheduled';
    if (sectionTab === 'archive') return status === 'expired' || status === 'exhausted';
    return false; // 'purchases' section renders the purchases table, not vouchers
  });

  const getRemainingText = (voucher: Voucher) => {
    const max = voucher.max_quantity;
    if (max == null || !Number.isFinite(max)) return 'Neomezené';
    const redeemed = Number(voucher.redeemed_count ?? 0);
    const remaining = max - (Number.isFinite(redeemed) ? redeemed : 0);
    return `${remaining} / ${max}`;
  };

  const getStatusBadge = (voucher: Voucher) => {
    const status = getVoucherStatus(voucher);
    if (status === 'scheduled') return <Badge variant="pending">Naplánováno</Badge>;
    if (status === 'expired') return <Badge variant="destructive">Vypršelo</Badge>;
    if (status === 'exhausted') return <Badge variant="destructive">Vyčerpáno</Badge>;
    return <Badge variant="success">Aktivní</Badge>;
  };

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Načítání...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <NavigateToLogin />;
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
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
            
            <Button 
              onClick={testVoucherTrigger}
              variant="secondary"
              disabled={createLoading}
            >
              <Gift className="mr-2 h-4 w-4" />
              Test Trigger
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
                    <p className="text-xs text-muted-foreground">
                      Doporučené rozměry: 64px × 64px (ikona voucheru)
                    </p>
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
                    <p className="text-xs text-muted-foreground">
                      Doporučené rozměry: Plná šířka × 128px (banner voucheru)
                    </p>
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
                          {safeFormatPickerDate(voucherForm.startDate, 'dd.MM.yyyy')}
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
                          {safeFormatPickerDate(voucherForm.endDate, 'dd.MM.yyyy')}
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
              <div className="text-2xl font-bold">{safeVouchers.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktivní vouchery</CardTitle>
              <Gift className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {safeVouchers.filter((v) => v && v.id != null && getVoucherStatus(v) === 'active').length}
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
                {safeVouchers.reduce((sum, v) => sum + Number(v?.redeemed_count ?? 0), 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section tabs: Aktivní / Naplánované / Archiv / Nákupy voucherů */}
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'active', label: 'Aktivní' },
            { key: 'scheduled', label: 'Naplánované' },
            { key: 'archive', label: 'Archiv' },
            { key: 'purchases', label: 'Nákupy voucherů' },
          ] as { key: VoucherSection; label: string }[]).map((tab) => (
            <Button
              key={tab.key}
              variant={sectionTab === tab.key ? 'default' : 'outline'}
              onClick={() => setSectionTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Voucher Purchases — only in its own section, not above voucher management */}
        {sectionTab === 'purchases' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Nákupy voucherů
            </CardTitle>
            <CardDescription>
              Seznam jednotlivých nákupů voucherů (user_vouchers, redeemed = true)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {purchasesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="mt-2 text-muted-foreground">Načítám nákupy...</p>
              </div>
            ) : safePurchases.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Zatím žádné nákupy voucherů.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Uživatel</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Uplatněno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safePurchases.map((purchase, idx) => (
                    <TableRow key={purchase.id || `purchase-${idx}`}>
                      <TableCell className="font-medium">{purchase.user_email ?? '—'}</TableCell>
                      <TableCell>{purchase.voucher_name ?? '—'}</TableCell>
                      <TableCell>{safeFormatDate(purchase.created_at, 'd.M.yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        )}

        {/* Main Voucher Table — voucher management sections (Aktivní / Naplánované / Archiv) */}
        {sectionTab !== 'purchases' && (
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
                  {searchTerm ? 'Žádné vouchery nenalezeny.' : 'V této sekci nejsou žádné vouchery.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Zbývající množství</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Zveřejnit</TableHead>
                    <TableHead>Platnost</TableHead>
                    <TableHead>Vytvořen</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVouchers.map((voucher, rowIndex) => (
                    <TableRow key={voucher.id || `voucher-row-${rowIndex}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {voucher.image_url && (
                            <img 
                              src={voucher.image_url} 
                              alt={voucher.name ?? '(Bez názvu)'}
                              className="w-10 h-10 object-cover rounded"
                            />
                          )}
                          <div>
                            <div className="font-medium">{voucher.name ?? '(Bez názvu)'}</div>
                            <div className="text-sm text-muted-foreground">
                              Uplatněno: {Number(voucher.redeemed_count ?? 0)}×
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {voucher.max_quantity != null && Number.isFinite(voucher.max_quantity) ? (
                            <Hash className="h-3 w-3" />
                          ) : (
                            <Infinity className="h-3 w-3" />
                          )}
                          {getRemainingText(voucher)}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(voucher)}</TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center">
                                <Checkbox
                                  checked={Boolean(voucher.is_public)}
                                  onCheckedChange={() =>
                                    handleTogglePublic(String(voucher.id ?? ''), Boolean(voucher.is_public))
                                  }
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Zobrazit voucher na homepage veřejně</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-sm">
                        {voucher.start_date && voucher.end_date ? (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {safeFormatDate(voucher.start_date, 'dd.MM.yy')} -{' '}
                            {safeFormatDate(voucher.end_date, 'dd.MM.yy')}
                          </div>
                        ) : voucher.end_date ? (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            Do {safeFormatDate(voucher.end_date, 'dd.MM.yyyy')}
                          </div>
                        ) : voucher.start_date ? (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            Od {safeFormatDate(voucher.start_date, 'dd.MM.yyyy')}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {safeFormatDate(voucher.created_at, 'dd.MM.yyyy')}
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
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEditDialog(voucher)}
                          >
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
                                  {`Opravdu chcete smazat voucher "${voucher.name ?? '(Bez názvu)'}"? Tato akce je nevratná.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Zrušit</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteVoucher(String(voucher.id ?? ''))}
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
        )}

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
                      alt={selectedVoucher.name ?? '(Bez názvu)'}
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  )}
                  {selectedVoucher.banner_url && (
                    <img 
                      src={selectedVoucher.banner_url} 
                      alt={`${selectedVoucher.name ?? '(Bez názvu)'} banner`}
                      className="w-48 h-32 object-cover rounded-lg"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Název:</strong> {selectedVoucher.name ?? '—'}</div>
                  <div><strong>Stav:</strong> {getStatusBadge(selectedVoucher)}</div>
                  <div><strong>Zbývající:</strong> {getRemainingText(selectedVoucher)}</div>
                  <div><strong>Uplatněno:</strong> {Number(selectedVoucher.redeemed_count ?? 0)}×</div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Voucher Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upravit Voucher</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Název voucheru *</Label>
                <Input
                  id="edit-name"
                  value={voucherForm.name}
                  onChange={(e) => setVoucherForm({...voucherForm, name: e.target.value})}
                  placeholder="Např. Sleva 20% na celý nákup"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-mainImage">Hlavní obrázek voucheru</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="edit-mainImage"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setVoucherForm({...voucherForm, imageFile: e.target.files?.[0] || null})}
                      className="flex-1"
                    />
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Nechte prázdné pro zachování současného obrázku
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-bannerImage">Banner obrázek</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="edit-bannerImage"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setVoucherForm({...voucherForm, bannerFile: e.target.files?.[0] || null})}
                      className="flex-1"
                    />
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Nechte prázdné pro zachování současného banneru
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Množství</Label>
                <Select
                  value={voucherForm.maxQuantity === null ? 'unlimited' : 'limited'}
                  onValueChange={(value) => setVoucherForm({
                    ...voucherForm, 
                    maxQuantity: value === 'unlimited' ? null : (voucherForm.maxQuantity || 100)
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
                        {safeFormatPickerDate(voucherForm.startDate, 'dd.MM.yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={voucherForm.startDate}
                        onSelect={(date) => setVoucherForm({...voucherForm, startDate: date})}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
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
                        {safeFormatPickerDate(voucherForm.endDate, 'dd.MM.yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={voucherForm.endDate}
                        onSelect={(date) => setVoucherForm({...voucherForm, endDate: date})}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingVoucher(null);
                    resetForm();
                  }}
                  className="flex-1"
                >
                  Zrušit
                </Button>
                <Button 
                  onClick={handleEditVoucher}
                  disabled={createLoading}
                  className="flex-1"
                >
                  {createLoading ? 'Ukládání...' : 'Uložit změny'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default AdminVouchers;