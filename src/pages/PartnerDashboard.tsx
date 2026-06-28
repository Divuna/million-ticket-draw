import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase, withEdgeInternalToken } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, Coins, Key, FileText, TrendingUp, Calendar, Upload, Image, Clock, CheckCircle, XCircle, Mail, BookOpen, Rocket, ListChecks, ExternalLink, AlertCircle, Info, Gift, RefreshCw, Copy, Eye, EyeOff, Activity, Settings, Save, Plus, Send, RotateCcw, Tag, Receipt, Download } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PartnerBillingForm from '@/components/PartnerBillingForm';
import { format, startOfWeek, endOfWeek, subWeeks, subDays, isAfter } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useUserRole } from '@/hooks/useUserRole';

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string;
  website_url: string;
  status: string;
  logo_status: string;
  mc_per_99_czk: number;
  price_per_coin: number;
  vat_rate: number;
  reward_base_czk: number;
  reward_mc: number;
  ico: string | null;
  dic: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  contact_email: string | null;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
}

interface WeeklyReport {
  week_start: string;
  week_end: string;
  issued_count: number;
  issued_coins: number;
  activated_count: number;
  activated_coins: number;
}

interface ApiActivity {
  endpoint: string | null;
  created_at: string | null;
}

// Shoptet self-service connection request. The Shoptet export URL is NEVER
// stored here, returned to, or held in client state after submit — only the
// url_received boolean flag indicates whether a URL was provided.
interface ShoptetConnRequest {
  id: string;
  shop_name: string;
  trigger_status: string;
  reward_czk: number;
  reward_mc: number;
  url_received: boolean;
  status: string;
  partner_note: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const PARTNER_ROTATE_ERROR_MESSAGES: Record<string, string> = {
  invalid_password: 'Neplatné heslo.',
  password_required: 'Heslo je povinné.',
  internal_token_invalid: 'Nepodařilo se ověřit interní přístup. Zkontrolujte konfiguraci.',
  missing_session: 'Nejste přihlášený. Přihlaste se znovu.',
  partner_link_missing: 'Partnerský účet není správně propojený.',
  partner_not_found: 'Partnerský účet není správně propojený.',
  partner_not_approved: 'Partnerský účet zatím není schválený.',
  key_generation_failed: 'API klíč se nepodařilo obnovit.',
  key_rotation_failed: 'API klíč se nepodařilo obnovit.',
  invalid_request: 'API klíč se nepodařilo obnovit.',
};

const DEFAULT_PARTNER_ROTATE_ERROR = 'API klíč se nepodařilo obnovit.';

async function extractFunctionErrorCode(response?: Response): Promise<string | null> {
  if (!response) return null;

  const text = await response.clone().text().catch(() => '');
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return text.trim() === 'Unauthorized' ? 'internal_token_invalid' : null;
  }
}

async function getPartnerRotateErrorMessage(result: {
  data: unknown;
  error: unknown;
  response?: Response;
}): Promise<string> {
  const dataError =
    result.data &&
    typeof result.data === 'object' &&
    'error' in result.data &&
    typeof (result.data as { error?: unknown }).error === 'string'
      ? (result.data as { error: string }).error
      : null;

  const responseError = await extractFunctionErrorCode(result.response);
  const errorCode = dataError ?? responseError;

  if (errorCode && PARTNER_ROTATE_ERROR_MESSAGES[errorCode]) {
    return PARTNER_ROTATE_ERROR_MESSAGES[errorCode];
  }

  return DEFAULT_PARTNER_ROTATE_ERROR;
}

interface OfferBillingConfig {
  billing_mode: string;
  price_per_activation: number;
}

interface OfferInvoice {
  id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  amount_gross: number | null;
  amount_inc_vat: number | null;
  status: string;
  created_at: string;
}

