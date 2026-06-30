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
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Upload, Calendar as CalendarIcon, Infinity, Hash, Image as ImageIcon, Search, Edit, Trash2, Eye, Gift, KeyRound, FileUp, Download, Ban, RefreshCw, CheckCircle2 } from 'lucide-react';
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

type VoucherCodeStatus = 'available' | 'issued' | 'voided';

interface VoucherCode {
  id: string;
  voucher_id: string;
  batch_id: string | null;
  code: string;
  status: VoucherCodeStatus;
  issued_to_user_id: string | null;
  issued_user_voucher_id: string | null;
  issued_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface VoucherCodeBatch {
  id: string;
  voucher_id: string;
  source: string;
  label: string | null;
  total_count: number;
  created_by: string | null;
  created_at: string | null;
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

function normalizeVoucherCodeValue(code: string): string {
  return code.trim().toUpperCase();
}

function parseVoucherCodesInput(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\s,;]+/)
    .map(normalizeVoucherCodeValue)
    .filter((code) => {
      if (code === '' || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
}

function randomVoucherCodeChunk(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 10)
    .toUpperCase();
}

function generateOneMilVoucherCodes(count: number, existingCodes: Set<string>): string[] {
  const codes: string[] = [];
  let attempts = 0;
  while (codes.length < count && attempts < count * 20) {
    attempts += 1;
    const code = `OM-${randomVoucherCodeChunk()}`;
    if (existingCodes.has(code)) continue;
    existingCodes.add(code);
    codes.push(code);
  }
  return codes;
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Single source of truth for voucher status — same logic already used across
 * the filter, status badge and summary cards in this file, extracted so the
 * section tabs (Aktivní / Naplánované / Archiv) classify identically.
 */
type VoucherStatus = 'active' | 'scheduled' | 'hidden' | 'expired' | 'exhausted';
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

  if (endDate && now > endDate) return 'expired';
  if (remainingQuantity !== null && remainingQuantity <= 0) return 'exhausted';
  if (!voucher.is_public) return 'hidden';
  if (startDate && now < startDate) return 'scheduled';
  return 'active';
}

type VoucherSection = 'active' | 'scheduled' | 'hidden' | 'archive' | 'purchases';
type VoucherWizardStep = 'basic' | 'graphics' | 'detail' | 'codes' | 'review';
type VoucherWizardCodeMode = 'generate' | 'import';

const voucherWizardSteps: { key: VoucherWizardStep; label: string }[] = [
  { key: 'basic', label: 'Základ' },
  { key: 'graphics', label: 'Grafika' },
  { key: 'detail', label: 'Detail' },
  { key: 'codes', label: 'Kódy' },
  { key: 'review', label: 'Kontrola' },
];

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
  const [voucherCodes, setVoucherCodes] = useState<VoucherCode[]>([]);
  const [voucherCodeBatches, setVoucherCodeBatches] = useState<VoucherCodeBatch[]>([]);
  const [voucherCodeUsers, setVoucherCodeUsers] = useState<Record<string, string>>({});
  const [codesLoading, setCodesLoading] = useState(false);
  const [codeActionLoading, setCodeActionLoading] = useState(false);
  const [generateCount, setGenerateCount] = useState(0);
  const [importCodesText, setImportCodesText] = useState('');
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
  const [voucherWizardStep, setVoucherWizardStep] = useState<VoucherWizardStep>('basic');
  const [wizardCodeMode, setWizardCodeMode] = useState<VoucherWizardCodeMode>('generate');
  const [wizardUnlimitedCodeCount, setWizardUnlimitedCodeCount] = useState(100);
  const [wizardImportCodesText, setWizardImportCodesText] = useState('');
  
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

  useEffect(() => {
    if (!selectedVoucher?.id || !user || !isAdmin) {
      setVoucherCodes([]);
      setVoucherCodeBatches([]);
      setVoucherCodeUsers({});
      setGenerateCount(0);
      setImportCodesText('');
      setVoidReasons({});
      return;
    }

    const suggestedCount =
      selectedVoucher.max_quantity != null && Number.isFinite(selectedVoucher.max_quantity)
        ? selectedVoucher.max_quantity
        : 0;
    setGenerateCount(suggestedCount);
    fetchVoucherCodes(selectedVoucher.id);
  }, [selectedVoucher?.id, user, isAdmin]);

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

  const fetchVoucherCodes = async (voucherId: string) => {
    if (!voucherId) return;

    try {
      setCodesLoading(true);
      const [{ data: codesData, error: codesError }, { data: batchesData, error: batchesError }] =
        await Promise.all([
          supabase
            .from('voucher_codes')
            .select('*')
            .eq('voucher_id', voucherId)
            .order('created_at', { ascending: false }),
          supabase
            .from('voucher_code_batches')
            .select('*')
            .eq('voucher_id', voucherId)
            .order('created_at', { ascending: false }),
        ]);

      if (codesError) throw codesError;
      if (batchesError) throw batchesError;

      const codes = (codesData || []).map((row) => ({
        id: row.id,
        voucher_id: row.voucher_id,
        batch_id: row.batch_id,
        code: row.code,
        status: row.status as VoucherCodeStatus,
        issued_to_user_id: row.issued_to_user_id,
        issued_user_voucher_id: row.issued_user_voucher_id,
        issued_at: row.issued_at,
        voided_at: row.voided_at,
        voided_by: row.voided_by,
        void_reason: row.void_reason,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      const issuedUserIds = Array.from(
        new Set(
          codes
            .map((code) => code.issued_to_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (issuedUserIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email')
          .in('id', issuedUserIds);

        if (usersError) throw usersError;
        const emailMap = (usersData || []).reduce<Record<string, string>>((acc, row) => {
          if (row.id) acc[row.id] = row.email ?? row.id;
          return acc;
        }, {});
        setVoucherCodeUsers(emailMap);
      } else {
        setVoucherCodeUsers({});
      }

      setVoucherCodes(codes);
      setVoucherCodeBatches(
        (batchesData || []).map((row) => ({
          id: row.id,
          voucher_id: row.voucher_id,
          source: row.source,
          label: row.label,
          total_count: row.total_count,
          created_by: row.created_by,
          created_at: row.created_at,
        }))
      );
    } catch (error: unknown) {
      console.error('Error fetching voucher codes:', error);
      toast.error('Chyba při načítání kódů voucheru');
      setVoucherCodes([]);
      setVoucherCodeBatches([]);
      setVoucherCodeUsers({});
    } finally {
      setCodesLoading(false);
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

  const resetWizardState = () => {
    setVoucherWizardStep('basic');
    setWizardCodeMode('generate');
    setWizardUnlimitedCodeCount(100);
    setWizardImportCodesText('');
  };

  const getWizardTargetCodeCount = () => {
    if (voucherForm.maxQuantity != null && Number.isFinite(voucherForm.maxQuantity)) {
      return Math.max(Math.floor(voucherForm.maxQuantity), 0);
    }
    return Math.max(Math.floor(Number(wizardUnlimitedCodeCount)), 0);
  };

  const getWizardPreparedCodes = () => {
    if (wizardCodeMode === 'import') return parseVoucherCodesInput(wizardImportCodesText);
    return generateOneMilVoucherCodes(getWizardTargetCodeCount(), new Set());
  };

  const validateWizardVoucherForm = (mode: 'create' | 'edit') => {
    if (!voucherForm.name.trim()) {
      return 'Vyplňte název voucheru.';
    }
    if (mode === 'create' && !voucherForm.imageFile) {
      return 'Nahrajte hlavní obrázek voucheru.';
    }
    if (
      voucherForm.startDate &&
      voucherForm.endDate &&
      voucherForm.startDate.getTime() > voucherForm.endDate.getTime()
    ) {
      return 'Datum začátku nesmí být později než datum konce.';
    }
    if (voucherForm.maxQuantity != null && voucherForm.maxQuantity <= 0) {
      return 'Omezené množství musí být alespoň 1 kus.';
    }
    return null;
  };

  const validateWizardCodes = (codes: string[]) => {
    if (codes.length === 0) {
      return 'Připravte alespoň jeden unikátní kód.';
    }
    if (voucherForm.maxQuantity != null && codes.length !== voucherForm.maxQuantity) {
      return `Počet kódů (${codes.length}) musí přesně odpovídat množství voucheru (${voucherForm.maxQuantity}).`;
    }
    return null;
  };

  const findExistingVoucherCodes = async (codes: string[]) => {
    if (codes.length === 0) return new Set<string>();
    const { data, error } = await supabase
      .from('voucher_codes')
      .select('code')
      .in('code', codes);

    if (error) throw error;
    return new Set((data || []).map((row) => normalizeVoucherCodeValue(row.code)));
  };

  const handleCreateVoucher = async () => {
    const formError = validateWizardVoucherForm('create');
    if (formError) {
      toast.error(formError);
      return;
    }

    const preparedCodes = getWizardPreparedCodes();
    const codesError = validateWizardCodes(preparedCodes);
    if (codesError) {
      toast.error(codesError);
      setVoucherWizardStep('codes');
      return;
    }

    let createdVoucherId: string | null = null;
    try {
      setCreateLoading(true);
      const existingCodes = await findExistingVoucherCodes(preparedCodes);
      if (existingCodes.size > 0) {
        toast.error(`Některé kódy už v systému existují (${existingCodes.size}).`);
        setVoucherWizardStep('codes');
        return;
      }

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
      createdVoucherId = data.id;

      await createVoucherCodeBatch(
        data.id,
        wizardCodeMode === 'generate' ? 'generated_by_onemil' : 'provided_by_partner',
        wizardCodeMode === 'generate'
          ? `OneMil generování při vytvoření ${format(new Date(), 'yyyy-MM-dd HH:mm')}`
          : `Import partner kódů při vytvoření ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
        preparedCodes
      );

      toast.success(`Voucher byl úspěšně vytvořen včetně ${preparedCodes.length} kódů`);
      setShowCreateDialog(false);
      resetForm();
      resetWizardState();
      fetchVouchers();
    } catch (error: any) {
      console.error('Error creating voucher:', error);
      if (createdVoucherId) {
        await supabase.from('vouchers').delete().eq('id', createdVoucherId);
      }
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
    resetWizardState();
  };

  const openEditDialog = (voucher: Voucher) => {
    setEditingVoucher(voucher);
    resetWizardState();
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
    if (!editingVoucher?.id) return;
    const formError = validateWizardVoucherForm('edit');
    if (formError) {
      toast.error(formError);
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
      resetWizardState();
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

  const createVoucherCodeBatch = async (
    voucherId: string,
    source: 'generated_by_onemil' | 'provided_by_partner',
    label: string,
    codes: string[]
  ) => {
    const { data: batch, error: batchError } = await supabase
      .from('voucher_code_batches')
      .insert({
        voucher_id: voucherId,
        source,
        label,
        total_count: codes.length,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    const { error: codesError } = await supabase
      .from('voucher_codes')
      .insert(
        codes.map((code) => ({
          voucher_id: voucherId,
          batch_id: batch.id,
          code,
          status: 'available',
          created_by: user?.id ?? null,
        }))
      );

    if (codesError) {
      await supabase
        .from('voucher_code_batches')
        .delete()
        .eq('id', batch.id);
      throw codesError;
    }
  };

  const handleGenerateVoucherCodes = async () => {
    if (!selectedVoucher?.id) return;
    const count = Math.floor(Number(generateCount));
    if (!Number.isFinite(count) || count <= 0) {
      toast.error('Zadejte počet kódů k vygenerování');
      return;
    }

    const nonVoidedCodeCount = voucherCodes.filter((code) => code.status !== 'voided').length;
    if (
      selectedVoucher.max_quantity != null &&
      nonVoidedCodeCount + count > selectedVoucher.max_quantity
    ) {
      toast.error('Počet kódů by překročil nastavený počet kusů voucheru');
      return;
    }

    try {
      setCodeActionLoading(true);
      const existingCodes = new Set(voucherCodes.map((code) => normalizeVoucherCodeValue(code.code)));
      const codes = generateOneMilVoucherCodes(count, existingCodes);
      if (codes.length !== count) {
        toast.error('Nepodařilo se připravit dost unikátních kódů');
        return;
      }

      await createVoucherCodeBatch(
        selectedVoucher.id,
        'generated_by_onemil',
        `OneMil generování ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
        codes
      );
      toast.success(`Vygenerováno ${codes.length} kódů`);
      await fetchVoucherCodes(selectedVoucher.id);
    } catch (error: unknown) {
      console.error('Error generating voucher codes:', error);
      toast.error('Chyba při generování kódů');
    } finally {
      setCodeActionLoading(false);
    }
  };

  const handleImportVoucherCodes = async () => {
    if (!selectedVoucher?.id) return;
    const codes = parseVoucherCodesInput(importCodesText);
    if (codes.length === 0) {
      toast.error('Vložte alespoň jeden kód');
      return;
    }

    const existingCodes = new Set(voucherCodes.map((code) => normalizeVoucherCodeValue(code.code)));
    const duplicates = codes.filter((code) => existingCodes.has(code));
    if (duplicates.length > 0) {
      toast.error(`Import obsahuje ${duplicates.length} kódů, které už u voucheru existují`);
      return;
    }

    const nonVoidedCodeCount = voucherCodes.filter((code) => code.status !== 'voided').length;
    if (
      selectedVoucher.max_quantity != null &&
      nonVoidedCodeCount + codes.length > selectedVoucher.max_quantity
    ) {
      toast.error('Počet kódů by překročil nastavený počet kusů voucheru');
      return;
    }

    try {
      setCodeActionLoading(true);
      await createVoucherCodeBatch(
        selectedVoucher.id,
        'provided_by_partner',
        `Import partner kódů ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
        codes
      );
      setImportCodesText('');
      toast.success(`Importováno ${codes.length} kódů`);
      await fetchVoucherCodes(selectedVoucher.id);
    } catch (error: unknown) {
      console.error('Error importing voucher codes:', error);
      toast.error('Chyba při importu kódů');
    } finally {
      setCodeActionLoading(false);
    }
  };

  const handleExportVoucherCodes = () => {
    if (!selectedVoucher) return;
    const safeName = selectedVoucher.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'voucher';
    const rows = [
      ['code', 'status', 'issued_to', 'issued_at', 'voided_at', 'void_reason', 'batch_id'],
      ...voucherCodes.map((code) => [
        code.code,
        code.status,
        code.issued_to_user_id ? voucherCodeUsers[code.issued_to_user_id] ?? code.issued_to_user_id : '',
        code.issued_at ? safeFormatDate(code.issued_at, 'yyyy-MM-dd HH:mm:ss') : '',
        code.voided_at ? safeFormatDate(code.voided_at, 'yyyy-MM-dd HH:mm:ss') : '',
        code.void_reason ?? '',
        code.batch_id ?? '',
      ]),
    ];
    downloadCsv(`${safeName}-voucher-codes.csv`, rows);
  };

  const handleVoidVoucherCode = async (code: VoucherCode) => {
    if (!selectedVoucher?.id || code.status === 'voided') return;

    try {
      setCodeActionLoading(true);
      const { error } = await supabase
        .from('voucher_codes')
        .update({
          status: 'voided',
          voided_at: new Date().toISOString(),
          voided_by: user?.id ?? null,
          void_reason: voidReasons[code.id]?.trim() || 'Zneplatněno adminem',
        })
        .eq('id', code.id);

      if (error) throw error;
      toast.success('Kód byl zneplatněn');
      setVoidReasons((current) => {
        const next = { ...current };
        delete next[code.id];
        return next;
      });
      await fetchVoucherCodes(selectedVoucher.id);
    } catch (error: unknown) {
      console.error('Error voiding voucher code:', error);
      toast.error('Chyba při zneplatnění kódu');
    } finally {
      setCodeActionLoading(false);
    }
  };

  const safeVouchers = Array.isArray(vouchers) ? vouchers : [];
  const safePurchases = Array.isArray(voucherPurchases) ? voucherPurchases : [];
  const codeStats = voucherCodes.reduce(
    (acc, code) => {
      acc.total += 1;
      acc[code.status] += 1;
      return acc;
    },
    { total: 0, available: 0, issued: 0, voided: 0 }
  );
  const suggestedGenerateCount =
    selectedVoucher?.max_quantity != null && Number.isFinite(selectedVoucher.max_quantity)
      ? Math.max(
          selectedVoucher.max_quantity -
            voucherCodes.filter((code) => code.status !== 'voided').length,
          0
        )
      : 0;

  const filteredVouchers = safeVouchers.filter((voucher) => {
    if (!voucher || voucher.id == null) return false;
    const matchesSearch = (voucher.name ?? '')
      .toLowerCase()
      .includes((searchTerm ?? '').toLowerCase());
    if (!matchesSearch) return false;

    const status = getVoucherStatus(voucher);
    if (sectionTab === 'active') return status === 'active';
    if (sectionTab === 'scheduled') return status === 'scheduled';
    if (sectionTab === 'hidden') return status === 'hidden';
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
    if (status === 'hidden') return <Badge variant="secondary">Skryté</Badge>;
    if (status === 'expired') return <Badge variant="destructive">Vypršelo</Badge>;
    if (status === 'exhausted') return <Badge variant="destructive">Vyčerpáno</Badge>;
    return <Badge variant="success">Aktivní</Badge>;
  };

  const getCodeStatusBadge = (status: VoucherCodeStatus) => {
    if (status === 'available') return <Badge variant="success">Volný</Badge>;
    if (status === 'issued') return <Badge variant="pending">Vydaný</Badge>;
    return <Badge variant="destructive">Zneplatněný</Badge>;
  };

  const renderVoucherWizardContent = (mode: 'create' | 'edit') => {
    const isCreate = mode === 'create';
    const currentCodes =
      isCreate && wizardCodeMode === 'import'
        ? parseVoucherCodesInput(wizardImportCodesText)
        : isCreate
          ? Array.from({ length: getWizardTargetCodeCount() }, (_, index) => `OM-${index + 1}`)
          : [];
    const codeCount = currentCodes.length;
    const codeCountMatches =
      voucherForm.maxQuantity == null || codeCount === voucherForm.maxQuantity;
    const canSubmit =
      !createLoading &&
      !validateWizardVoucherForm(mode) &&
      (!isCreate || (codeCount > 0 && codeCountMatches));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {voucherWizardSteps.map((step) => (
            <Button
              key={step.key}
              type="button"
              variant={voucherWizardStep === step.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVoucherWizardStep(step.key)}
            >
              {step.label}
            </Button>
          ))}
        </div>

        {voucherWizardStep === 'basic' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-voucher-name`}>Název voucheru *</Label>
              <Input
                id={`${mode}-voucher-name`}
                value={voucherForm.name}
                onChange={(event) => setVoucherForm({ ...voucherForm, name: event.target.value })}
                placeholder="Např. Partner - sleva 20 %"
              />
            </div>

            <div className="space-y-2">
              <Label>Množství</Label>
              <Select
                value={voucherForm.maxQuantity === null ? 'unlimited' : 'limited'}
                onValueChange={(value) =>
                  setVoucherForm({
                    ...voucherForm,
                    maxQuantity: value === 'unlimited' ? null : (voucherForm.maxQuantity || 100),
                  })
                }
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
                  onChange={(event) =>
                    setVoucherForm({
                      ...voucherForm,
                      maxQuantity: parseInt(event.target.value, 10) || 1,
                    })
                  }
                  placeholder="Počet dostupných voucherů"
                />
              )}
            </div>
          </div>
        )}

        {voucherWizardStep === 'graphics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-main-image`}>
                Hlavní obrázek voucheru {isCreate ? '*' : ''}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${mode}-main-image`}
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setVoucherForm({ ...voucherForm, imageFile: event.target.files?.[0] || null })
                  }
                  className="flex-1"
                />
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isCreate ? 'Fallback obrázek je povinný.' : 'Nechte prázdné pro zachování současného obrázku.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${mode}-banner-image`}>Full-card banner</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${mode}-banner-image`}
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setVoucherForm({ ...voucherForm, bannerFile: event.target.files?.[0] || null })
                  }
                  className="flex-1"
                />
                <Upload className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Banner má nést partnera, nabídku a hlavní sdělení voucheru.
              </p>
            </div>
          </div>
        )}

        {voucherWizardStep === 'detail' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datum začátku</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !voucherForm.startDate && 'text-muted-foreground'
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
                      onSelect={(date) => setVoucherForm({ ...voucherForm, startDate: date })}
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
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !voucherForm.endDate && 'text-muted-foreground'
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
                      onSelect={(date) => setVoucherForm({ ...voucherForm, endDate: date })}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cena v detailu</span>
                <Badge variant="outline">5 MioCoinů</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Detailové CTA</span>
                <Badge variant="outline">Koupit za 5 MioCoinů</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Text nabídky, partner a hlavní sdělení patří podle návrhu primárně do banneru.
              </p>
            </div>
          </div>
        )}

        {voucherWizardStep === 'codes' && (
          <div className="space-y-4">
            {isCreate ? (
              <>
                <Select
                  value={wizardCodeMode}
                  onValueChange={(value) => setWizardCodeMode(value as VoucherWizardCodeMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generate">Vygenerovat OneMil kódy</SelectItem>
                    <SelectItem value="import">Vložit/importovat partner kódy</SelectItem>
                  </SelectContent>
                </Select>

                {wizardCodeMode === 'generate' ? (
                  <div className="space-y-2 rounded-lg border p-4">
                    <div className="flex items-center gap-2 font-medium">
                      <KeyRound className="h-4 w-4" />
                      OneMil kódy
                    </div>
                    {voucherForm.maxQuantity === null && (
                      <Input
                        type="number"
                        min={1}
                        value={wizardUnlimitedCodeCount}
                        onChange={(event) =>
                          setWizardUnlimitedCodeCount(parseInt(event.target.value, 10) || 1)
                        }
                        placeholder="Počet kódů pro neomezený voucher"
                      />
                    )}
                    <p className="text-sm text-muted-foreground">
                      Připraveno k vytvoření: {codeCount} kódů.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="wizard-import-codes">Partner kódy</Label>
                    <Textarea
                      id="wizard-import-codes"
                      value={wizardImportCodesText}
                      onChange={(event) => setWizardImportCodesText(event.target.value)}
                      placeholder="Vložte kódy oddělené řádkem, čárkou nebo mezerou"
                      className="min-h-[160px]"
                    />
                    <p className="text-sm text-muted-foreground">
                      Rozpoznáno unikátních kódů: {codeCount}.
                    </p>
                  </div>
                )}

                {voucherForm.maxQuantity !== null && (
                  <div className={cn('rounded-lg border p-3 text-sm', codeCountMatches ? 'text-green-700' : 'text-red-700')}>
                    {codeCountMatches
                      ? `Počet kódů sedí s množstvím (${voucherForm.maxQuantity}).`
                      : `Počet kódů musí sedět s množstvím ${voucherForm.maxQuantity}; aktuálně ${codeCount}.`}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2 font-medium">
                  <KeyRound className="h-4 w-4" />
                  Správa existujících kódů
                </div>
                <p className="text-sm text-muted-foreground">
                  U existujícího voucheru zůstává import, export, generování a zneplatnění v náhledu přes ikonu oka.
                </p>
                {editingVoucher && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowEditDialog(false);
                      setSelectedVoucher(editingVoucher);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Otevřít správu kódů
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {voucherWizardStep === 'review' && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Kontrola před uložením
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><strong>Název:</strong> {voucherForm.name || '—'}</div>
                <div><strong>Množství:</strong> {voucherForm.maxQuantity ?? 'Neomezené'}</div>
                <div><strong>Platnost od:</strong> {voucherForm.startDate ? format(voucherForm.startDate, 'dd.MM.yyyy') : '—'}</div>
                <div><strong>Platnost do:</strong> {voucherForm.endDate ? format(voucherForm.endDate, 'dd.MM.yyyy') : '—'}</div>
                <div><strong>Banner:</strong> {voucherForm.bannerFile ? voucherForm.bannerFile.name : isCreate ? '—' : 'beze změny'}</div>
                <div><strong>Kódy:</strong> {isCreate ? `${codeCount} připraveno` : 'správa přes náhled'}</div>
              </div>
            </div>

            {!canSubmit && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {validateWizardVoucherForm(mode) || (isCreate ? validateWizardCodes(currentCodes) : null)}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isCreate) {
                setShowCreateDialog(false);
              } else {
                setShowEditDialog(false);
                setEditingVoucher(null);
              }
              resetForm();
            }}
          >
            Zrušit
          </Button>
          <div className="flex gap-2">
            {voucherWizardStep !== 'basic' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const index = voucherWizardSteps.findIndex((step) => step.key === voucherWizardStep);
                  setVoucherWizardStep(voucherWizardSteps[Math.max(index - 1, 0)].key);
                }}
              >
                Zpět
              </Button>
            )}
            {voucherWizardStep !== 'review' ? (
              <Button
                type="button"
                onClick={() => {
                  const index = voucherWizardSteps.findIndex((step) => step.key === voucherWizardStep);
                  setVoucherWizardStep(voucherWizardSteps[Math.min(index + 1, voucherWizardSteps.length - 1)].key);
                }}
              >
                Pokračovat
              </Button>
            ) : (
              <Button
                type="button"
                onClick={isCreate ? handleCreateVoucher : handleEditVoucher}
                disabled={!canSubmit}
              >
                {createLoading
                  ? isCreate ? 'Vytváření...' : 'Ukládání...'
                  : isCreate ? 'Vytvořit voucher a kódy' : 'Uložit změny'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
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
            
            <Dialog
              open={showCreateDialog}
              onOpenChange={(open) => {
                setShowCreateDialog(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nový Voucher
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Vytvořit Nový Voucher</DialogTitle>
              </DialogHeader>
              {renderVoucherWizardContent('create')}
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
            { key: 'hidden', label: 'Skryté' },
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
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Náhled a kódy voucheru</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
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

                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <KeyRound className="h-5 w-5" />
                          Kódy voucheru
                        </CardTitle>
                        <CardDescription>
                          Admin správa unikátních kódů pro partnera. Veřejná stránka a nákup voucherů se tím nemění.
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleExportVoucherCodes}
                        disabled={voucherCodes.length === 0 || codesLoading}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Celkem</div>
                        <div className="text-2xl font-semibold">{codeStats.total}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Volné</div>
                        <div className="text-2xl font-semibold text-green-600">{codeStats.available}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Vydané</div>
                        <div className="text-2xl font-semibold text-amber-600">{codeStats.issued}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Zneplatněné</div>
                        <div className="text-2xl font-semibold text-red-600">{codeStats.voided}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center gap-2 font-medium">
                          <RefreshCw className="h-4 w-4" />
                          Generovat OneMil kódy
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={generateCount}
                            onChange={(event) => setGenerateCount(Number(event.target.value))}
                            placeholder="Počet kódů"
                          />
                          <Button
                            variant="outline"
                            onClick={() => setGenerateCount(suggestedGenerateCount)}
                            disabled={suggestedGenerateCount <= 0}
                          >
                            Doplnit
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Doplnění vychází z nastaveného počtu kusů voucheru. Pro neomezený voucher zadejte počet ručně.
                        </p>
                        <Button
                          onClick={handleGenerateVoucherCodes}
                          disabled={codeActionLoading || generateCount <= 0}
                          className="w-full"
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          {codeActionLoading ? 'Pracuji...' : 'Vygenerovat kódy'}
                        </Button>
                      </div>

                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center gap-2 font-medium">
                          <FileUp className="h-4 w-4" />
                          Import partner kódů
                        </div>
                        <Textarea
                          value={importCodesText}
                          onChange={(event) => setImportCodesText(event.target.value)}
                          placeholder="Vložte kódy oddělené řádkem, čárkou nebo mezerou"
                          className="min-h-[112px]"
                        />
                        <Button
                          onClick={handleImportVoucherCodes}
                          disabled={codeActionLoading || importCodesText.trim() === ''}
                          className="w-full"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {codeActionLoading ? 'Importuji...' : 'Importovat kódy'}
                        </Button>
                      </div>
                    </div>

                    {voucherCodeBatches.length > 0 && (
                      <div className="space-y-2">
                        <Label>Batch importy a generování</Label>
                        <div className="flex flex-wrap gap-2">
                          {voucherCodeBatches.map((batch) => (
                            <Badge key={batch.id} variant="outline" className="gap-1">
                              {batch.source === 'generated_by_onemil' ? 'OneMil' : 'Partner'}
                              <span>·</span>
                              <span>{batch.total_count} ks</span>
                              {batch.created_at && <span>· {safeFormatDate(batch.created_at, 'd. M. yyyy HH:mm')}</span>}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {codesLoading ? (
                      <div className="text-sm text-muted-foreground">Načítání kódů...</div>
                    ) : voucherCodes.length === 0 ? (
                      <div className="text-sm text-muted-foreground border rounded-lg p-4">
                        Zatím nejsou připravené žádné unikátní kódy.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kód</TableHead>
                            <TableHead>Stav</TableHead>
                            <TableHead>Vydáno komu</TableHead>
                            <TableHead>Vydáno kdy</TableHead>
                            <TableHead>Zneplatnění</TableHead>
                            <TableHead className="text-right">Akce</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {voucherCodes.map((code) => (
                            <TableRow key={code.id}>
                              <TableCell className="font-mono text-xs">{code.code}</TableCell>
                              <TableCell>{getCodeStatusBadge(code.status)}</TableCell>
                              <TableCell>
                                {code.issued_to_user_id
                                  ? voucherCodeUsers[code.issued_to_user_id] ?? code.issued_to_user_id
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {code.issued_at ? safeFormatDate(code.issued_at, 'd. M. yyyy HH:mm') : '—'}
                              </TableCell>
                              <TableCell>
                                {code.voided_at ? (
                                  <div className="space-y-1">
                                    <div>{safeFormatDate(code.voided_at, 'd. M. yyyy HH:mm')}</div>
                                    {code.void_reason && (
                                      <div className="text-xs text-muted-foreground">{code.void_reason}</div>
                                    )}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {code.status !== 'voided' && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="outline" size="sm" disabled={codeActionLoading}>
                                        <Ban className="h-4 w-4 mr-2" />
                                        Zneplatnit
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Zneplatnit kód?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Kód {code.code} bude označen jako zneplatněný. Tato akce nemění nákup voucheru ani peněženku uživatele.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <div className="space-y-2">
                                        <Label htmlFor={`void-reason-${code.id}`}>Důvod zneplatnění</Label>
                                        <Input
                                          id={`void-reason-${code.id}`}
                                          value={voidReasons[code.id] ?? ''}
                                          onChange={(event) =>
                                            setVoidReasons((current) => ({
                                              ...current,
                                              [code.id]: event.target.value,
                                            }))
                                          }
                                          placeholder="Volitelné"
                                        />
                                      </div>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Zrušit</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleVoidVoucherCode(code)}
                                          disabled={codeActionLoading}
                                        >
                                          Zneplatnit
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
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
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Voucher Dialog */}
        <Dialog
          open={showEditDialog}
          onOpenChange={(open) => {
            setShowEditDialog(open);
            if (!open) {
              setEditingVoucher(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upravit Voucher</DialogTitle>
            </DialogHeader>
            {renderVoucherWizardContent('edit')}
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default AdminVouchers;