interface PartnerOffer {
  id: string;
  title: string;
  short_text: string;
  deployment_mode: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  link_or_code: string | null;
  logo_url: string | null;
  banner_url: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  created_at: string;
  last_assigned_at: string | null;
  billing_mode: string;
  price_per_activation: number;
  billing_admin_override: boolean;
}

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [apiActivity, setApiActivity] = useState<ApiActivity[]>([]);
  const [showApiTechnicalDetails, setShowApiTechnicalDetails] = useState(false);
  const [stats, setStats] = useState({
    totalIssued: 0,
    totalActivated: 0,
    totalIssuedCoins: 0,
    totalActivatedCoins: 0,
  });
  
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [activatingReward, setActivatingReward] = useState(false);
  
  // Partner reward settings state
  const [rewardBaseCzk, setRewardBaseCzk] = useState<string>('');
  const [rewardMc, setRewardMc] = useState<string>('');
  const [savingRewardSettings, setSavingRewardSettings] = useState(false);
  
  // Activate reward modal state
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [rewardCodeInput, setRewardCodeInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');

  // API Key rotation modal state
  const [rotatePasswordModalOpen, setRotatePasswordModalOpen] = useState(false);
  const [rotateSuccessModalOpen, setRotateSuccessModalOpen] = useState(false);
  const [rotatePassword, setRotatePassword] = useState('');
  const [rotatePasswordVisible, setRotatePasswordVisible] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [rotatingKey, setRotatingKey] = useState(false);

  // ── Shoptet self-service connection state ───────────────────────────────────
  const [shoptetReq, setShoptetReq] = useState<ShoptetConnRequest | null>(null);
  const [shoptetShopName, setShoptetShopName] = useState('');
  const [shoptetRewardCzk, setShoptetRewardCzk] = useState('');
  const [shoptetRewardMc, setShoptetRewardMc] = useState('');
  const [shoptetTrigger, setShoptetTrigger] = useState<'paid' | 'shipped' | 'completed'>('paid');
  const [shoptetNote, setShoptetNote] = useState('');
  const [shoptetUrl, setShoptetUrl] = useState(''); // never prefilled, cleared after submit
  const [shoptetSavingDraft, setShoptetSavingDraft] = useState(false);
  const [shoptetSubmitting, setShoptetSubmitting] = useState(false);

  // ── Offer billing state ────────────────────────────────────────────────────
  const [offerActivationCount, setOfferActivationCount] = useState<number>(0);
  const [offerBillingConfig, setOfferBillingConfig] = useState<OfferBillingConfig | null>(null);
  const [offerInvoices, setOfferInvoices] = useState<OfferInvoice[]>([]);
  const [offerBillingLoading, setOfferBillingLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  // ── Per-offer performance stats ────────────────────────────────────────────
  interface OfferPerf { offer_id: string; title: string; activations: number; clicks: number; }
  const [offerPerfStats, setOfferPerfStats] = useState<OfferPerf[]>([]);

  // ── Partner Offers state ───────────────────────────────────────────────────
  const [partnerOffers, setPartnerOffers] = useState<PartnerOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<PartnerOffer | null>(null);
  const [savingOffer, setSavingOffer] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState<string | null>(null);
  const [revisingOffer, setRevisingOffer] = useState<string | null>(null);
  // Offer form fields
  const [offerTitle, setOfferTitle] = useState('');
  const [offerShortText, setOfferShortText] = useState('');
  const [offerDeploymentMode, setOfferDeploymentMode] = useState('all_contests');
  const [offerValidFrom, setOfferValidFrom] = useState('');
  const [offerValidTo, setOfferValidTo] = useState('');
  const [offerLinkOrCode, setOfferLinkOrCode] = useState('');
  const [offerBillingMode, setOfferBillingMode] = useState('paid_distribution');
  const [offerPricePerActivation, setOfferPricePerActivation] = useState('0');
  // Offer image state (stored URLs, populated from DB or after upload)
  const [offerLogoUrl, setOfferLogoUrl] = useState<string | null>(null);
  const [offerBannerUrl, setOfferBannerUrl] = useState<string | null>(null);
  // Offer image upload state
  const [uploadingOfferLogo, setUploadingOfferLogo] = useState(false);
  const [uploadingOfferBanner, setUploadingOfferBanner] = useState(false);

  // API Documentation modal state
  const [apiDocsModalOpen, setApiDocsModalOpen] = useState(false);
  const [apiDocumentation, setApiDocumentation] = useState('');
  const [apiDocsLoading, setApiDocsLoading] = useState(false);

  const loadApiDocumentation = async () => {
    setApiDocsLoading(true);
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'partner_api_documentation')
        .maybeSingle();

      if (error) throw error;
      setApiDocumentation(data?.value || 'Dokumentace API zatím nebyla nastavena.');
    } catch (error) {
      console.error('Error loading API documentation:', error);
      setApiDocumentation('Nepodařilo se načíst dokumentaci.');
    } finally {
      setApiDocsLoading(false);
    }
  };

  const openApiDocsModal = () => {
    setApiDocsModalOpen(true);
    loadApiDocumentation();
  };

  const handleActivateRewardSubmit = async () => {
    const success = await activatePartnerReward(rewardCodeInput, apiKeyInput);
    if (success) {
      setActivateModalOpen(false);
      setRewardCodeInput('');
      setApiKeyInput('');
    }
  };

  const openActivateModal = () => {
    setRewardCodeInput('');
    setApiKeyInput('');
    setActivateModalOpen(true);
  };

  // Function to handle API key rotation by partner
  // IMPORTANT: This function must ONLY be called after explicit user action (button click + password submit)
  // It should NEVER be called automatically on mount, in useEffect, or during data loading
  const handleRotateApiKey = async () => {
    // Guard: Only proceed if the password modal is actually open (explicit user action)
    if (!rotatePasswordModalOpen) {
      console.warn('[handleRotateApiKey] Called without password modal open - aborting');
      return;
    }

    if (!rotatePassword.trim()) {
      toast.error('Heslo je povinné.');
      return;
    }

    // Prevent double-submission
    if (rotatingKey) {
      return;
    }

    setRotatingKey(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session?.access_token) {
        toast.error('Nejste přihlášený. Přihlaste se znovu.');
        return;
      }

      const res = await supabase.functions.invoke("partner-rotate-api-key", {
        headers: withEdgeInternalToken({
          Authorization: `Bearer ${sessionData.session.access_token}`,
        }),
        body: {
          password: rotatePassword,
        },
      });

      if (res.error || !res.data?.success) {
        toast.error(await getPartnerRotateErrorMessage(res));
        return;
      }

      // Success - show the new key
      setNewApiKey(res.data.api_key);
      setRotatePasswordModalOpen(false);
      setRotatePassword('');
      setRotatePasswordVisible(false);
      setRotateSuccessModalOpen(true);

      // Reload API keys list
      await loadPartnerData();
    } catch (err) {
      console.error('Unexpected partner API key rotation error:', err instanceof Error ? err.message : err);
      toast.error(DEFAULT_PARTNER_ROTATE_ERROR);
    } finally {
      setRotatingKey(false);
    }
  };
  const openRotatePasswordModal = () => {
    setRotatePassword('');
    setRotatePasswordVisible(false);
    setRotatePasswordModalOpen(true);
  };

  const closeRotateSuccessModal = () => {
    setNewApiKey(''); // Clear the key from memory
    setRotateSuccessModalOpen(false);
  };

  const copyApiKeyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(newApiKey);
      toast.success('API klíč byl zkopírován do schránky');
    } catch {
      toast.error('Nepodařilo se zkopírovat do schránky');
    }
  };

  // Function to activate a partner reward code via RPC
  const activatePartnerReward = async (rewardCode: string, apiKey: string): Promise<boolean> => {
    if (!partner) {
      toast.error('Partner nenalezen');
      return false;
    }

    if (!rewardCode.trim()) {
      toast.error('Kód odměny je povinný');
      return false;
    }

    if (!apiKey.trim()) {
      toast.error('API klíč je povinný');
      return false;
    }

    setActivatingReward(true);

    try {
      const { data, error } = await supabase.rpc('activate_partner_reward_sql', {
        p_api_key: apiKey,
        p_partner_id: partner.id,
        p_reward_code: rewardCode,
      });

      if (error) {
        console.error('Chyba při aktivaci odměny:', error);
        
        // Handle specific error messages
        if (error.message.includes('not found') || error.message.includes('nenalezen')) {
          toast.error('Kód odměny nebyl nalezen');
        } else if (error.message.includes('already activated') || error.message.includes('již aktivován')) {
          toast.error('Tento kód byl již aktivován');
        } else if (error.message.includes('expired') || error.message.includes('vypršel')) {
          toast.error('Platnost kódu vypršela');
        } else if (error.message.includes('invalid') || error.message.includes('neplatný')) {
          toast.error('Neplatný API klíč nebo kód odměny');
        } else {
          toast.error(`Chyba při aktivaci: ${error.message}`);
        }
        return false;
      }

      // Check RPC response for success/error
      const result = data as { success?: boolean; error?: string; message?: string } | null;
      
      if (result?.error) {
        toast.error(result.error);
        return false;
      }

      toast.success('Odměna byla úspěšně aktivována');
      
      // Reload data to reflect changes
      await loadPartnerData();
      
      return true;
    } catch (err) {
      console.error('Neočekávaná chyba při aktivaci odměny:', err);
      toast.error('Nastala neočekávaná chyba při aktivaci odměny');
      return false;
    } finally {
      setActivatingReward(false);
    }
  };

  // ── Partner Offers functions ───────────────────────────────────────────────

  const loadPartnerOffers = async (partnerId: string) => {
    setOffersLoading(true);
    try {
      const { data, error } = await supabase
        .from('partner_offers')
        .select('id, title, short_text, deployment_mode, status, valid_from, valid_to, link_or_code, rejection_reason, approved_at, submitted_at, created_at, last_assigned_at, billing_mode, price_per_activation, billing_admin_override')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPartnerOffers((data || []) as PartnerOffer[]);
    } catch (err) {
      console.error('Error loading partner offers:', err);
    } finally {
      setOffersLoading(false);
    }
  };

  // ── Offer billing loader ──────────────────────────────────────────────────
  const loadOfferBilling = async (partnerId: string) => {
    setOfferBillingLoading(true);
    try {
      // 1. activation count
      const { count } = await supabase
        .from('partner_offer_activations')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId);
      setOfferActivationCount(count ?? 0);

      // 2. billing config
      const { data: cfgData } = await supabase
        .from('partner_offer_billing_configs')
        .select('billing_mode, price_per_activation')
        .eq('partner_id', partnerId)
        .maybeSingle();
      setOfferBillingConfig(cfgData ?? null);

      // 3. offer invoices
      const { data: invData } = await supabase
        .from('partner_invoices')
        .select('id, invoice_number, period_start, period_end, amount_gross, amount_inc_vat, status, created_at')
        .eq('partner_id', partnerId)
        .eq('type', 'offer')
        .order('created_at', { ascending: false });
      setOfferInvoices((invData ?? []) as OfferInvoice[]);

      // 4. per-offer performance stats
      const [actData, clkData, offerListData] = await Promise.all([
        supabase.from('partner_offer_activations').select('offer_id').eq('partner_id', partnerId),
        supabase.from('partner_offer_clicks').select('offer_id'),
        supabase.from('partner_offers').select('id, title').eq('partner_id', partnerId),
      ]);
      const actMap: Record<string, number> = {};
      (actData.data ?? []).forEach((r: { offer_id: string }) => { actMap[r.offer_id] = (actMap[r.offer_id] ?? 0) + 1; });
      const clkMap: Record<string, number> = {};
      (clkData.data ?? []).forEach((r: { offer_id: string }) => { clkMap[r.offer_id] = (clkMap[r.offer_id] ?? 0) + 1; });
      const perf = (offerListData.data ?? []).map((o: { id: string; title: string }) => ({
        offer_id: o.id,
        title: o.title,
        activations: actMap[o.id] ?? 0,
        clicks: clkMap[o.id] ?? 0,
      }));
      perf.sort((a, b) => b.activations - a.activations);
      setOfferPerfStats(perf);
    } catch (err) {
      console.error('Error loading offer billing:', err);
    } finally {
      setOfferBillingLoading(false);
    }
  };

  // Partner only downloads an already generated PDF (RLS-scoped to own
  // invoices); generation is admin/system-only — no secrets in the browser.
  const downloadOfferInvoicePdf = async (invoiceId: string) => {
    setGeneratingPdf(invoiceId);
    try {
      const { data, error } = await supabase
        .from('partner_invoice_exports')
        .select('file_url')
        .eq('invoice_id', invoiceId)
        .eq('format', 'pdf')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data?.file_url) {
        window.open(data.file_url, '_blank');
      } else {
        toast.error('PDF faktura zatím není k dispozici');
      }
    } catch (err) {
      console.error('Error downloading PDF:', err);
      toast.error('Chyba při stahování PDF');
    } finally {
      setGeneratingPdf(null);
    }
  };

  const openCreateOffer = () => {
    setEditingOffer(null);
    setOfferTitle('');
    setOfferShortText('');
    setOfferDeploymentMode('all_contests');
    setOfferValidFrom('');
    setOfferValidTo('');
    setOfferLinkOrCode('');
    setOfferLogoUrl(null);
    setOfferBannerUrl(null);
    // Pre-fill billing from partner config if available, otherwise defaults
    setOfferBillingMode(offerBillingConfig?.billing_mode ?? 'paid_distribution');
    setOfferPricePerActivation(String(offerBillingConfig?.price_per_activation ?? 0));
    setOfferFormOpen(true);
  };

  const openEditOffer = (offer: PartnerOffer) => {
    setEditingOffer(offer);
    setOfferTitle(offer.title);
    setOfferShortText(offer.short_text);
    setOfferDeploymentMode(offer.deployment_mode);
    setOfferValidFrom(offer.valid_from ? offer.valid_from.slice(0, 10) : '');
    setOfferValidTo(offer.valid_to ? offer.valid_to.slice(0, 10) : '');
    setOfferLinkOrCode(offer.link_or_code || '');
    setOfferLogoUrl(offer.logo_url);
    setOfferBannerUrl(offer.banner_url);
    setOfferBillingMode(offer.billing_mode ?? 'paid_distribution');
    setOfferPricePerActivation(String(offer.price_per_activation ?? 0));
    setOfferFormOpen(true);
  };

  const handleSaveOfferDraft = async () => {
    if (!partner) return;
    if (!offerTitle.trim()) { toast.error('Název nabídky je povinný'); return; }
    if (!offerShortText.trim()) { toast.error('Krátký popis je povinný'); return; }

    setSavingOffer(true);
    try {
      if (editingOffer) {
        // Update existing draft or rejected offer
        const { error } = await supabase
          .from('partner_offers')
          .update({
            title: offerTitle.trim(),
            short_text: offerShortText.trim(),
            deployment_mode: offerDeploymentMode,
            valid_from: offerValidFrom || null,
            valid_to: offerValidTo || null,
            link_or_code: offerLinkOrCode.trim() || null,
            logo_url: offerLogoUrl,
            banner_url: offerBannerUrl,
            billing_mode: offerBillingMode,
            price_per_activation: parseFloat(offerPricePerActivation) || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingOffer.id);
        if (error) throw error;
        toast.success('Nabídka byla uložena');
      } else {
        // Create new draft
        const { error } = await supabase
          .from('partner_offers')
          .insert({
            partner_id: partner.id,
            title: offerTitle.trim(),
            short_text: offerShortText.trim(),
            deployment_mode: offerDeploymentMode,
            valid_from: offerValidFrom || null,
            valid_to: offerValidTo || null,
            link_or_code: offerLinkOrCode.trim() || null,
            logo_url: offerLogoUrl,
            banner_url: offerBannerUrl,
            status: 'draft',
            billing_mode: offerBillingMode,
            price_per_activation: parseFloat(offerPricePerActivation) || 0,
          });
        if (error) throw error;
        toast.success('Nabídka byla vytvořena jako koncept');
      }
      setOfferFormOpen(false);
      await loadPartnerOffers(partner.id);
    } catch (err: any) {
      console.error('Error saving offer draft:', err);
      toast.error('Nepodařilo se uložit nabídku');
    } finally {
      setSavingOffer(false);
    }
  };

  const handleSubmitOffer = async (offerId: string) => {
    if (!partner) return;
    setSubmittingOffer(offerId);
    try {
      const { error } = await supabase
        .from('partner_offers')
        .update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', offerId)
        .eq('partner_id', partner.id);
      if (error) throw error;
      toast.success('Nabídka byla odeslána ke schválení');
      await loadPartnerOffers(partner.id);
    } catch (err: any) {
      console.error('Error submitting offer:', err);
      toast.error('Nepodařilo se odeslat nabídku');
    } finally {
      setSubmittingOffer(null);
    }
  };

  const handleReviseOffer = async (offerId: string) => {
    if (!partner) return;
    setRevisingOffer(offerId);
    try {
      const { error } = await supabase.rpc('revise_partner_offer', { p_offer_id: offerId });
      if (error) throw error;
      toast.success('Nabídka byla vrácena k úpravám');
      await loadPartnerOffers(partner.id);
    } catch (err: any) {
      console.error('Error revising offer:', err);
      toast.error('Nepodařilo se vrátit nabídku k úpravám');
    } finally {
      setRevisingOffer(null);
    }
  };

  const handleOfferImageUpload = async (
    file: File,
    kind: 'logo' | 'banner',
  ) => {
    const setUploading = kind === 'logo' ? setUploadingOfferLogo : setUploadingOfferBanner;
    const setUrl = kind === 'logo' ? setOfferLogoUrl : setOfferBannerUrl;
    const maxMb = kind === 'logo' ? 2 : 5;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      toast.error('Povolené formáty: PNG, JPG, WEBP');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Maximální velikost souboru je ${maxMb} MB`);
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `offers/${partner!.id}/${kind}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('partner-offer-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('partner-offer-assets')
        .getPublicUrl(fileName);

      setUrl(urlData.publicUrl);
      toast.success(kind === 'logo' ? 'Logo nahráno' : 'Banner nahrán');
    } catch (err: any) {
      console.error(`Error uploading offer ${kind}:`, err);
      toast.error(`Nepodařilo se nahrát ${kind === 'logo' ? 'logo' : 'banner'}`);
    } finally {
      setUploading(false);
    }
  };

  const getOfferStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Koncept</Badge>;
      case 'submitted':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Send className="w-3 h-3 mr-1" />Ke schválení</Badge>;
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />Schváleno</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Zamítnuto</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDeploymentModeLabel = (mode: string) => {
    switch (mode) {
      case 'all_contests': return 'Všechny soutěže';
      case 'selected_contests': return 'Vybrané soutěže';
      default: return mode;
    }
  };

  useEffect(() => {
    loadPartnerData();
  }, []);

  const loadPartnerData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/partner/login');
        return;
      }

      // Load partner info
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();

      if (partnerError || !partnerData) {
        toast.error('Partnerský účet nenalezen');
        navigate('/partner/login');
        return;
      }

      setPartner(partnerData);
      setRewardBaseCzk(String(partnerData.reward_base_czk ?? 0));
      setRewardMc(String(partnerData.reward_mc ?? 0));
      // Load partner offers
      await loadPartnerOffers(partnerData.id);
      // Load offer billing
      await loadOfferBilling(partnerData.id);
      // Load API keys
      const { data: keysData } = await supabase
        .from('partner_api_keys')
        .select('id, key_prefix, created_at, revoked_at')
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false });

      setApiKeys(keysData || []);

      // Load reward codes stats
      const { data: codesData } = await supabase
        .from('partner_reward_codes')
        .select('coins, status, issued_at')
        .eq('partner_id', partnerData.id);

      if (codesData) {
        const totalIssued = codesData.length;
        const totalActivated = codesData.filter(c => c.status === 'activated').length;
        const totalIssuedCoins = codesData.reduce((sum, c) => sum + c.coins, 0);
        const totalActivatedCoins = codesData
          .filter(c => c.status === 'activated')
          .reduce((sum, c) => sum + c.coins, 0);

        setStats({ totalIssued, totalActivated, totalIssuedCoins, totalActivatedCoins });

        // Generate weekly reports for last 4 weeks
        const reports: WeeklyReport[] = [];
        for (let i = 0; i < 4; i++) {
          const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
          const weekEnd = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
          
          const weekCodes = codesData.filter(c => {
            const issuedDate = new Date(c.issued_at);
            return issuedDate >= weekStart && issuedDate <= weekEnd;
          });

          reports.push({
            week_start: format(weekStart, 'dd.MM.yyyy', { locale: cs }),
            week_end: format(weekEnd, 'dd.MM.yyyy', { locale: cs }),
            issued_count: weekCodes.length,
            issued_coins: weekCodes.reduce((sum, c) => sum + c.coins, 0),
            activated_count: weekCodes.filter(c => c.status === 'activated').length,
            activated_coins: weekCodes
              .filter(c => c.status === 'activated')
              .reduce((sum, c) => sum + c.coins, 0),
          });
        }
        setWeeklyReports(reports);
      }

      // Load API activity (read-only, last 50 entries)
      const { data: activityData } = await supabase
        .from('partner_api_activity')
        .select('endpoint, created_at')
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setApiActivity(activityData || []);

      // Load latest Shoptet connection request (RLS: own rows only).
      // The Shoptet URL is never present here — only the url_received flag.
      await loadShoptetRequest(partnerData.id);
    } catch (error) {
      console.error('Error loading partner data:', error);
      toast.error('Nepodařilo se načíst data');
    } finally {
      setLoading(false);
    }
  };



  // ── Shoptet self-service handlers ────────────────────────────────────────────
  const SHOPTET_SELECT = 'id, shop_name, trigger_status, reward_czk, reward_mc, url_received, status, partner_note, rejection_reason, submitted_at, reviewed_at, created_at';

  const loadShoptetRequest = async (partnerId: string) => {
    const { data } = await supabase
      .from('shoptet_connection_requests')
      .select(SHOPTET_SELECT)
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const req = (data as ShoptetConnRequest | null) ?? null;
    setShoptetReq(req);
    if (req) {
      setShoptetShopName(req.shop_name ?? '');
      setShoptetRewardCzk(req.reward_czk != null ? String(req.reward_czk) : '');
      setShoptetRewardMc(req.reward_mc != null ? String(req.reward_mc) : '');
      setShoptetTrigger((['paid', 'shipped', 'completed'].includes(req.trigger_status) ? req.trigger_status : 'paid') as 'paid' | 'shipped' | 'completed');
      setShoptetNote(req.partner_note ?? '');
    }
    // shoptetUrl is intentionally never set from server data.
  };

  // Validates and returns the draft field payload, or null with a toast on error.
  const buildShoptetDraftPayload = () => {
    const shopName = shoptetShopName.trim();
    const czk = parseFloat(shoptetRewardCzk);
    const mc = parseFloat(shoptetRewardMc);
    if (!shopName) {
      toast.error('Zadejte název e-shopu.');
      return null;
    }
    if (!Number.isFinite(czk) || czk <= 0) {
      toast.error('Základ (Kč) musí být kladné číslo.');
      return null;
    }
    if (!Number.isFinite(mc) || mc <= 0) {
      toast.error('MioCoiny musí být kladné číslo.');
      return null;
    }
    return {
      shop_name: shopName,
      reward_czk: czk,
      reward_mc: mc,
      trigger_status: shoptetTrigger,
      partner_note: shoptetNote.trim() ? shoptetNote.trim() : null,
    };
  };

  // Saves (or updates) a clean draft without the URL. RLS allows partner
  // INSERT/UPDATE only on own clean drafts.
  const handleShoptetSaveDraft = async () => {
    if (!partner) return;
    const payload = buildShoptetDraftPayload();
    if (!payload) return;

    setShoptetSavingDraft(true);
    try {
      const editableDraft = shoptetReq && shoptetReq.status === 'draft' && !shoptetReq.url_received;
      if (editableDraft) {
        const { error } = await supabase
          .from('shoptet_connection_requests')
          .update(payload)
          .eq('id', shoptetReq!.id)
          .eq('partner_id', partner.id)
          .eq('status', 'draft');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shoptet_connection_requests')
          .insert({ ...payload, partner_id: partner.id, status: 'draft', url_received: false });
        if (error) throw error;
      }
      await loadShoptetRequest(partner.id);
      toast.success('Koncept napojení uložen.');
    } catch (e) {
      console.error('shoptet draft save failed');
      toast.error('Nepodařilo se uložit koncept.');
    } finally {
      setShoptetSavingDraft(false);
    }
  };

  // Submits the request to admin review with the Shoptet export URL.
  // The URL goes only to the EF (→ Vault) and is cleared from client state right after.
  const handleShoptetSubmit = async () => {
    if (!partner) return;
    const payload = buildShoptetDraftPayload();
    if (!payload) return;
    const url = shoptetUrl.trim();
    if (!url) {
      toast.error('Zadejte URL Shoptet exportu pro odeslání.');
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        toast.error('URL exportu musí začínat https://');
        return;
      }
    } catch {
      toast.error('Zadejte platnou URL exportu.');
      return;
    }

    setShoptetSubmitting(true);
    try {
      // Ensure a clean draft row exists and carries the latest field values.
      let requestId: string | null = null;
      const editableDraft = shoptetReq && shoptetReq.status === 'draft' && !shoptetReq.url_received;
      if (editableDraft) {
        const { error } = await supabase
          .from('shoptet_connection_requests')
          .update(payload)
          .eq('id', shoptetReq!.id)
          .eq('partner_id', partner.id)
          .eq('status', 'draft');
        if (error) throw error;
        requestId = shoptetReq!.id;
      } else {
        const { data, error } = await supabase
          .from('shoptet_connection_requests')
          .insert({ ...payload, partner_id: partner.id, status: 'draft', url_received: false })
          .select('id')
          .single();
        if (error) throw error;
        requestId = (data as { id: string }).id;
      }

      const { data: efData, error: efError } = await supabase.functions.invoke('submit-shoptet-connection', {
        body: { request_id: requestId, url },
      });

      // Clear the URL from client state immediately, regardless of outcome.
      setShoptetUrl('');

      const efResult = efData as { success?: boolean; error?: string } | null;
      if (efError || !efResult?.success) {
        toast.error('Nepodařilo se odeslat žádost ke schválení.');
        await loadShoptetRequest(partner.id);
        return;
      }

      await loadShoptetRequest(partner.id);
      toast.success('Žádost o napojení odeslána ke schválení.');
    } catch (e) {
      console.error('shoptet submit failed');
      setShoptetUrl('');
      toast.error('Nepodařilo se odeslat žádost ke schválení.');
    } finally {
      setShoptetSubmitting(false);
    }
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Povolené formáty: PNG, JPG, SVG');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Maximální velikost souboru je 5MB');
        return;
      }
      setSelectedLogoFile(file);
    }
  };

  const handleLogoUpload = async () => {
    if (!selectedLogoFile || !partner) return;

    setUploadingLogo(true);
    try {
      const fileExt = selectedLogoFile.name.split('.').pop();
      const fileName = `${partner.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('partner-logos')
        .upload(fileName, selectedLogoFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('partner-logos')
        .getPublicUrl(fileName);

      // Update partner with new logo and set logo_status to pending
      const { error: updateError } = await supabase
        .from('partners')
        .update({ 
          logo_url: urlData.publicUrl,
          logo_status: 'pending'
        })
        .eq('id', partner.id);

      if (updateError) throw updateError;

      setPartner({
        ...partner,
        logo_url: urlData.publicUrl,
        logo_status: 'pending'
      });
      setSelectedLogoFile(null);
      toast.success('Logo nahráno a čeká na schválení');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Nepodařilo se nahrát logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const getLogoStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />Schváleno</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Čeká na schválení</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Zamítnuto</Badge>;
      default:
        return <Badge variant="outline"><Image className="w-3 h-3 mr-1" />Není nahráno</Badge>;
    }
  };

  // Handle Partner reward settings save
  const handleSaveRewardSettings = async () => {
    if (!partner) return;
    
    const baseCzkValue = parseFloat(rewardBaseCzk);
    const mcValue = parseFloat(rewardMc);
    
    if (isNaN(baseCzkValue) || baseCzkValue <= 0) {
      toast.error('Částka v Kč musí být větší než 0');
      return;
    }
    if (isNaN(mcValue) || mcValue <= 0) {
      toast.error('Počet MioCoinů musí být větší než 0');
      return;
    }

    setSavingRewardSettings(true);
    
    // Optimistic update
    const previousBaseCzk = partner.reward_base_czk;
    const previousMc = partner.reward_mc;
    setPartner({ ...partner, reward_base_czk: baseCzkValue, reward_mc: mcValue });

    try {
      // .select() + ověření affected rows: bez něj by RLS-blokovaný UPDATE (0 řádků)
      // vrátil null error a zobrazil falešný success. Vyžadujeme zápis právě 1 řádku.
      const { data: updatedRows, error } = await supabase
        .from('partners')
        .update({ reward_base_czk: baseCzkValue, reward_mc: mcValue })
        .eq('id', partner.id)
        .select('id');

      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Nastavení se nepodařilo uložit — zkontrolujte, že máte oprávnění.');
      }

      toast.success('Nastavení odměn bylo uloženo');
    } catch (error) {
      console.error('Error saving reward settings:', error);
      // Rollback optimistic update
      setPartner({ ...partner, reward_base_czk: previousBaseCzk, reward_mc: previousMc });
      setRewardBaseCzk(String(previousBaseCzk));
      setRewardMc(String(previousMc));
      toast.error('Nepodařilo se uložit nastavení');
    } finally {
      setSavingRewardSettings(false);
    }
  };

  // Investment simulation state
  const [simOrders, setSimOrders] = useState<string>('10');
  const [simOrderAmount, setSimOrderAmount] = useState<string>('500');

  // Calculate live preview values based on current reward settings and simulation
  const calculateRewardPreview = () => {
    const baseCzk = parseFloat(rewardBaseCzk) || 0;
    const mcReward = parseFloat(rewardMc) || 0;
    const pricePerCoin = partner?.price_per_coin ?? 1; // 1 Kč per MC
    const vatRate = partner?.vat_rate ?? 0;
    
    // Simulation parameters
    const ordersCount = parseInt(simOrders) || 10;
    const orderAmount = parseFloat(simOrderAmount) || 500;
    
    // Sample order preview (single order)
    const sampleMc = baseCzk > 0 ? (mcReward / baseCzk) * orderAmount : 0;
    
    // Investment simulation
    const totalRevenue = ordersCount * orderAmount;
    const totalMc = sampleMc * ordersCount;
    const investmentNet = totalMc * pricePerCoin;
    const investmentVat = investmentNet * vatRate;
    const investmentGross = investmentNet + investmentVat;
    const investmentPercentage = totalRevenue > 0 ? (investmentNet / totalRevenue) * 100 : 0;
    
    return {
      sampleMc: sampleMc.toFixed(1),
      totalRevenue: totalRevenue.toFixed(0),
      totalMc: totalMc.toFixed(1),
      investmentNet: investmentNet.toFixed(2),
      investmentVat: investmentVat.toFixed(2),
      investmentGross: investmentGross.toFixed(2),
      investmentPercentage: investmentPercentage.toFixed(2),
    };
  };

  const rewardPreview = calculateRewardPreview();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!partner) {
    return null;
  }

  // Derived states for blocking actions
  const isAccountApproved = partner.status === 'approved';
  const isLogoApproved = partner.logo_status === 'approved';
  const hasActiveApiKeys = apiKeys.filter(k => !k.revoked_at).length > 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Global Account Status Banner - shown when account is NOT approved */}
        {!isAccountApproved && (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300">
                Váš účet čeká na schválení administrátorem.
              </p>
              <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">
                Po schválení účtu budete moci plně využívat partnerský portál včetně API klíčů pro integraci MioCoinů.
              </p>
            </div>
          </div>
        )}
        {/* Welcome & Account Status Section */}
        <Card className="border-[hsl(var(--neon-gold)/0.2)] bg-gradient-to-br from-[hsl(222_40%_10%)] via-[hsl(222_38%_9%)] to-[hsl(43_20%_10%)]">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 text-[hsl(var(--text-silver))]">
                  <Rocket className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                  Vítejte v partnerském portálu
                </CardTitle>
                <CardDescription className="mt-1">
                  {partner.company_name || partner.name}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Status účtu:</span>
                  {partner.status === 'approved' ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Aktivní
                    </Badge>
                  ) : partner.status === 'pending' ? (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <Clock className="w-3 h-3 mr-1" />
                      Čeká na schválení
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
                      <XCircle className="w-3 h-3 mr-1" />
                      Pozastaveno
                    </Badge>
                  )}
                </div>
              <div className="flex items-center gap-2">
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">Integrace API:</span>
                  {(() => {
                    const testEndpoints = ['partner_api_ping', 'example', 'healthcheck', 'ping', 'test'];
                    const thirtyDaysAgo = subDays(new Date(), 30);
                    const hasRecentRealActivity = apiActivity.some(activity => {
                      if (!activity.endpoint || !activity.created_at) return false;
                      const endpointLower = activity.endpoint.toLowerCase();
                      const isTestEndpoint = testEndpoints.some(test => endpointLower.includes(test));
                      if (isTestEndpoint) return false;
                      const activityDate = new Date(activity.created_at);
                      return isAfter(activityDate, thirtyDaysAgo);
                    });
                    return hasRecentRealActivity ? (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Activity className="w-3 h-3 mr-1" />
                        aktivní
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                        <Activity className="w-3 h-3 mr-1" />
                        neaktivní (zatím žádná API aktivita)
                      </Badge>
                    );
                  })()}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Messages */}
            {partner.status === 'pending' && (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Váš účet čeká na schválení administrátorem. Po schválení budete moci generovat API klíče a začít integrovat MioCoiny.
                </p>
              </div>
            )}
            {partner.status === 'suspended' && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-700 dark:text-red-400">
                  <XCircle className="w-4 h-4 inline mr-2" />
                  Váš účet byl pozastaven. Pro více informací kontaktujte podporu.
                </p>
              </div>
            )}

            {/* Primary Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <a href="#api-keys" className="block">
                <div className="p-4 rounded-lg border border-[hsl(var(--neon-gold)/0.15)] bg-[hsl(var(--muted)/0.2)] hover:border-[hsl(var(--neon-gold)/0.3)] hover:bg-[hsl(var(--muted)/0.3)] transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-[hsl(var(--neon-gold)/0.12)] rounded-lg flex items-center justify-center border border-[hsl(var(--neon-gold)/0.2)]">
                      <Key className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                    </div>
                    <span className="font-medium text-foreground">API klíče</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Zobrazit a spravovat přístupové klíče
                  </p>
                </div>
              </a>

              <button onClick={openApiDocsModal} className="block w-full text-left">
                <div className="p-4 rounded-lg border border-[hsl(var(--neon-gold)/0.15)] bg-[hsl(var(--muted)/0.2)] hover:border-[hsl(var(--neon-gold)/0.3)] hover:bg-[hsl(var(--muted)/0.3)] transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-[hsl(var(--neon-gold)/0.12)] rounded-lg flex items-center justify-center border border-[hsl(var(--neon-gold)/0.2)]">
                      <BookOpen className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                    </div>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      Dokumentace API
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Návody a reference pro integraci
                  </p>
                </div>
              </button>

              <a href="mailto:podpora@onemil.cz" className="block">
                <div className="p-4 rounded-lg border border-[hsl(var(--neon-gold)/0.15)] bg-[hsl(var(--muted)/0.2)] hover:border-[hsl(var(--neon-gold)/0.3)] hover:bg-[hsl(var(--muted)/0.3)] transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-[hsl(var(--neon-gold)/0.12)] rounded-lg flex items-center justify-center border border-[hsl(var(--neon-gold)/0.2)]">
                      <Mail className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                    </div>
                    <span className="font-medium text-foreground">Kontaktovat podporu</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Potřebujete pomoc? Napište nám
                  </p>
                </div>
              </a>
            </div>

            {/* Jak začít Checklist */}
            {(() => {
              const step1Done = partner.status === 'approved';
              const step2Done = !!(partner.logo_url && partner.logo_status !== 'none');
              const step3Done = apiKeys.filter(k => !k.revoked_at).length > 0;
              const step4Done = false; // Always pending (informational)
              const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;

              return (
                <div className="border-t border-border/50 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                      <h3 className="font-semibold text-[hsl(var(--text-silver))]">Jak začít</h3>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {completedCount}/3 dokončeno
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Step 1 */}
                    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step1Done ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                      <div className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5 ${step1Done ? 'bg-green-500 text-white' : 'bg-primary/20 text-primary'}`}>
                        {step1Done ? <CheckCircle className="w-4 h-4" /> : '1'}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${step1Done ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>Počkejte na schválení účtu</p>
                        <p className="text-xs text-muted-foreground">Administrátor zkontroluje vaši registraci</p>
                      </div>
                    </div>
                    {/* Step 2 */}
                    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step2Done ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                      <div className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5 ${step2Done ? 'bg-green-500 text-white' : 'bg-primary/20 text-primary'}`}>
                        {step2Done ? <CheckCircle className="w-4 h-4" /> : '2'}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${step2Done ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>Nahrajte logo partnera</p>
                        <p className="text-xs text-muted-foreground">Logo se zobrazí zákazníkům při aktivaci</p>
                      </div>
                    </div>
                    {/* Step 3 */}
                    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step3Done ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                      <div className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5 ${step3Done ? 'bg-green-500 text-white' : 'bg-primary/20 text-primary'}`}>
                        {step3Done ? <CheckCircle className="w-4 h-4" /> : '3'}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${step3Done ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>Získejte API klíč</p>
                        <p className="text-xs text-muted-foreground">Kontaktujte administrátora pro vygenerování</p>
                      </div>
                    </div>
                    {/* Step 4 - Always pending */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                        4
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Integrujte do e-shopu</p>
                        <p className="text-xs text-muted-foreground">Použijte API pro vydávání MioCoinů</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="luxury-card p-5 hover:border-[hsl(var(--neon-gold)/0.3)] transition-all">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))]">Vydané kódy</span>
              <FileText className="w-4 h-4 text-[hsl(var(--text-muted-gray))]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[hsl(var(--text-silver))]">{stats.totalIssued}</div>
              <p className="text-xs text-[hsl(var(--text-muted-gray))]">{stats.totalIssuedCoins.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MioCoinů</p>
            </div>
          </div>

          <div className="luxury-card p-5 hover:border-[hsl(var(--neon-gold)/0.3)] transition-all">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))]">Aktivované kódy</span>
              <Coins className="w-4 h-4 text-[hsl(var(--neon-gold))]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[hsl(var(--neon-gold))]">{stats.totalActivated}</div>
              <p className="text-xs text-[hsl(var(--text-muted-gray))]">{stats.totalActivatedCoins.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MioCoinů</p>
            </div>
          </div>

          <div className="luxury-card p-5 hover:border-[hsl(var(--neon-gold)/0.3)] transition-all">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))]">Konverzní poměr</span>
              <TrendingUp className="w-4 h-4 text-[hsl(var(--neon-green))]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[hsl(var(--neon-green))]">
                {stats.totalIssued > 0 ? Math.round((stats.totalActivated / stats.totalIssued) * 100) : 0}%
              </div>
              <p className="text-xs text-[hsl(var(--text-muted-gray))]">aktivovaných kódů</p>
            </div>
          </div>

          <div className="luxury-card p-5 hover:border-[hsl(var(--neon-gold)/0.3)] transition-all">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))]">Status</span>
              <Building2 className="w-4 h-4 text-[hsl(var(--text-muted-gray))]" />
            </div>
            <div>
              <Badge variant={partner.status === 'approved' ? 'default' : 'secondary'} className="text-sm">
                {partner.status === 'approved' ? 'Aktivní' : partner.status === 'pending' ? 'Čeká na schválení' : 'Pozastaveno'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Logo Management Section */}
        <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
              <Image className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              Logo partnera
            </CardTitle>
            <CardDescription>
              Nahrajte logo pro zobrazení na webu. Logo musí být schváleno administrátorem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-6">
              {/* Current logo preview */}
              <div className="flex-shrink-0">
                <div className="w-32 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden border border-border">
                  {partner.logo_url && partner.logo_status !== 'none' ? (
                    <img
                      src={partner.logo_url}
                      alt={partner.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <Image className="w-8 h-8 text-muted-foreground/50" />
                  )}
                </div>
              </div>
              
              {/* Status and upload */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  {getLogoStatusBadge(partner.logo_status)}
                </div>
                
                {partner.logo_status === 'rejected' && (
                  <p className="text-sm text-red-600">
                    Vaše logo bylo zamítnuto. Nahrajte prosím nové logo.
                  </p>
                )}
                
                {partner.logo_status === 'pending' && (
                  <p className="text-sm text-amber-600">
                    Vaše logo čeká na schválení administrátorem.
                  </p>
                )}
                
                {partner.logo_status === 'approved' && (
                  <p className="text-sm text-green-600">
                    Vaše logo je schváleno a zobrazuje se na webu.
                  </p>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="logo-upload" className="text-sm font-medium">
                    {partner.logo_status === 'none' || partner.logo_status === 'rejected' 
                      ? 'Nahrát logo' 
                      : 'Nahrát nové logo'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="logo-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      onChange={handleLogoFileSelect}
                      className="max-w-xs"
                    />
                    {selectedLogoFile && (
                      <Button 
                        onClick={handleLogoUpload} 
                        disabled={uploadingLogo}
                        size="sm"
                      >
                        {uploadingLogo ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Upload className="w-4 h-4 mr-1" />
                        )}
                        Nahrát
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, SVG (max 5MB). Doporučené rozměry: 320×180px (16:9)
                  </p>
                  {selectedLogoFile && (
                    <p className="text-sm text-primary">
                      Vybrán soubor: {selectedLogoFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Billing Details Section */}
        <PartnerBillingForm
          partnerId={partner.id}
          initialData={{
            company_name: partner.company_name ?? '',
            ico: partner.ico ?? '',
            dic: partner.dic ?? '',
            billing_street: partner.billing_street ?? '',
            billing_city: partner.billing_city ?? '',
            billing_zip: partner.billing_zip ?? '',
            billing_country: partner.billing_country ?? '',
            contact_email: partner.contact_email ?? '',
          }}
          onSaved={loadPartnerData}
        />

        {/* Partner Reward Settings */}
        {isAccountApproved && (
          <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
                <Settings className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                Nastavení konverze MioCoinů
              </CardTitle>
              <CardDescription>
                Nastavte kolik MioCoinů zákazník získá za hodnotu objednávky
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Compact single row: editable + read-only fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="reward-base-czk" className="text-xs">Základ (Kč)</Label>
                  <Input
                    id="reward-base-czk"
                    type="number"
                    min="1"
                    step="1"
                    value={rewardBaseCzk}
                    onChange={(e) => setRewardBaseCzk(e.target.value)}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setRewardBaseCzk(Math.round(val).toString());
                      }
                    }}
                    placeholder="0"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reward-mc" className="text-xs">MioCoiny</Label>
                  <Input
                    id="reward-mc"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={rewardMc}
                    onChange={(e) => setRewardMc(e.target.value)}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setRewardMc((Math.round(val * 10) / 10).toFixed(1));
                      }
                    }}
                    placeholder="0.0"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cena/MC</Label>
                  <div className="h-9 px-3 flex items-center rounded-md bg-muted/30 border border-border/50 text-sm">
                    {partner?.price_per_coin?.toFixed(2) ?? '1.00'} Kč
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">DPH</Label>
                  <div className="h-9 px-3 flex items-center rounded-md bg-muted/30 border border-border/50 text-sm">
                    {((partner?.vat_rate ?? 0) * 100).toFixed(0)} %
                  </div>
                </div>
              </div>

              {/* Conversion example helper — read-only info, no logic change */}
              <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border/50 p-3">
                <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Příklad: při nastavení 100 Kč = 1 MioCoin dostane zákazník za objednávku 500 Kč celkem 5 MioCoinů.
                </p>
              </div>

              {/* Save button inline */}
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveRewardSettings}
                  disabled={
                    savingRewardSettings || 
                    (rewardBaseCzk === String(partner?.reward_base_czk ?? 0) && 
                     rewardMc === String(partner?.reward_mc ?? 0))
                  }
                  size="sm"
                  className="gap-2"
                >
                  {savingRewardSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Uložit
                </Button>
              </div>

              {/* Marketingová investice (simulace) - Compact KPI section */}
              <div className="border-t border-border/50 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Coins className="w-4 h-4 text-[hsl(var(--neon-gold))]" />
                    Marketingová investice (simulace)
                  </h4>
                  <div className="flex items-center gap-2">
                    <Input
                      id="simOrders"
                      type="number"
                      min="1"
                      step="1"
                      value={simOrders}
                      onChange={(e) => setSimOrders(e.target.value)}
                      className="h-7 w-16 text-xs"
                      title="Počet objednávek"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      id="simOrderAmount"
                      type="number"
                      min="1"
                      step="1"
                      value={simOrderAmount}
                      onChange={(e) => setSimOrderAmount(e.target.value)}
                      className="h-7 w-20 text-xs"
                      title="Průměrná objednávka (Kč)"
                    />
                    <span className="text-xs text-muted-foreground">Kč</span>
                  </div>
                </div>

                {/* Primary KPI - Investment percentage */}
                <div className="p-4 rounded-lg bg-[hsl(var(--neon-gold)/0.08)] border border-[hsl(var(--neon-gold)/0.2)] text-center mb-3">
                  <p className="text-xs text-[hsl(var(--text-muted-gray))] mb-1">Investice z obratu</p>
                  <p className="text-3xl font-bold text-[hsl(var(--neon-gold))]">{rewardPreview.investmentPercentage} %</p>
                </div>

                {/* Single-line breakdown */}
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                  <div className="text-center flex-1">
                    <span className="text-muted-foreground">Obrat</span>
                    <p className="font-medium">{rewardPreview.totalRevenue} Kč</p>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div className="text-center flex-1">
                    <span className="text-muted-foreground">MC</span>
                    <p className="font-medium">{rewardPreview.totalMc}</p>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div className="text-center flex-1">
                    <span className="text-muted-foreground">Náklad</span>
                    <p className="font-medium">{rewardPreview.investmentNet} Kč</p>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div className="text-center flex-1">
                    <span className="text-muted-foreground">DPH</span>
                    <p className="text-muted-foreground">{rewardPreview.investmentVat} Kč</p>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div className="text-center flex-1">
                    <span className="text-muted-foreground">Celkem</span>
                    <p className="font-medium">{rewardPreview.investmentGross} Kč</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shoptet self-service connection — approved partners only. URL never displayed. */}
        {isAccountApproved && (
          <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
                <Rocket className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                Napojení e-shopu / Shoptet
              </CardTitle>
              <CardDescription>
                Propojte svůj e-shop s OneMil — vyberte způsob, který vám nejvíc vyhovuje.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* 3 connection paths explainer */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[hsl(var(--neon-gold)/0.25)] bg-[hsl(var(--neon-gold)/0.06)] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Rocket className="w-4 h-4 text-[hsl(var(--neon-gold))]" />
                    <span className="text-sm font-medium">Shoptet automat</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Doporučeno</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Shoptet e-shop? Zadejte URL exportu objednávek níže — my pravidelně stáhneme data a automaticky vytvoříme MioCoin kódy.
                  </p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">OneMil Partner API</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Větší e-shop s vývojáři? Posílejte objednávky přímo přes API — bez prodlevy a exportního souboru. Napište nám na <span className="font-medium">eshop@onemil.cz</span>.
                  </p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Individuální doručení</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Vlastní způsob doručení kódů zákazníkům? Možné po domluvě s OneMil.
                  </p>
                </div>
              </div>

              {/* Current request status */}
              {shoptetReq && (
                <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Stav napojení:</span>
                    {shoptetReq.status === 'draft' && (
                      <Badge variant="outline" className="gap-1"><FileText className="w-3 h-3" /> Koncept</Badge>
                    )}
                    {shoptetReq.status === 'submitted' && (
                      <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Odesláno ke schválení</Badge>
                    )}
                    {(shoptetReq.status === 'approved' || shoptetReq.status === 'active') && (
                      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white"><CheckCircle className="w-3 h-3" /> Aktivní</Badge>
                    )}
                    {shoptetReq.status === 'rejected' && (
                      <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Zamítnuto</Badge>
                    )}
                  </div>
                  {shoptetReq.status === 'rejected' && shoptetReq.rejection_reason && (
                    <p className="text-xs text-destructive">Důvod: {shoptetReq.rejection_reason}</p>
                  )}
                  {shoptetReq.url_received && shoptetReq.status !== 'rejected' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> URL exportu jsme bezpečně přijali.
                    </p>
                  )}
                </div>
              )}

              {/* Shoptet automat form */}
              {(() => {
                const locked = !!shoptetReq && (shoptetReq.status === 'submitted' || shoptetReq.status === 'approved' || shoptetReq.status === 'active');
                return (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-[hsl(var(--neon-gold))]" />
                      Shoptet automat — nastavení
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="shoptet-shop-name" className="text-xs">Název e-shopu</Label>
                        <Input
                          id="shoptet-shop-name"
                          value={shoptetShopName}
                          onChange={(e) => setShoptetShopName(e.target.value)}
                          placeholder="Můj e-shop"
                          maxLength={200}
                          disabled={locked}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="shoptet-trigger" className="text-xs">Kdy vydat odměnu</Label>
                        <Select
                          value={shoptetTrigger}
                          onValueChange={(v) => setShoptetTrigger(v as 'paid' | 'shipped' | 'completed')}
                          disabled={locked}
                        >
                          <SelectTrigger id="shoptet-trigger" className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paid">Po zaplacení objednávky</SelectItem>
                            <SelectItem value="shipped">Po odeslání objednávky</SelectItem>
                            <SelectItem value="completed">Po dokončení objednávky</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="shoptet-reward-czk" className="text-xs">Základ (Kč)</Label>
                        <Input
                          id="shoptet-reward-czk"
                          type="number"
                          min="1"
                          step="1"
                          value={shoptetRewardCzk}
                          onChange={(e) => setShoptetRewardCzk(e.target.value)}
                          placeholder="100"
                          disabled={locked}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="shoptet-reward-mc" className="text-xs">MioCoiny</Label>
                        <Input
                          id="shoptet-reward-mc"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={shoptetRewardMc}
                          onChange={(e) => setShoptetRewardMc(e.target.value)}
                          placeholder="1"
                          disabled={locked}
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="shoptet-note" className="text-xs">Poznámka (volitelné)</Label>
                      <Textarea
                        id="shoptet-note"
                        value={shoptetNote}
                        onChange={(e) => setShoptetNote(e.target.value)}
                        placeholder="Cokoliv, co bychom měli vědět k napojení."
                        maxLength={500}
                        disabled={locked}
                        className="min-h-[60px] text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="shoptet-url" className="text-xs flex items-center gap-1">
                        <Key className="w-3 h-3" /> URL Shoptet exportu objednávek
                      </Label>
                      <Input
                        id="shoptet-url"
                        type="password"
                        autoComplete="off"
                        value={shoptetUrl}
                        onChange={(e) => setShoptetUrl(e.target.value)}
                        placeholder="https://…"
                        disabled={locked}
                        className="h-9"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        URL ukládáme bezpečně a nikdy ji nezobrazujeme zpět. Koncept můžete uložit i bez URL; pro odeslání ke schválení je URL nutná.
                      </p>
                    </div>

                    {!locked && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={handleShoptetSaveDraft}
                          disabled={shoptetSavingDraft || shoptetSubmitting}
                        >
                          {shoptetSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Uložit koncept
                        </Button>
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={handleShoptetSubmit}
                          disabled={shoptetSubmitting || shoptetSavingDraft}
                        >
                          {shoptetSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Odeslat ke schválení
                        </Button>
                      </div>
                    )}

                    {locked && shoptetReq?.status === 'submitted' && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Žádost čeká na schválení OneMil. Po schválení se napojení aktivuje automaticky.
                      </p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* MioCoin Invoicing Explainer — read-only info, no billing logic */}
        {isAccountApproved && (
          <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
                <Receipt className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                Fakturace MioCoinů
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 rounded-lg bg-muted/30 border border-border/50 p-4">
                <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Fakturujeme pouze aktivované MioCoiny. Vyúčtování probíhá automaticky
                  jednou týdně. Fakturu vám pošleme e-mailem a najdete ji také v sekci{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/partner/invoices')}
                    className="text-[hsl(var(--neon-gold))] hover:underline font-medium"
                  >
                    Moje faktury
                  </button>
                  . Aktuální cena: {partner?.price_per_coin?.toFixed(2) ?? '1.00'} Kč za 1 MioCoin.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Offer Billing Section */}
        {offerBillingConfig && (
          <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
                <Receipt className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                Fakturace nabídek
              </CardTitle>
              <CardDescription>
                Přehled aktivací a faktur za vaše nabídky
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {offerBillingLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-gold))]" />
                </div>
              ) : (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-center">
                      <p className="text-sm text-muted-foreground">Celkem aktivací</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{offerActivationCount}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-center">
                      <p className="text-sm text-muted-foreground">Způsob fakturace</p>
                      <p className="text-sm font-medium text-foreground mt-1">
                        {offerBillingConfig.billing_mode === 'paid_distribution' ? 'Placená distribuce' : offerBillingConfig.billing_mode}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-center">
                      <p className="text-sm text-muted-foreground">Cena za aktivaci</p>
                      <p className="text-2xl font-bold text-foreground mt-1">
                        {offerBillingConfig.price_per_activation} <span className="text-sm font-normal">Kč</span>
                      </p>
                    </div>
                  </div>

                  {/* Per-offer stats */}
                  {offerPerfStats.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">Výkon nabídek</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nabídka</TableHead>
                            <TableHead className="text-center">Aktivace</TableHead>
                            <TableHead className="text-center">Kliky</TableHead>
                            <TableHead className="text-center">Konverze</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {offerPerfStats.map((s) => {
                            const conv = s.clicks > 0 ? ((s.activations / s.clicks) * 100).toFixed(1) + ' %' : '—';
                            return (
                              <TableRow key={s.offer_id}>
                                <TableCell className="text-sm font-medium max-w-[200px] truncate">{s.title}</TableCell>
                                <TableCell className="text-center tabular-nums">{s.activations}</TableCell>
                                <TableCell className="text-center tabular-nums">{s.clicks}</TableCell>
                                <TableCell className="text-center tabular-nums text-blue-400">{conv}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Invoice list */}
                  {offerInvoices.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">Faktury</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Číslo faktury</TableHead>
                            <TableHead>Období</TableHead>
                            <TableHead>Částka</TableHead>
                            <TableHead>Stav</TableHead>
                            <TableHead className="text-right">PDF</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {offerInvoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-sm">
                                {inv.invoice_number ?? '—'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(inv.period_start), 'dd.MM.yyyy', { locale: cs })} – {format(new Date(inv.period_end), 'dd.MM.yyyy', { locale: cs })}
                              </TableCell>
                              <TableCell className="text-sm">
                                {(inv.amount_inc_vat ?? inv.amount_gross ?? 0).toLocaleString('cs-CZ')} Kč
                              </TableCell>
                              <TableCell>
                                {inv.status === 'draft' && <Badge variant="outline">Koncept</Badge>}
                                {inv.status === 'sent' && <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Odesláno</Badge>}
                                {inv.status === 'paid' && <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Zaplaceno</Badge>}
                                {inv.status === 'void' && <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">Storno</Badge>}
                                {!['draft','sent','paid','void'].includes(inv.status) && <Badge variant="outline">{inv.status}</Badge>}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => downloadOfferInvoicePdf(inv.id)}
                                  disabled={generatingPdf === inv.id}
                                >
                                  {generatingPdf === inv.id
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Download className="w-4 h-4" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-center text-sm text-muted-foreground">
                      Zatím nebyly vystaveny žádné faktury za nabídky.
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* API Keys Section */}
        <Card id="api-keys" className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
              <Key className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              API klíče
            </CardTitle>
            <CardDescription>
              Přehled vašich API klíčů pro integraci
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isAccountApproved ? (
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">API klíče nejsou dostupné</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Váš účet čeká na schválení administrátorem. Po schválení budete moci využívat API klíče.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* API key exists - show secure message */}
                <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">API klíč je aktivní, ale z bezpečnostních důvodů se nezobrazuje.</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Pro získání nového klíče použijte „Regenerovat API klíč".
                      </p>
                    </div>
                  </div>
                </div>

                {/* Show key prefixes for reference */}
                {hasActiveApiKeys && (
                  <div className="space-y-3">
                    {apiKeys.filter(k => !k.revoked_at).map((key) => (
                      <div
                        key={key.id}
                        className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2"
                      >
                        <div className="flex items-center gap-3">
                          <Key className="w-4 h-4 text-muted-foreground" />
                          <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                            {key.key_prefix}••••••••••••••••
                          </code>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pl-7">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Vytvořeno: {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Always show regenerate button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-4 border-t border-border/30">
                  <Button
                    onClick={openRotatePasswordModal}
                    disabled={rotatingKey}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerovat API klíč
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openActivateModal}
                      className="gap-2"
                    >
                      <Gift className="w-4 h-4" />
                      Aktivovat odměnu
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* API Activity Section */}
        {isAccountApproved && (
          <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
                <Activity className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
                Stav napojení API
              </CardTitle>
              <CardDescription>
                Přehled komunikace vašeho e-shopu s OneMilem
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Note: partner_api_activity records only endpoint + created_at
                // (no per-call status). „Technical/test" pings are excluded from
                // the partner-facing summary so the card reflects real traffic.
                const testEndpoints = ['partner_api_ping', 'partner_api_example_endpoint', 'example', 'healthcheck', 'ping', 'test'];
                const isTechnical = (endpoint: string | null) => {
                  if (!endpoint) return false;
                  const e = endpoint.toLowerCase();
                  return testEndpoints.some(t => e.includes(t));
                };
                const now = new Date();
                const dayAgo = subDays(now, 1);
                const realActivity = apiActivity.filter(a => a.created_at && !isTechnical(a.endpoint));
                const last24hReal = realActivity.filter(a => a.created_at && isAfter(new Date(a.created_at!), dayAgo));
                const lastComm = apiActivity
                  .map(a => a.created_at)
                  .filter((d): d is string => !!d)
                  .sort()
                  .pop();
                const connected = realActivity.length > 0;

                return (
                  <div className="space-y-4">
                    {/* Connection state */}
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                      <span className="text-sm text-muted-foreground">Stav napojení</span>
                      {connected ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Napojeno a aktivní
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                          <Clock className="w-3 h-3 mr-1" />
                          Zatím nenapojeno
                        </Badge>
                      )}
                    </div>

                    {/* Summary metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Poslední komunikace</p>
                        <p className="text-sm font-medium text-foreground">
                          {lastComm
                            ? format(new Date(lastComm), 'dd.MM.yyyy HH:mm', { locale: cs })
                            : 'Zatím žádná'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Úspěšná volání za 24 h</p>
                        <p className="text-2xl font-bold text-green-600">{last24hReal.length}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Chybná volání za 24 h</p>
                        <p className="text-2xl font-bold text-foreground">0</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Chyby se zatím samostatně neevidují.</p>
                      </div>
                    </div>

                    {!connected && (
                      <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border p-3">
                        <Info className="w-4 h-4 text-[hsl(var(--neon-gold))] mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          Jakmile váš e-shop pošle první objednávku přes OneMil API, uvidíte zde
                          stav napojení a počet úspěšných volání.
                        </p>
                      </div>
                    )}

                    {/* Collapsed developer details */}
                    {apiActivity.length > 0 && (
                      <div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowApiTechnicalDetails(v => !v)}
                          className="text-muted-foreground"
                        >
                          {showApiTechnicalDetails ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                          Technické detaily pro vývojáře
                        </Button>
                        {showApiTechnicalDetails && (
                          <div className="mt-3">
                            <p className="text-xs text-muted-foreground mb-2">
                              Posledních 50 volání API (pouze pro čtení), včetně testovacích endpointů.
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Endpoint</TableHead>
                                  <TableHead className="text-right">Datum a čas</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {apiActivity.map((activity, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="font-mono text-sm">
                                      {activity.endpoint || '—'}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                      {activity.created_at
                                        ? format(new Date(activity.created_at), 'dd.MM.yyyy HH:mm:ss', { locale: cs })
                                        : '—'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Weekly Reports */}
        <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[hsl(var(--text-silver))]">
              <Calendar className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              Týdenní přehled
            </CardTitle>
            <CardDescription>Aktivita za posledních 4 týdny</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Období</TableHead>
                  <TableHead className="text-right">Vydané kódy</TableHead>
                  <TableHead className="text-right">Vydané MioCoiny</TableHead>
                  <TableHead className="text-right">Aktivované kódy</TableHead>
                  <TableHead className="text-right">Aktivované MioCoiny</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyReports.map((report, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {report.week_start} – {report.week_end}
                    </TableCell>
                    <TableCell className="text-right">{report.issued_count}</TableCell>
                    <TableCell className="text-right">{report.issued_coins.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</TableCell>
                    <TableCell className="text-right text-[hsl(var(--neon-gold))]">{report.activated_count}</TableCell>
                    <TableCell className="text-right text-[hsl(var(--neon-gold))]">{report.activated_coins.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</TableCell>
                  </TableRow>
                ))}
                {weeklyReports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Zatím nemáte žádná data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Partner Offers ─────────────────────────────────────────────────── */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="w-5 h-5 text-blue-400" />
                Nabídky partnerů
              </CardTitle>
              <CardDescription>
                Spravujte své nabídky přidělované uživatelům po nákupu tiketu
              </CardDescription>
            </div>
            <Button
              onClick={openCreateOffer}
              size="sm"
              className="shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nová nabídka
            </Button>
          </CardHeader>
          <CardContent>
            {offersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : partnerOffers.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Tag className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Zatím nemáte žádné nabídky.</p>
                <p className="text-xs mt-1 opacity-70">Vytvořte první nabídku tlačítkem výše.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Název</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Distribuce</TableHead>
                    <TableHead>Platnost do</TableHead>
                    <TableHead>Přiděleno</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerOffers.map((offer) => (
                    <TableRow key={offer.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{offer.title}</p>
                          {offer.short_text && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{offer.short_text}</p>
                          )}
                          {offer.status === 'rejected' && offer.rejection_reason && (
                            <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]">
                              Důvod: {offer.rejection_reason}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getOfferStatusBadge(offer.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getDeploymentModeLabel(offer.deployment_mode)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {offer.valid_to
                          ? new Date(offer.valid_to).toLocaleDateString('cs-CZ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {offer.last_assigned_at
                          ? new Date(offer.last_assigned_at).toLocaleDateString('cs-CZ')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit: only draft or rejected */}
                          {(offer.status === 'draft' || offer.status === 'rejected') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditOffer(offer)}
                            >
                              Upravit
                            </Button>
                          )}
                          {/* Submit: only draft */}
                          {offer.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={() => handleSubmitOffer(offer.id)}
                              disabled={submittingOffer === offer.id}
                            >
                              {submittingOffer === offer.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Send className="w-3 h-3 mr-1" />
                              )}
                              Odeslat
                            </Button>
                          )}
                          {/* Revise: only rejected */}
                          {offer.status === 'rejected' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReviseOffer(offer.id)}
                              disabled={revisingOffer === offer.id}
                            >
                              {revisingOffer === offer.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <RotateCcw className="w-3 h-3 mr-1" />
                              )}
                              Vrátit k úpravám
                            </Button>
                          )}
                          {/* Approved: no edit allowed */}
                          {offer.status === 'approved' && (
                            <span className="text-xs text-muted-foreground italic">Schváleno – nelze měnit</span>
                          )}
                          {/* Submitted: waiting */}
                          {offer.status === 'submitted' && (
                            <span className="text-xs text-muted-foreground italic">Čeká na schválení</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* ── Create / Edit Offer Dialog ─────────────────────────────────────── */}
      <Dialog open={offerFormOpen} onOpenChange={(open) => !open && setOfferFormOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-400" />
              {editingOffer ? 'Upravit nabídku' : 'Nová nabídka'}
            </DialogTitle>
            <DialogDescription>
              {editingOffer
                ? 'Upravte detaily nabídky a uložte jako koncept.'
                : 'Vyplňte detaily nové nabídky. Po uložení ji můžete odeslat ke schválení.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="offer-title">Název nabídky *</Label>
              <Input
                id="offer-title"
                value={offerTitle}
                onChange={(e) => setOfferTitle(e.target.value)}
                placeholder="Např. 10% sleva na první nákup"
                maxLength={120}
              />
            </div>
            {/* Short text */}
            <div className="space-y-1.5">
              <Label htmlFor="offer-short-text">Krátký popis *</Label>
              <Textarea
                id="offer-short-text"
                value={offerShortText}
                onChange={(e) => setOfferShortText(e.target.value)}
                placeholder="Stručný popis nabídky zobrazený uživateli"
                rows={3}
                maxLength={300}
              />
            </div>
            {/* Deployment mode */}
            <div className="space-y-1.5">
              <Label>Distribuce</Label>
              <Select value={offerDeploymentMode} onValueChange={setOfferDeploymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_contests">Všechny soutěže</SelectItem>
                  <SelectItem value="selected_contests">Vybrané soutěže</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Valid from / to */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="offer-valid-from">Platnost od</Label>
                <Input
                  id="offer-valid-from"
                  type="date"
                  value={offerValidFrom}
                  onChange={(e) => setOfferValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-valid-to">Platnost do</Label>
                <Input
                  id="offer-valid-to"
                  type="date"
                  value={offerValidTo}
                  onChange={(e) => setOfferValidTo(e.target.value)}
                />
              </div>
            </div>
            {/* Link or code */}
            <div className="space-y-1.5">
              <Label htmlFor="offer-link-or-code">Kód / odkaz nabídky</Label>
              <Input
                id="offer-link-or-code"
                value={offerLinkOrCode}
                onChange={(e) => setOfferLinkOrCode(e.target.value)}
                placeholder="Např. SLEVA10 nebo https://vas-eshop.cz/akce"
              />
            </div>

            {/* Billing */}
            {(() => {
              const billingLocked =
                editingOffer?.status === 'approved' ||
                editingOffer?.billing_admin_override === true;
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="offer-billing-mode">
                      Typ spolupráce
                      {billingLocked && (
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">(uzamčeno)</span>
                      )}
                    </Label>
                    <Select
                      value={offerBillingMode}
                      onValueChange={setOfferBillingMode}
                      disabled={billingLocked}
                    >
                      <SelectTrigger id="offer-billing-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid_distribution">Placená distribuce</SelectItem>
                        <SelectItem value="affiliate_direct">Affiliate přímý</SelectItem>
                        <SelectItem value="affiliate_external">Affiliate externí</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="offer-price">
                      Cena za aktivaci (Kč)
                      {billingLocked && (
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">(uzamčeno)</span>
                      )}
                    </Label>
                    <Input
                      id="offer-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={offerPricePerActivation}
                      onChange={(e) => setOfferPricePerActivation(e.target.value)}
                      disabled={billingLocked}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Images */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Logo */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Logo nabídky
                  <span className="text-muted-foreground font-normal ml-1">(512×512 px, max 2 MB)</span>
                </Label>
                {offerLogoUrl && (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/50 bg-muted/30">
                    <img
                      src={offerLogoUrl}
                      alt="Logo náhled"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setOfferLogoUrl(null)}
                      className="absolute top-0.5 right-0.5 bg-destructive/80 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none hover:bg-destructive"
                      title="Odebrat logo"
                    >×</button>
                  </div>
                )}
                <Label
                  htmlFor="offer-logo-upload"
                  className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {uploadingOfferLogo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {offerLogoUrl ? 'Změnit logo' : 'Nahrát logo'}
                </Label>
                <input
                  id="offer-logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={uploadingOfferLogo}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleOfferImageUpload(f, 'logo');
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Banner */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Banner nabídky
                  <span className="text-muted-foreground font-normal ml-1">(1600×900 px, max 5 MB)</span>
                </Label>
                {offerBannerUrl && (
                  <div className="relative w-full h-16 rounded-lg overflow-hidden border border-border/50 bg-muted/30">
                    <img
                      src={offerBannerUrl}
                      alt="Banner náhled"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setOfferBannerUrl(null)}
                      className="absolute top-0.5 right-0.5 bg-destructive/80 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none hover:bg-destructive"
                      title="Odebrat banner"
                    >×</button>
                  </div>
                )}
                <Label
                  htmlFor="offer-banner-upload"
                  className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {uploadingOfferBanner ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {offerBannerUrl ? 'Změnit banner' : 'Nahrát banner'}
                </Label>
                <input
                  id="offer-banner-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={uploadingOfferBanner}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleOfferImageUpload(f, 'banner');
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOfferFormOpen(false)}
              disabled={savingOffer}
            >
              Zrušit
            </Button>
            <Button onClick={handleSaveOfferDraft} disabled={savingOffer}>
              {savingOffer ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Ukládám…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Uložit jako koncept
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Reward Modal - Admin only */}
      {isAdmin && (
        <Dialog open={activateModalOpen} onOpenChange={setActivateModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Aktivovat odměnu
              </DialogTitle>
              <DialogDescription>
                Zadejte kód odměny a váš API klíč pro aktivaci.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reward-code">Kód odměny</Label>
                <Input
                  id="reward-code"
                  placeholder="např. ABC123XYZ"
                  value={rewardCodeInput}
                  onChange={(e) => setRewardCodeInput(e.target.value)}
                  disabled={activatingReward}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API klíč</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Váš API klíč"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  disabled={activatingReward}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setActivateModalOpen(false)}
                disabled={activatingReward}
              >
                Zrušit
              </Button>
              <Button
                onClick={handleActivateRewardSubmit}
                disabled={activatingReward || !rewardCodeInput.trim() || !apiKeyInput.trim()}
              >
                {activatingReward ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Aktivuji...
                  </>
                ) : (
                  'Aktivovat'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Password Confirmation Modal for API Key Rotation */}
      <Dialog open={rotatePasswordModalOpen} onOpenChange={setRotatePasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Potvrzení rotace API klíče
            </DialogTitle>
            <DialogDescription>
              Pro regenerování API klíče zadejte své heslo. Stávající klíč bude zneplatněn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rotate-password">Heslo</Label>
              <div className="relative">
                <Input
                  id="rotate-password"
                  type={rotatePasswordVisible ? 'text' : 'password'}
                  value={rotatePassword}
                  onChange={(e) => setRotatePassword(e.target.value)}
                  placeholder="Zadejte své heslo"
                  className="pr-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rotatePassword.trim()) {
                      handleRotateApiKey();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setRotatePasswordVisible(!rotatePasswordVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {rotatePasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRotatePasswordModalOpen(false)}
              disabled={rotatingKey}
            >
              Zrušit
            </Button>
            <Button
              onClick={handleRotateApiKey}
              disabled={rotatingKey || !rotatePassword.trim()}
            >
              {rotatingKey ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Regeneruji...
                </>
              ) : (
                'Regenerovat'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal with New API Key */}
      <Dialog open={rotateSuccessModalOpen} onOpenChange={(open) => !open && closeRotateSuccessModal()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              API klíč byl úspěšně vygenerován
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground mb-2 block">Váš nový API klíč</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-background px-3 py-2 rounded border break-all">
                  {newApiKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyApiKeyToClipboard}
                  title="Kopírovat do schránky"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Tento API klíč se zobrazí pouze jednou.</strong> Uložte si ho na bezpečné místo.
                </span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeRotateSuccessModal}>
              Rozumím, zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Documentation Modal */}
      <Dialog open={apiDocsModalOpen} onOpenChange={setApiDocsModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] bg-gradient-to-b from-card/95 to-card/80 backdrop-blur-sm border-border/40">
          <DialogHeader className="pb-4 border-b border-border/30">
            <DialogTitle className="flex items-center gap-2 text-xl font-heading bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent">
              <BookOpen className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
              Dokumentace API
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Návody a reference pro integraci MioCoinů do vašeho e-shopu
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {apiDocsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--heading-gold))]" />
              </div>
            ) : (
              <div className="
                prose prose-base dark:prose-invert max-w-none py-6
                
                /* Unified heading hierarchy - Subtle muted gold, semibold, consistent sizing */
                prose-headings:font-heading prose-headings:font-semibold prose-headings:tracking-tight
                
                /* H1 - Document title only (rarely used) */
                prose-h1:text-lg prose-h1:md:text-xl prose-h1:mt-8 prose-h1:first:mt-0 prose-h1:mb-4
                prose-h1:text-[hsl(var(--heading-gold-soft))] prose-h1:border-b prose-h1:border-border/25 prose-h1:pb-3
                
                /* H2 - Main sections (## 1. K čemu slouží...) - All same size, muted gold */
                prose-h2:text-base prose-h2:md:text-[1.0625rem] prose-h2:mt-8 prose-h2:first:mt-0 prose-h2:mb-3
                prose-h2:text-[hsl(var(--heading-gold-soft))] prose-h2:border-b prose-h2:border-border/20 prose-h2:pb-2.5
                
                /* H3 - Subsections (### Endpoint, ### Body...) - Even more subtle */
                prose-h3:text-[0.9375rem] prose-h3:md:text-base prose-h3:mt-6 prose-h3:mb-2.5
                prose-h3:text-[hsl(var(--heading-gold-muted))]
                
                /* H4 - Minor subsections */
                prose-h4:text-[0.875rem] prose-h4:mt-4 prose-h4:mb-2
                prose-h4:text-[hsl(var(--heading-gold-muted))]
                
                /* Body text - Readable paragraphs with consistent spacing */
                prose-p:text-muted-foreground prose-p:leading-[1.75] prose-p:mb-3.5 prose-p:text-[0.9rem]
                
                /* Bullet Lists - Subtle muted gold markers */
                prose-ul:my-3 prose-ul:mb-4 prose-ul:space-y-2 prose-ul:pl-5
                [&_ul>li]:text-muted-foreground [&_ul>li]:leading-[1.65] [&_ul>li]:text-[0.9rem]
                [&_ul>li]:pl-1 [&_ul>li::marker]:text-[hsl(var(--heading-gold-muted))]
                
                /* Numbered Lists - Consistent with bullet lists */
                prose-ol:my-3 prose-ol:mb-4 prose-ol:space-y-2 prose-ol:pl-5 prose-ol:list-decimal
                [&_ol>li]:text-muted-foreground [&_ol>li]:leading-[1.65] [&_ol>li]:text-[0.9rem]
                [&_ol>li]:pl-1 [&_ol>li::marker]:text-[hsl(var(--heading-gold-muted))] [&_ol>li::marker]:font-medium
                
                /* Nested lists - Tighter spacing */
                [&_ul_ul]:mt-1.5 [&_ul_ul]:mb-0.5 [&_ol_ol]:mt-1.5 [&_ol_ol]:mb-0.5
                [&_ul_ol]:mt-1.5 [&_ol_ul]:mt-1.5
                
                /* Code blocks - Clean technical style with subtle gold */
                prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.8125rem] 
                prose-code:text-[hsl(var(--heading-gold-soft))] prose-code:font-mono
                prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/25 prose-pre:rounded-lg 
                prose-pre:p-3.5 prose-pre:my-4 prose-pre:overflow-x-auto
                [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.8125rem] [&_pre_code]:leading-relaxed
                [&_pre_code]:text-foreground/80
                
                /* Links - Subtle muted gold */
                prose-a:text-[hsl(var(--heading-gold-soft))] prose-a:no-underline hover:prose-a:underline 
                prose-a:font-medium prose-a:transition-colors
                
                /* Strong/Bold */
                prose-strong:text-foreground/90 prose-strong:font-semibold
                
                /* Blockquotes - Subtle callout style */
                prose-blockquote:border-l-2 prose-blockquote:border-[hsl(var(--heading-gold-muted))] 
                prose-blockquote:bg-muted/20 prose-blockquote:py-2 prose-blockquote:px-3.5 
                prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-foreground/80
                prose-blockquote:my-4
                [&_blockquote_p]:mb-0 [&_blockquote_p]:text-foreground/80
                
                /* Horizontal rules - Subtle section breaks */
                prose-hr:border-border/25 prose-hr:my-6
                
                /* Tables */
                prose-table:border-collapse prose-table:w-full prose-table:my-4
                prose-th:bg-muted/25 prose-th:px-2.5 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-[0.8125rem]
                prose-th:text-[hsl(var(--heading-gold-muted))] prose-th:border-b prose-th:border-border/25
                prose-td:px-2.5 prose-td:py-2 prose-td:border-b prose-td:border-border/15 prose-td:text-muted-foreground prose-td:text-[0.875rem]
              ">
                <ReactMarkdown
                  components={{
                    // Custom paragraph renderer to detect warning lines
                    p: ({ children, ...props }) => {
                      const text = String(children);
                      // Check if paragraph starts with warning emoji
                      if (text.startsWith('⚠️') || text.startsWith('⚠')) {
                        return (
                          <div className="flex items-start gap-3 my-5 p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-foreground/90">
                            <span className="text-xl flex-shrink-0 mt-0.5">⚠️</span>
                            <span className="text-[15px] leading-[1.75]">{text.replace(/^⚠️?\s*/, '')}</span>
                          </div>
                        );
                      }
                      // Check for info/note indicators
                      if (text.startsWith('ℹ️') || text.toLowerCase().startsWith('note:') || text.toLowerCase().startsWith('poznámka:')) {
                        return (
                          <div className="flex items-start gap-3 my-5 p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl text-foreground/90">
                            <span className="text-xl flex-shrink-0 mt-0.5">ℹ️</span>
                            <span className="text-[15px] leading-[1.75]">{text.replace(/^(ℹ️|note:|poznámka:)\s*/i, '')}</span>
                          </div>
                        );
                      }
                      // Check for success/tip indicators
                      if (text.startsWith('✅') || text.toLowerCase().startsWith('tip:')) {
                        return (
                          <div className="flex items-start gap-3 my-5 p-4 bg-green-500/10 border border-green-500/25 rounded-xl text-foreground/90">
                            <span className="text-xl flex-shrink-0 mt-0.5">✅</span>
                            <span className="text-[15px] leading-[1.75]">{text.replace(/^(✅|tip:)\s*/i, '')}</span>
                          </div>
                        );
                      }
                      return <p {...props}>{children}</p>;
                    },
                  }}
                >
                  {apiDocumentation}
                </ReactMarkdown>
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="pt-4 border-t border-border/30">
            <Button variant="outline" onClick={() => setApiDocsModalOpen(false)}>
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerDashboard;
