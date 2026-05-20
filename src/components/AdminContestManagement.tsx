import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Plus,
  Pencil,
  X,
  ImagePlus,
  Trash2,
  Coins,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Ticket,
  TrendingUp,
  Activity,
  BarChart2,
  Clock,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

interface ContestData {
  contest_id: string;
  title: string;
  description: string | null;
  rules: string | null;
  rules_pdf_url: string | null;
  main_prize: string;
  main_image: string | null;
  status: string;
  ticket_count: number;
  ticket_price: number;
  tickets_sold: number;
  progress_percentage: number;
  total_miocoin_bonus: number | null;
  created_at: string;
  updated_at: string;
  fast_game?: boolean;
}

interface ContestViewStats {
  tickets_remaining: number;
  sold_percent: number;
  estimated_revenue: number;
  tickets_last_24h: number;
  users_last_24h: number;
}

interface ContestFormData {
  title: string;
  description: string;
  rules: string;
  rules_pdf_file: File | null;
  rules_pdf_url: string;
  main_prize: string;
  ticket_count: number;
  ticket_price: number;
  status: string;
  main_image_file: File | null;
  banner_image_file: File | null;
  detail_image_file: File | null;
  main_image_url: string;
  banner_image_url: string;
  detail_image_url: string;
  fast_game: boolean;
}

interface MioCoinBonus {
  ticket_position: number;
  amount: number;
}

interface PhysicalPrize {
  id?: string;
  ticket_position: number;
  description: string;
  detailed_description?: string;
  supplier_name?: string;
  unit_cost_czk?: number;
  vat_rate?: number;
  handling_override_czk?: number | null;
  image_url?: string | null;
  image_file?: File | null;
  ai_image_url?: string | null;
  ai_generating?: boolean;
}

interface EconomyAssumptions {
  mainPrizeRealCost: number;
  mioCoinRealCost: number;
  vatRate: number;
  setupCost: number;
  marketingPercent: number;
  handlingCostPerPhysicalPrize: number;
  targetMarginPercent: number;
}

interface ContestModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingContest: ContestData | null;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Archiv test", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
  { value: "pending", label: "Čeká na start", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  { value: "active", label: "Aktivní", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  { value: "paused", label: "Pozastaveno", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  { value: "closed", label: "Ukončeno", color: "bg-red-500/20 text-red-300 border-red-500/30", disabled: true },
];

const SELECTABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter((opt) => opt.value !== "closed");

const DEFAULT_ECONOMY_ASSUMPTIONS: EconomyAssumptions = {
  mainPrizeRealCost: 0,
  mioCoinRealCost: 0,
  vatRate: 21,
  setupCost: 7000,
  marketingPercent: 15,
  handlingCostPerPhysicalPrize: 75,
  targetMarginPercent: 20,
};

const getStatusBadgeClass = (status: string) => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === status);
  return option?.color || "bg-gray-500/20 text-gray-300 border-gray-500/30";
};

const ContestModal: React.FC<ContestModalProps> = ({ open, onClose, onSaved, editingContest }) => {
  const [form, setForm] = useState<ContestFormData>({
    title: "",
    description: "",
    rules: "",
    rules_pdf_file: null,
    rules_pdf_url: "",
    main_prize: "",
    ticket_count: 1000000,
    ticket_price: 1,
    status: "pending",
    main_image_file: null,
    banner_image_file: null,
    detail_image_file: null,
    main_image_url: "",
    banner_image_url: "",
    detail_image_url: "",
    fast_game: false,
  });
  const [saving, setSaving] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingBanner, setGeneratingBanner] = useState(false);
  const [regeneratingHero, setRegeneratingHero] = useState(false);
  const [regeneratingBanner, setRegeneratingBanner] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // AI image transformation state
  const [transformingImage, setTransformingImage] = useState(false);
  const [aiGeneratedImages, setAiGeneratedImages] = useState<{
    hero?: string;
    banner?: string;
  }>({});
  // Store original product image base64 for regeneration
  const [productImageBase64, setProductImageBase64] = useState<string | null>(null);

  // Gallery media state
  const [galleryMedia, setGalleryMedia] = useState<Array<{ id: string; type: string; url: string; sort_order: number }>>([]);
  const [newMediaType, setNewMediaType] = useState<string>("image");
  const [newMediaUrl, setNewMediaUrl] = useState<string>("");
  const [newMediaSortOrder, setNewMediaSortOrder] = useState<number>(0);
  const [addingMedia, setAddingMedia] = useState(false);
  const [newMediaFile, setNewMediaFile] = useState<File | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  // Pending media buffer for NEW contests (no contest_id yet) — File objects keyed by temp id
  const [pendingMediaFiles, setPendingMediaFiles] = useState<Record<string, File>>({});

  // MioCoin bonus state
  const [mioCoinBonuses, setMioCoinBonuses] = useState<MioCoinBonus[]>([]);
  const [hasPersistedMioCoinBonuses, setHasPersistedMioCoinBonuses] = useState(false);
  const [totalMioCoinsInput, setTotalMioCoinsInput] = useState<number>(0);
  const [stepValue, setStepValue] = useState<number>(0);
  const [distributionType, setDistributionType] = useState<"even" | "random">("even");
  const [mioCoinGeneratorTouched, setMioCoinGeneratorTouched] = useState(false);
  const [economyAssumptions, setEconomyAssumptions] =
    useState<EconomyAssumptions>(DEFAULT_ECONOMY_ASSUMPTIONS);

  // Physical prize state
  const [physicalPrizes, setPhysicalPrizes] = useState<PhysicalPrize[]>([]);
  const [newPhysicalPrize, setNewPhysicalPrize] = useState<PhysicalPrize>({
    ticket_position: 1,
    description: "",
    detailed_description: "",
    supplier_name: "",
    unit_cost_czk: 0,
    vat_rate: 21,
    handling_override_czk: null,
    image_file: null,
  });
  // Bulk quantity and distribution type (form-only, not persisted per row)
  const [physicalPrizeQuantity, setPhysicalPrizeQuantity] = useState<number>(1);
  const [physicalPrizeDistribution, setPhysicalPrizeDistribution] = useState<"even" | "random">("even");

  // Reset form when modal opens or editingContest changes
  useEffect(() => {
    if (editingContest) {
      setForm({
        title: editingContest.title || "",
        description: editingContest.description || "",
        rules: editingContest.rules || "",
        rules_pdf_file: null,
        rules_pdf_url: editingContest.rules_pdf_url || "",
        main_prize: editingContest.main_prize || "",
        ticket_count: editingContest.ticket_count || 1000000,
        ticket_price: editingContest.ticket_price || 1,
        status: editingContest.status || "pending",
        main_image_file: null,
        banner_image_file: null,
        detail_image_file: null,
        main_image_url: editingContest.main_image || "",
        banner_image_url: "",
        detail_image_url: "",
        fast_game: editingContest.fast_game ?? false,
      });
      // Load existing bonuses and gallery for editing
      loadExistingBonuses(editingContest.contest_id);
      loadGalleryMedia(editingContest.contest_id);
      loadEconomyAssumptions(editingContest.contest_id);
    } else {
      setForm({
        title: "",
        description: "",
        rules: "",
        rules_pdf_file: null,
        rules_pdf_url: "",
        main_prize: "",
        ticket_count: 1000000,
        ticket_price: 1,
        status: "pending",
        main_image_file: null,
        banner_image_file: null,
        detail_image_file: null,
        main_image_url: "",
        banner_image_url: "",
        detail_image_url: "",
        fast_game: false,
      });
      setMioCoinBonuses([]);
      setHasPersistedMioCoinBonuses(false);
      setPhysicalPrizes([]);
      setGalleryMedia([]);
      setPendingMediaFiles({});
      // Reset MioCoin generator inputs so the "Počet pozic" preview doesn't show
      // a phantom number based on stale defaults from a previous session.
      setTotalMioCoinsInput(0);
      setStepValue(0);
      setDistributionType("even");
      setMioCoinGeneratorTouched(false);
      // New contest starts with fresh economy defaults.
      setEconomyAssumptions(DEFAULT_ECONOMY_ASSUMPTIONS);
    }
    setActiveTab("basic");
  }, [editingContest, open]);

  useEffect(() => {
    if (
      totalMioCoinsInput === 0 &&
      stepValue === 0 &&
      distributionType === "even" &&
      mioCoinBonuses.length === 0 &&
      mioCoinGeneratorTouched
    ) {
      setMioCoinGeneratorTouched(false);
    }
  }, [distributionType, mioCoinBonuses.length, mioCoinGeneratorTouched, stepValue, totalMioCoinsInput]);

  // ---- Draft persistence (only for new contests, not editing) ----
  const DRAFT_KEY = "draft_new_contest";
  const isNewContest = !editingContest;
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const draftHydratedRef = React.useRef(false);

  // Restore draft on open (new contest only)
  useEffect(() => {
    if (!open || !isNewContest) {
      draftHydratedRef.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setForm((prev) => ({
          ...prev,
          ...parsed,
          // never restore File objects
          rules_pdf_file: null,
          main_image_file: null,
          banner_image_file: null,
          detail_image_file: null,
        }));
      }
    } catch (e) {
      console.warn("Failed to restore contest draft", e);
    }
    draftHydratedRef.current = true;
  }, [open, isNewContest]);

  // Save draft on every form change (new contest only)
  useEffect(() => {
    if (!open || !isNewContest || !draftHydratedRef.current) return;
    try {
      const { rules_pdf_file, main_image_file, banner_image_file, detail_image_file, ...serializable } = form;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.warn("Failed to save contest draft", e);
    }
  }, [form, open, isNewContest]);

  // Detect if form has any user-entered data
  const isFormDirty = React.useMemo(() => {
    if (!isNewContest) return false;
    return Boolean(
      form.title?.trim() ||
        form.description?.trim() ||
        form.rules?.trim() ||
        form.main_prize?.trim() ||
        form.rules_pdf_file ||
        form.rules_pdf_url ||
        form.main_image_file ||
        form.banner_image_file ||
        form.detail_image_file ||
        form.main_image_url ||
        form.banner_image_url ||
        form.detail_image_url,
    );
  }, [form, isNewContest]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setForm({
      title: "",
      description: "",
      rules: "",
      rules_pdf_file: null,
      rules_pdf_url: "",
      main_prize: "",
      ticket_count: 1000000,
      ticket_price: 1,
      status: "pending",
      main_image_file: null,
      banner_image_file: null,
      detail_image_file: null,
      main_image_url: "",
      banner_image_url: "",
      detail_image_url: "",
      fast_game: false,
    });
    setGalleryMedia([]);
    setPendingMediaFiles({});
    toast({ title: "Rozdělaná práce smazána" });
  };

  const attemptClose = () => {
    if (saving) return;
    if (isFormDirty) {
      setConfirmCloseOpen(true);
    } else {
      onClose();
    }
  };

  const confirmDiscardAndClose = () => {
    setConfirmCloseOpen(false);
    onClose();
  };

  /**
   * Sanitize a raw file name so it is safe for Supabase Storage keys.
   * Supabase Storage rejects keys containing spaces, Czech diacritics,
   * parentheses, or other non-ASCII characters ("Invalid key" error).
   *
   * Steps:
   *  1. Separate base name from extension (lowercased).
   *  2. Normalise Unicode (NFD) and strip combining diacritical marks.
   *  3. Replace spaces with hyphens.
   *  4. Strip any character that is not a-z, A-Z, 0-9, dot, underscore, or hyphen.
   *  5. Collapse repeated hyphens.
   *  6. Fall back to "file" if the result is empty.
   */
  const sanitizeStorageFileName = (fileName: string): string => {
    const lastDot = fileName.lastIndexOf(".");
    const rawBase = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
    const ext = lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : "";

    const safeBase = rawBase
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")   // strip combining diacritical marks
      .replace(/\s+/g, "-")              // spaces → hyphens
      .replace(/[^a-zA-Z0-9._-]/g, "")  // remove remaining special chars
      .replace(/-{2,}/g, "-")            // collapse repeated hyphens
      || "file";                          // fallback

    return ext ? `${safeBase}.${ext}` : safeBase;
  };

  const loadGalleryMedia = async (contestId: string) => {
    setLoadingMedia(true);
    const { data, error } = await supabase
      .from("contest_media")
      .select("*")
      .eq("contest_id", contestId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error loading gallery media:", error);
    } else {
      setGalleryMedia(data || []);
    }
    setLoadingMedia(false);
  };

  // Load persisted economy assumptions for an existing contest.
  // Falls back to DEFAULT_ECONOMY_ASSUMPTIONS if no row exists yet.
  const loadEconomyAssumptions = async (contestId: string) => {
    try {
      const { data } = await supabase
        .from("contest_economy")
        .select("*")
        .eq("contest_id", contestId)
        .maybeSingle();
      if (data) {
        setEconomyAssumptions({
          mainPrizeRealCost: data.main_prize_cost_czk ?? DEFAULT_ECONOMY_ASSUMPTIONS.mainPrizeRealCost,
          mioCoinRealCost: data.miocoin_real_cost_czk ?? DEFAULT_ECONOMY_ASSUMPTIONS.mioCoinRealCost,
          vatRate: data.vat_rate_percent ?? DEFAULT_ECONOMY_ASSUMPTIONS.vatRate,
          setupCost: data.setup_cost_czk ?? DEFAULT_ECONOMY_ASSUMPTIONS.setupCost,
          marketingPercent: data.marketing_percent ?? DEFAULT_ECONOMY_ASSUMPTIONS.marketingPercent,
          handlingCostPerPhysicalPrize: data.default_handling_czk ?? DEFAULT_ECONOMY_ASSUMPTIONS.handlingCostPerPhysicalPrize,
          targetMarginPercent: data.target_margin_percent ?? DEFAULT_ECONOMY_ASSUMPTIONS.targetMarginPercent,
        });
      } else {
        setEconomyAssumptions(DEFAULT_ECONOMY_ASSUMPTIONS);
      }
    } catch (e) {
      console.warn("Failed to load contest economy assumptions:", e);
      setEconomyAssumptions(DEFAULT_ECONOMY_ASSUMPTIONS);
    }
  };

  const handleAddMedia = async () => {
    const contestId = editingContest?.contest_id;
    const isNew = !contestId;

    let finalUrl = newMediaUrl.trim();
    let pendingFile: File | null = null;

    // For image type, require file upload
    if (newMediaType === "image") {
      if (!newMediaFile) {
        toast({ title: "Chyba", description: "Vyberte obrázek.", variant: "destructive" });
        return;
      }
      if (isNew) {
        // New contest: keep file locally, will upload on save
        pendingFile = newMediaFile;
        finalUrl = URL.createObjectURL(newMediaFile);
      } else {
        setAddingMedia(true);
        const safeImageName = sanitizeStorageFileName(newMediaFile.name);
        const filePath = `contests/${contestId}/gallery/${Date.now()}-${crypto.randomUUID()}-${safeImageName}`;
        const { error: uploadError } = await supabase.storage
          .from("contest-images")
          .upload(filePath, newMediaFile);
        if (uploadError) {
          toast({
            title: "Chyba uploadu",
            description: "Galerii se nepodařilo nahrát. Zkuste soubor přejmenovat bez speciálních znaků.",
            variant: "destructive",
          });
          setAddingMedia(false);
          return;
        }
        const { data: publicUrlData } = supabase.storage.from("contest-images").getPublicUrl(filePath);
        finalUrl = publicUrlData.publicUrl;
      }
    } else if (newMediaType === "background") {
      if (!newMediaFile) {
        toast({ title: "Chyba", description: "Vyberte obrázek pozadí.", variant: "destructive" });
        return;
      }
      if (isNew) {
        pendingFile = newMediaFile;
        finalUrl = URL.createObjectURL(newMediaFile);
      } else {
        setAddingMedia(true);
        const safeBgName = sanitizeStorageFileName(newMediaFile.name);
        const filePath = `contests/${contestId}/gallery/${Date.now()}-${crypto.randomUUID()}-${safeBgName}`;
        const { error: uploadError } = await supabase.storage
          .from("contest-images")
          .upload(filePath, newMediaFile);
        if (uploadError) {
          toast({
            title: "Chyba uploadu",
            description: "Galerii se nepodařilo nahrát. Zkuste soubor přejmenovat bez speciálních znaků.",
            variant: "destructive",
          });
          setAddingMedia(false);
          return;
        }
        const { data: publicUrlData } = supabase.storage.from("contest-images").getPublicUrl(filePath);
        finalUrl = publicUrlData.publicUrl;
      }
    } else {
      if (!finalUrl) {
        toast({ title: "Chyba", description: "Zadejte URL.", variant: "destructive" });
        return;
      }
    }

    setAddingMedia(true);

    // Enforce single background: confirm before replacing existing one
    if (newMediaType === "background") {
      const existingBgIds = galleryMedia.filter((m) => m.type === "background").map((m) => m.id);
      if (existingBgIds.length > 0) {
        const confirmed = window.confirm("Tímto nahradíte stávající pozadí. Pokračovat?");
        if (!confirmed) {
          setAddingMedia(false);
          return;
        }
        // Optimistic: remove old backgrounds from state immediately
        setGalleryMedia((prev) => prev.filter((m) => m.type !== "background"));
        // Drop pending file refs for removed backgrounds
        setPendingMediaFiles((prev) => {
          const next = { ...prev };
          existingBgIds.forEach((id) => delete next[id]);
          return next;
        });
        // Delete from DB (ignore temp ids) only when editing existing contest
        if (!isNew) {
          const realIds = existingBgIds.filter((id) => !String(id).startsWith("temp-"));
          if (realIds.length > 0) {
            await supabase.from("contest_media").delete().in("id", realIds);
          }
        }
      }
    }

    // Optimistic: add placeholder immediately
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticItem = { id: tempId, type: newMediaType, url: finalUrl, sort_order: newMediaSortOrder };
    setGalleryMedia((prev) => [...prev, optimisticItem].sort((a, b) => a.sort_order - b.sort_order));

    // Track file for new-contest flush
    if (isNew && pendingFile) {
      setPendingMediaFiles((prev) => ({ ...prev, [tempId]: pendingFile! }));
    }

    // Clear form immediately for snappy UX
    const savedType = newMediaType;
    const savedUrl = finalUrl;
    const savedOrder = newMediaSortOrder;
    setNewMediaUrl("");
    setNewMediaFile(null);
    setNewMediaSortOrder(0);

    if (isNew) {
      // For new contest, persistence happens on save. Just confirm and stop.
      toast({ title: "Přidáno do galerie", description: "Bude uloženo po vytvoření soutěže." });
      setAddingMedia(false);
      return;
    }

    const { data, error } = await supabase.from("contest_media").insert({
      contest_id: contestId,
      type: savedType,
      url: savedUrl,
      sort_order: savedOrder,
    }).select().single();

    if (error) {
      // Revert optimistic update
      setGalleryMedia((prev) => prev.filter((m) => m.id !== tempId));
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      // Replace temp with real record
      setGalleryMedia((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      toast({ title: "Přidáno", description: "Médium bylo přidáno do galerie." });
    }
    setAddingMedia(false);
  };


  const handleDeleteMedia = async (mediaId: string) => {
    setDeletingMediaId(mediaId);

    // Optimistic: remove immediately
    const previousMedia = [...galleryMedia];
    setGalleryMedia((prev) => prev.filter((m) => m.id !== mediaId));

    // Temp items only exist in client state (new contest buffer) — skip DB call
    if (mediaId.startsWith("temp-")) {
      setPendingMediaFiles((prev) => {
        const next = { ...prev };
        delete next[mediaId];
        return next;
      });
      toast({ title: "Odebráno", description: "Médium bylo odebráno z fronty." });
      setDeletingMediaId(null);
      return;
    }

    const { error } = await supabase.from("contest_media").delete().eq("id", mediaId);
    if (error) {
      // Revert on failure
      setGalleryMedia(previousMedia);
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Smazáno", description: "Médium bylo odstraněno z galerie." });
    }
    setDeletingMediaId(null);
  };

  const loadExistingBonuses = async (contestId: string) => {
    const { data, error } = await supabase.from("bonus_prizes").select("*").eq("contest_id", contestId);

    if (error) {
      console.error("Error loading bonuses:", error);
      return;
    }

    const mioCoins: MioCoinBonus[] = [];
    const physical: PhysicalPrize[] = [];

    (data || []).forEach((bonus: any) => {
      if (bonus.amount && bonus.amount > 0) {
        mioCoins.push({
          ticket_position: bonus.ticket_position,
          amount: bonus.amount,
        });
      } else {
        physical.push({
          id: bonus.id,
          ticket_position: bonus.ticket_position,
          description: bonus.description || "",
          detailed_description: bonus.detailed_description || "",
          // Load persisted economy metadata (Phase 4); null → frontend default.
          supplier_name: bonus.supplier_name || "",
          unit_cost_czk: bonus.unit_cost_czk ?? 0,
          vat_rate: bonus.vat_rate_percent ?? 21,
          handling_override_czk: bonus.handling_override_czk ?? null,
          image_url: bonus.image_url,
        });
      }
    });

    setMioCoinBonuses(mioCoins);
    setHasPersistedMioCoinBonuses(mioCoins.length > 0);
    setPhysicalPrizes(physical);
    // Reset generator inputs so the "Počet pozic" preview reflects only what
    // the admin actively types, not stale defaults left over between contests.
    setTotalMioCoinsInput(0);
    setStepValue(0);
    setDistributionType("even");
    setMioCoinGeneratorTouched(false);
  };

  const handleChange =
    (field: keyof ContestFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = field === "ticket_count" || field === "ticket_price" ? Number(e.target.value || 0) : e.target.value;
      setForm((prev) => ({ ...prev, [field]: value as any }));
    };

  // When the user focuses a numeric input whose stored value is 0 (the common
  // default), select all text so typing replaces "0" instead of producing a
  // leading-zero value like "065000". Stored numeric values stay correct.
  const handleNumericFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (Number(e.target.value) === 0) {
      e.target.select();
    }
  };

  const handleStatusChange = (value: string) => {
    setForm((prev) => ({ ...prev, status: value }));
  };

  const handleFileChange =
    (field: "main_image_file" | "banner_image_file" | "detail_image_file") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      setForm((prev) => ({ ...prev, [field]: file }));
    };

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper – jednotný název ceny pro AI
  const getPrizeName = (fallback?: string) => {
    return (
      (form.main_prize && form.main_prize.trim()) || (form.title && form.title.trim()) || fallback || "Hlavní výhra"
    );
  };

  // AI Image-to-Image generation (Vertex AI Imagen)
  const generateAiStyledImages = async () => {
    if (!form.main_image_file) {
      toast({
        title: "Chyba",
        description: "Nahraj obrázek produktu pro generování AI grafiky.",
        variant: "destructive",
      });
      return;
    }

    setTransformingImage(true);
    toast({
      title: "Generuji AI grafiku…",
      description: "Stylizuji nahraný produkt (hero + banner). Trvá cca 30-60 sekund.",
    });

    try {
      // Convert uploaded file to base64 and store for regeneration
      const imageBase64 = await fileToBase64(form.main_image_file);
      setProductImageBase64(imageBase64);
      const prizeName = getPrizeName();

      // Generate hero and banner variants in parallel using Vertex AI image-to-image
      const [heroResult, bannerResult] = await Promise.allSettled([
        styleImage("hero", imageBase64, prizeName),
        styleImage("banner", imageBase64, prizeName),
      ]);

      const heroData = heroResult.status === "fulfilled" ? heroResult.value : { success: false };
      const bannerData = bannerResult.status === "fulfilled" ? bannerResult.value : { success: false };

      const newImages: typeof aiGeneratedImages = {};

      if (heroData.success && heroData.url) {
        newImages.hero = heroData.url;
        setForm((prev) => ({ ...prev, detail_image_url: heroData.url! }));
      }

      if (bannerData.success && bannerData.url) {
        newImages.banner = bannerData.url;
        setForm((prev) => ({ ...prev, banner_image_url: bannerData.url! }));
      }

      setAiGeneratedImages(newImages);

      if (heroData.success || bannerData.success) {
        toast({
          title: "AI grafika vygenerována",
          description: `Vytvořeno: ${heroData.success ? "hero" : ""}${heroData.success && bannerData.success ? " + " : ""}${bannerData.success ? "banner" : ""} obrázek.`,
        });
      } else {
        toast({
          title: "Chyba",
          description: "Nepodařilo se vygenerovat AI grafiku.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("AI image generation error:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se vygenerovat AI grafiku.",
        variant: "destructive",
      });
    } finally {
      setTransformingImage(false);
    }
  };

  // Regenerate only hero image (image-to-image using stored product base64)
  const handleRegenerateHero = async () => {
    if (!productImageBase64 && !form.main_image_file) {
      toast({
        title: "Chyba",
        description: "Nahraj obrázek produktu pro regeneraci hero obrázku.",
        variant: "destructive",
      });
      return;
    }

    setRegeneratingHero(true);
    toast({
      title: "Regeneruji hero obrázek…",
      description: "Vytvářím nový stylizovaný hero obrázek pomocí Vertex AI.",
    });

    try {
      // Use stored base64 or convert file again
      let imageBase64 = productImageBase64;
      if (!imageBase64 && form.main_image_file) {
        imageBase64 = await fileToBase64(form.main_image_file);
        setProductImageBase64(imageBase64);
      }

      const prizeName = getPrizeName();
      const result = await styleImage("hero", imageBase64!, prizeName);

      if (result.success && result.url) {
        setAiGeneratedImages((prev) => ({ ...prev, hero: result.url }));
        setForm((prev) => ({ ...prev, detail_image_url: result.url! }));
        toast({
          title: "Hero obrázek regenerován",
          description: "Nový AI hero obrázek byl úspěšně vytvořen.",
        });
      } else {
        throw new Error(result.error || "Nepodařilo se regenerovat hero obrázek.");
      }
    } catch (err: any) {
      console.error("Error regenerating hero:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se regenerovat hero obrázek.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingHero(false);
    }
  };

  // Regenerate only banner image (image-to-image using stored product base64)
  const handleRegenerateBanner = async () => {
    if (!productImageBase64 && !form.main_image_file) {
      toast({
        title: "Chyba",
        description: "Nahraj obrázek produktu pro regeneraci banneru.",
        variant: "destructive",
      });
      return;
    }

    setRegeneratingBanner(true);
    toast({
      title: "Regeneruji banner…",
      description: "Vytvářím nový stylizovaný banner pomocí Vertex AI.",
    });

    try {
      // Use stored base64 or convert file again
      let imageBase64 = productImageBase64;
      if (!imageBase64 && form.main_image_file) {
        imageBase64 = await fileToBase64(form.main_image_file);
        setProductImageBase64(imageBase64);
      }

      const prizeName = getPrizeName();
      const result = await styleImage("banner", imageBase64!, prizeName);

      if (result.success && result.url) {
        setAiGeneratedImages((prev) => ({ ...prev, banner: result.url }));
        setForm((prev) => ({ ...prev, banner_image_url: result.url! }));
        toast({
          title: "Banner regenerován",
          description: "Nový AI banner byl úspěšně vytvořen.",
        });
      } else {
        throw new Error(result.error || "Nepodařilo se regenerovat banner.");
      }
    } catch (err: any) {
      console.error("Error regenerating banner:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se regenerovat banner.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingBanner(false);
    }
  };

  // Image-to-image styling using Vertex AI Imagen – POSÍLÁME I prize_name
  const styleImage = async (
    layout: "hero" | "banner" | "bonus",
    imageBase64: string,
    prizeName: string,
  ): Promise<{ success: boolean; url?: string; error?: string }> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vertex-style-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout,
          prize_name: prizeName,
          image_base64: imageBase64,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || "Unknown error" };
      }

      return { success: true, url: result.url };
    } catch (err: any) {
      return { success: false, error: err?.message || "Network error" };
    }
  };

  const handleImageUpload = async (
    file: File,
    bucket: "contest-images" | "contest-banners" = "contest-images",
  ): Promise<string> => {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = fileName;

    const { error } = await supabase.storage.from(bucket).upload(filePath, file);

    if (error) {
      throw error;
    }

    return filePath;
  };

  // AI-powered description generation
  const handleGenerateDescription = async () => {
    if (!form.title && !form.main_prize) {
      toast({
        title: "Chyba",
        description: "Vyplň název soutěže nebo hlavní výhru pro generování popisu.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingDescription(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error("Nejste přihlášeni.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-contest-description-openai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: form.title,
            main_prize: form.main_prize,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Nepodařilo se vygenerovat popis.");
      }

      const result = await response.json();

      if (result.description) {
        setForm((prev) => ({ ...prev, description: result.description }));
        toast({
          title: "Popis vygenerován",
          description: "AI popis byl úspěšně vytvořen.",
        });
      }
    } catch (err: any) {
      console.error("Error generating description:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se vygenerovat popis.",
        variant: "destructive",
      });
    } finally {
      setGeneratingDescription(false);
    }
  };

  // AI-powered banner generation using Vertex AI image-to-image
  const handleGenerateBanner = async () => {
    if (!productImageBase64 && !form.main_image_file) {
      toast({
        title: "Chyba",
        description: "Nahraj obrázek produktu pro generování AI banneru.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingBanner(true);
    toast({
      title: "Generuji AI banner…",
      description: "Prosím počkejte, generování může trvat až 30 sekund.",
    });

    try {
      // Use stored base64 or convert file
      let imageBase64 = productImageBase64;
      if (!imageBase64 && form.main_image_file) {
        imageBase64 = await fileToBase64(form.main_image_file);
        setProductImageBase64(imageBase64);
      }

      const prizeName = getPrizeName();
      const result = await styleImage("banner", imageBase64!, prizeName);

      if (result.success && result.url) {
        setAiGeneratedImages((prev) => ({ ...prev, banner: result.url }));
        setForm((prev) => ({ ...prev, banner_image_url: result.url! }));
        toast({
          title: "Banner vygenerován",
          description: "AI banner byl úspěšně vytvořen pomocí Vertex AI.",
        });
      } else {
        throw new Error(result.error || "Nepodařilo se vygenerovat banner.");
      }
    } catch (err: any) {
      console.error("Error generating banner:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se vygenerovat banner.",
        variant: "destructive",
      });
    } finally {
      setGeneratingBanner(false);
    }
  };

  // Auto-prefill main_prize when title changes
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setForm((prev) => ({
      ...prev,
      title: newTitle,
      main_prize: prev.main_prize || newTitle,
    }));
  };

  // Computed number of positions
  const computedPositionCount = stepValue > 0 ? Math.floor(totalMioCoinsInput / stepValue) : 0;

  // MioCoin bonus generation - frontend preview only; rows are persisted by the final save flow.
  const generateMioCoinBonuses = async () => {
    if (editingContest && hasPersistedMioCoinBonuses) {
      toast({
        title: "MioCoin pozice nelze změnit",
        description:
          "Vygenerované MioCoin bonusové pozice už byly pro tuto soutěž vytvořeny. Po vytvoření je nelze v editaci přegenerovat ani přepsat.",
        variant: "destructive",
      });
      return;
    }

    if (totalMioCoinsInput <= 0 || stepValue <= 0) {
      toast({
        title: "Chyba",
        description: "Zadej platný celkový počet MioCoinů a hodnotu bonusu.",
        variant: "destructive",
      });
      return;
    }

    if (computedPositionCount <= 0) {
      toast({
        title: "Chyba",
        description: "Počet pozic musí být alespoň 1.",
        variant: "destructive",
      });
      return;
    }

    const usedPositions = new Set([
      ...mioCoinBonuses.map((b) => b.ticket_position),
      ...physicalPrizes.map((p) => p.ticket_position),
    ]);

    const newBonuses: MioCoinBonus[] = [];
    const ticketCount = form.ticket_count || 1000000;
    // MioCoin positions must never land on the final ticket (ticket_count).
    // That position is reserved for the main prize.
    const maxMioCoinPosition = ticketCount - 1;

    if (distributionType === "even") {
      // Evenly spaced positions within [1, maxMioCoinPosition]
      const rawSpacing = Math.floor(maxMioCoinPosition / (computedPositionCount + 1));
      const spacing = rawSpacing < 1 ? 1 : rawSpacing;
      for (let i = 1; i <= computedPositionCount; i++) {
        let position = spacing * i;
        if (position < 1) position = 1;
        if (position > maxMioCoinPosition) continue;
        // Adjust if position is already used
        while (usedPositions.has(position) && position <= maxMioCoinPosition) {
          position++;
        }
        if (position <= maxMioCoinPosition && !usedPositions.has(position)) {
          usedPositions.add(position);
          newBonuses.push({ ticket_position: position, amount: stepValue });
        }
      }
    } else {
      // Random positions within [1, maxMioCoinPosition]
      let attempts = 0;
      const maxAttempts = computedPositionCount * 10;

      while (newBonuses.length < computedPositionCount && attempts < maxAttempts) {
        const position = Math.floor(Math.random() * maxMioCoinPosition) + 1;
        if (!usedPositions.has(position)) {
          usedPositions.add(position);
          newBonuses.push({ ticket_position: position, amount: stepValue });
        }
        attempts++;
      }
    }

    if (newBonuses.length < computedPositionCount) {
      toast({
        title: "Upozornění",
        description: `Podařilo se vygenerovat pouze ${newBonuses.length} z ${computedPositionCount} bonusů.`,
      });
    }

    toast({
      title: "MioCoiny připraveny",
      description: `Připraveno ${newBonuses.length} MioCoin bonusů. Do soutěže se uloží až při finálním uložení.`,
    });

    setMioCoinBonuses((prev) => [...prev, ...newBonuses]);
  };

  const clearMioCoinBonuses = () => {
    if (editingContest && hasPersistedMioCoinBonuses) {
      toast({
        title: "MioCoin pozice nelze změnit",
        description:
          "Vygenerované MioCoin bonusové pozice už byly pro tuto soutěž vytvořeny. Po vytvoření je nelze v editaci smazat ani nahradit.",
        variant: "destructive",
      });
      return;
    }

    setMioCoinBonuses([]);
    toast({ title: "MioCoiny smazány", description: "Všechny MioCoin bonusy byly odstraněny." });
  };

  // Physical prize management

  /**
   * Pick `count` positions from the `available` pool.
   * "even"   – evenly spaced indices across the pool (deterministic, easy to audit).
   * "random" – Fisher-Yates shuffle, first count results, returned sorted.
   */
  const pickPositions = (
    strategy: "even" | "random",
    count: number,
    available: number[]
  ): number[] => {
    if (count === 1) {
      // Single prize: return the middle of the pool so it sits roughly in the middle.
      return [available[Math.floor(available.length / 2)]];
    }
    if (strategy === "even") {
      const step = (available.length - 1) / (count - 1);
      return Array.from({ length: count }, (_, i) => available[Math.round(i * step)]);
    }
    // random
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count).sort((a, b) => a - b);
  };

  const addPhysicalPrize = () => {
    if (!newPhysicalPrize.description) {
      toast({
        title: "Chyba",
        description: "Vyplň popis výhry.",
        variant: "destructive",
      });
      return;
    }

    const qty = physicalPrizeQuantity;

    // ── Single prize: keep original manual-position behaviour ──────────────
    if (qty === 1) {
      if (newPhysicalPrize.ticket_position < 1) {
        toast({
          title: "Chyba",
          description: "Vyplň platnou pozici tiketu.",
          variant: "destructive",
        });
        return;
      }

      const usedPositions = new Set([
        ...mioCoinBonuses.map((b) => b.ticket_position),
        ...physicalPrizes.map((p) => p.ticket_position),
      ]);

      if (usedPositions.has(newPhysicalPrize.ticket_position)) {
        toast({
          title: "Chyba",
          description: `Pozice #${newPhysicalPrize.ticket_position} je již obsazena jinou výhrou.`,
          variant: "destructive",
        });
        return;
      }

      setPhysicalPrizes((prev) => [...prev, { ...newPhysicalPrize }]);
      setNewPhysicalPrize({
        ticket_position: 1,
        description: "",
        detailed_description: "",
        supplier_name: "",
        unit_cost_czk: 0,
        vat_rate: 21,
        handling_override_czk: null,
        image_file: null,
      });
      setPhysicalPrizeQuantity(1);
      toast({ title: "Výhra přidána", description: "Věcná výhra byla přidána." });
      return;
    }

    // ── Bulk (qty > 1): auto-distribute positions ──────────────────────────
    const ticketCount = form.ticket_count;
    if (!ticketCount || ticketCount < 2) {
      toast({
        title: "Chyba",
        description: "Nejprve nastav počet tiketů soutěže na záložce Základní info.",
        variant: "destructive",
      });
      return;
    }

    const occupied = new Set([
      ...mioCoinBonuses.map((b) => b.ticket_position),
      ...physicalPrizes.map((p) => p.ticket_position),
    ]);

    // Available = 1..(ticketCount-1) excluding occupied
    const available: number[] = [];
    for (let pos = 1; pos < ticketCount; pos++) {
      if (!occupied.has(pos)) available.push(pos);
    }

    if (available.length < qty) {
      toast({
        title: "Nedostatek volných pozic",
        description: `V rozsahu 1–${ticketCount - 1} je pouze ${available.length} volných pozic. Snižte počet kusů nebo zkontrolujte obsazené pozice.`,
        variant: "destructive",
      });
      return;
    }

    const positions = pickPositions(physicalPrizeDistribution, qty, available);
    const base = { ...newPhysicalPrize };
    const newPrizes: PhysicalPrize[] = positions.map((pos) => ({
      ...base,
      ticket_position: pos,
    }));

    setPhysicalPrizes((prev) => [...prev, ...newPrizes]);

    // Reset description/image; keep economy fields so admin can add another product quickly.
    setNewPhysicalPrize({
      ticket_position: 1,
      description: "",
      detailed_description: "",
      supplier_name: base.supplier_name,
      unit_cost_czk: base.unit_cost_czk,
      vat_rate: base.vat_rate,
      handling_override_czk: base.handling_override_czk,
      image_file: null,
    });
    setPhysicalPrizeQuantity(1);

    const previewPositions = positions.slice(0, 5).map((p) => `#${p}`).join(", ");
    const suffix = positions.length > 5 ? ` … +${positions.length - 5} dalších` : "";
    toast({
      title: `Přidáno ${qty} výher`,
      description: `Pozice: ${previewPositions}${suffix}`,
    });
  };

  const removePhysicalPrize = (index: number) => {
    setPhysicalPrizes((prev) => prev.filter((_, i) => i !== index));
  };

  const validateBonusPositions = (ticketCount: number): string | null => {
    const physicalPositions = new Set<number>();

    for (const prize of physicalPrizes) {
      if (!Number.isInteger(prize.ticket_position)) {
        return "Pozice věcných bonusových výher musí být celá čísla.";
      }
      if (prize.ticket_position < 1 || prize.ticket_position > ticketCount) {
        return `Pozice věcné bonusové výhry #${prize.ticket_position} musí být v rozsahu 1 až ${ticketCount}.`;
      }
      if (prize.ticket_position === ticketCount) {
        return "Bonusová výhra nesmí být na posledním ticketu, který je vyhrazen pro hlavní výhru.";
      }
      if (physicalPositions.has(prize.ticket_position)) {
        return `Pozice #${prize.ticket_position} je duplicitní mezi věcnými bonusovými výhrami.`;
      }
      physicalPositions.add(prize.ticket_position);
    }

    const mioCoinPositions = new Set<number>();

    for (const bonus of mioCoinBonuses) {
      if (!Number.isInteger(bonus.ticket_position)) {
        return "Pozice MioCoin bonusů musí být celá čísla.";
      }
      if (bonus.ticket_position < 1 || bonus.ticket_position > ticketCount) {
        return `Pozice MioCoin bonusu #${bonus.ticket_position} musí být v rozsahu 1 až ${ticketCount}.`;
      }
      if (bonus.ticket_position === ticketCount) {
        return "MioCoin bonus nesmí být na posledním ticketu, který je vyhrazen pro hlavní výhru.";
      }
      if (mioCoinPositions.has(bonus.ticket_position)) {
        return `Pozice #${bonus.ticket_position} je duplicitní mezi MioCoin bonusy.`;
      }
      if (physicalPositions.has(bonus.ticket_position)) {
        return `Pozice #${bonus.ticket_position} je už obsazena věcnou bonusovou výhrou.`;
      }
      if (!Number.isFinite(bonus.amount) || bonus.amount <= 0) {
        return "Hodnota MioCoin bonusu musí být větší než 0.";
      }
      mioCoinPositions.add(bonus.ticket_position);
    }

    return null;
  };

  const handleSave = async () => {
    if (!form.title || !form.main_prize || !form.ticket_count || !form.ticket_price) {
      toast({
        title: "Chyba",
        description: "Vyplň název, hlavní výhru, počet tiketů a cenu tiketu.",
        variant: "destructive",
      });
      return;
    }

    // Required: rules PDF (either freshly selected or already uploaded for an existing contest)
    if (!form.rules_pdf_file && !form.rules_pdf_url) {
      toast({
        title: "Chyba",
        description: "Nahrajte prosím pravidla soutěže ve formátu PDF",
        variant: "destructive",
      });
      return;
    }
    if (form.rules_pdf_file && form.rules_pdf_file.type !== "application/pdf") {
      toast({
        title: "Chyba",
        description: "Nahrajte prosím pravidla soutěže ve formátu PDF",
        variant: "destructive",
      });
      return;
    }

    // Normalize + validate ticket_count before submit (debug + guard against defaulting to 1,000,000)
    console.log("[AdminContestManagement] submit form.ticket_count:", form.ticket_count);
    const normalizedTicketCount = Number(form.ticket_count);
    console.log("[AdminContestManagement] normalizedTicketCount:", normalizedTicketCount);
    if (!Number.isFinite(normalizedTicketCount) || normalizedTicketCount < 5) {
      toast({
        title: "Chyba",
        description: "Počet ticketů musí být platné číslo alespoň 5.",
        variant: "destructive",
      });
      return;
    }

    const bonusValidationError = validateBonusPositions(normalizedTicketCount);
    if (bonusValidationError) {
      toast({
        title: "Chyba v bonusových pozicích",
        description: bonusValidationError,
        variant: "destructive",
      });
      return;
    }

    const isEditingContest = !!editingContest;

    if (isEditingContest) {
      const { count: soldTicketsCount, error: soldTicketsError } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("contest_id", editingContest.contest_id);

      if (soldTicketsError) {
        console.error("Error checking sold tickets before bonus rewrite:", soldTicketsError);
        toast({
          title: "Chyba kontroly ticketů",
          description: "Nepodařilo se ověřit, zda soutěž už má otevřené tickety. Uložení bylo zastaveno.",
          variant: "destructive",
        });
        return;
      }

      if ((soldTicketsCount ?? 0) > 0) {
        toast({
          title: "Bonusové pozice nelze přepsat",
          description:
            "Tato soutěž už má otevřené tickety, proto nelze bezpečně přepisovat bonusové pozice. Vytvořte novou verzi soutěže nebo použijte schválený servisní postup.",
          variant: "destructive",
        });
        return;
      }
    }

    const hasImmutablePersistedMioCoinBonuses = isEditingContest && hasPersistedMioCoinBonuses;
    const mioCoinGeneratorHasInput =
      totalMioCoinsInput > 0 || stepValue > 0 || distributionType !== "even";

    if (hasImmutablePersistedMioCoinBonuses && (mioCoinGeneratorTouched || mioCoinGeneratorHasInput)) {
      toast({
        title: "MioCoin pozice nelze změnit",
        description:
          "Tato soutěž už má vygenerované MioCoin bonusové pozice. Po vytvoření je nelze v editaci přegenerovat ani přepsat.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    // Tracks whether admin_manage_contest already persisted a NEW contest in CREATE mode.
    // If a later save step throws, the outer catch uses this to force-close the modal so a
    // retry click cannot create a duplicate contest (the contest already exists in DB).
    let createdContestIdInCreateMode: string | null = null;

    try {
      let imagePath: string | null = editingContest?.main_image || null;

      // If AI generated a URL, use it directly
      if (form.main_image_url && !form.main_image_file) {
        imagePath = form.main_image_url;
      } else if (form.main_image_file) {
        imagePath = await handleImageUpload(form.main_image_file);
      }

      const { data: contestResult, error } = await supabase.rpc("admin_manage_contest", {
        p_contest_id: isEditingContest ? editingContest.contest_id : null,
        p_title: form.title,
        p_description: form.description || null,
        p_main_prize: form.main_prize,
        p_main_image: imagePath,
        p_status: form.status,
        p_ticket_count: normalizedTicketCount,
        p_ticket_price: form.ticket_price,
        p_operation: isEditingContest ? "update" : "create",
        p_fast_game: form.fast_game,
      } as any);

      if (error) {
        throw error;
      }

      const savedTicketCount = Number(
        (contestResult as any)?.contest_data?.ticket_count ??
          (contestResult as any)?.contestData?.ticket_count ??
          (contestResult as any)?.ticket_count
      );
      console.log("[AdminContestManagement] RPC response ticket_count:", savedTicketCount, contestResult);
      if (Number.isFinite(savedTicketCount) && savedTicketCount !== normalizedTicketCount) {
        console.error("[AdminContestManagement] ticket_count mismatch", {
          submitted: form.ticket_count,
          normalizedTicketCount,
          savedTicketCount,
          contestResult,
        });
        toast({
          title: "Chyba",
          description: "Počet ticketů se neuložil správně.",
          variant: "destructive",
        });
        return;
      }

      // Get contest_id for bonus saving and additional updates
      console.log("[AdminContestManagement] RPC contestResult shape:", JSON.stringify(contestResult));
      const contestId = isEditingContest
        ? editingContest.contest_id
        : ((contestResult as any)?.contest_id || (contestResult as any)?.contest_data?.id);

      if (!contestId) {
        toast({ title: "Chyba", description: "Nepodařilo se získat ID soutěže", variant: "destructive" });
        setSaving(false);
        return;
      }

      // Contest is now persisted in DB. In CREATE mode, any subsequent throw must NOT
      // leave the modal open as CREATE — otherwise a retry click would create a duplicate.
      if (!isEditingContest) {
        createdContestIdInCreateMode = contestId;
      }

      // Update images directly in contests table (manual uploads only)
      if (contestId) {
        const additionalUpdates: Record<string, string | null> = {};

        // Always persist rules (RPC does not handle this column)
        additionalUpdates.rules = form.rules.trim() ? form.rules : null;

        // Upload contest rules PDF if a new file was selected
        if (form.rules_pdf_file) {
          const filePath = `${contestId}-rules.pdf`;
          const { error: uploadError } = await supabase.storage
            .from("contest-rules")
            .upload(filePath, form.rules_pdf_file, {
              contentType: "application/pdf",
              upsert: true,
            });
          if (uploadError) {
            console.error("Error uploading rules PDF:", uploadError);
            toast({
              title: "Chyba",
              description: `Nepodařilo se nahrát PDF s pravidly: ${uploadError.message}`,
              variant: "destructive",
            });
            if (isEditingContest) {
              // Edit mode: keep modal open so admin can retry the PDF upload.
              setSaving(false);
              return;
            }
            // Create mode: the contest was already created by the SECURITY DEFINER RPC.
            // Fall through to onSaved()/onClose() so the modal closes and the contest
            // appears in the list. Admin can reopen the contest and re-upload the PDF rules.
          }
          const { data: pub } = supabase.storage.from("contest-rules").getPublicUrl(filePath);
          // Cache-bust so the new file is fetched immediately
          additionalUpdates.rules_pdf_url = `${pub.publicUrl}?t=${Date.now()}`;
        }

        // Handle secondary/detail image (hero layout) - manual upload only
        let detailPathSaved: string | null = null;
        if (form.detail_image_file) {
          detailPathSaved = await handleImageUpload(form.detail_image_file);
          additionalUpdates.main_prize_secondary_image = detailPathSaved;
        }

        // Handle banner image - manual upload only (uploads into contest-banners bucket)
        if (form.banner_image_file) {
          const bannerPath = await handleImageUpload(form.banner_image_file, "contest-banners");
          additionalUpdates.banner_image = bannerPath;
        }

        // FALLBACK: pokud admin nenahrál samostatný "detail" obrázek a v DB žádný není,
        // použij hlavní obrázek i jako detail/secondary, aby byl detail soutěže vždy plný.
        if (
          !detailPathSaved &&
          imagePath &&
          !((editingContest as any)?.main_prize_secondary_image)
        ) {
          additionalUpdates.main_prize_secondary_image = imagePath;
        }

        // Apply additional updates if any (rules_pdf_url, rules, images).
        // .select('id') lets us detect silent no-ops (0 rows) caused by RLS filtering the row.
        if (Object.keys(additionalUpdates).length > 0) {
          const { data: updatedRows, error: updateError } = await supabase
            .from("contests")
            .update(additionalUpdates)
            .eq("id", contestId)
            .select("id");

          if (updateError || !updatedRows || updatedRows.length === 0) {
            const errMsg = updateError?.message ?? "Soutěž nebyla nalezena nebo přístup odepřen.";
            console.error("Error updating contest extras:", updateError ?? "0 rows affected", { contestId, additionalUpdates });
            const hasRulesPdf = "rules_pdf_url" in additionalUpdates;
            toast({
              title: hasRulesPdf ? "Chyba ukládání pravidel" : "Chyba ukládání pravidel / obrázků",
              description: hasRulesPdf
                ? "Nepodařilo se uložit pravidla soutěže. Zkuste to prosím znovu."
                : `Pravidla soutěže a obrázky se neuložily: ${errMsg}`,
              variant: "destructive",
            });
            if (isEditingContest) {
              // Edit mode: stay open so admin can retry extras
              setSaving(false);
              return;
            }
            // Create mode: contest was persisted by the SECURITY DEFINER RPC — the direct
            // client UPDATE may be blocked by RLS on the freshly-created row.
            // Fall through to onSaved()/onClose() so the modal closes and the contest
            // appears in the list. Admin can reopen and fix extras.
          }
        }

        // AUTO-FLUSH: pokud admin vybral soubor nebo URL v "Přidat nové médium" a neklikl
        // explicitně "Přidat do galerie", zachytíme to tady, aby se to neztratilo.
        const hasUnaddedMedia =
          (newMediaType === "video" && newMediaUrl.trim().length > 0) ||
          ((newMediaType === "image" || newMediaType === "background") && newMediaFile !== null);

        if (hasUnaddedMedia) {
          const tempId = `temp-autoflush-${Date.now()}`;
          let url = newMediaUrl.trim();
          if ((newMediaType === "image" || newMediaType === "background") && newMediaFile) {
            url = URL.createObjectURL(newMediaFile);
            setPendingMediaFiles((prev) => ({ ...prev, [tempId]: newMediaFile }));
          }
          // U "background" nahradíme případnou existující background položku
          setGalleryMedia((prev) => {
            const filtered =
              newMediaType === "background"
                ? prev.filter((m) => m.type !== "background")
                : prev;
            return [...filtered, { id: tempId, type: newMediaType, url, sort_order: newMediaSortOrder }];
          });
          // Reset form inputs
          setNewMediaUrl("");
          setNewMediaFile(null);
        }

        // Flush pending gallery media (only set when creating a new contest)
        // Re-read galleryMedia synchronously by combining with the auto-flushed item above.
        const autoFlushedItem = hasUnaddedMedia
          ? (() => {
              const tempId = `temp-autoflush-${Date.now()}`;
              let url = newMediaUrl.trim();
              const file = (newMediaType === "image" || newMediaType === "background") ? newMediaFile : null;
              if (file) url = URL.createObjectURL(file);
              return { id: tempId, type: newMediaType, url, sort_order: newMediaSortOrder, _file: file };
            })()
          : null;

        const baseItems = galleryMedia.filter((m) => String(m.id).startsWith("temp-"));
        const pendingItems = autoFlushedItem
          ? [
              ...(newMediaType === "background"
                ? baseItems.filter((m) => m.type !== "background")
                : baseItems),
              { id: autoFlushedItem.id, type: autoFlushedItem.type, url: autoFlushedItem.url, sort_order: autoFlushedItem.sort_order },
            ]
          : baseItems;

        // Pokud auto-flush měl File, přidáme ho do lookup mapy pro nahrávání
        const effectivePendingFiles: Record<string, File> = { ...pendingMediaFiles };
        if (autoFlushedItem && autoFlushedItem._file) {
          effectivePendingFiles[autoFlushedItem.id] = autoFlushedItem._file;
        }

        if (pendingItems.length > 0) {
          let okCount = 0;
          let failCount = 0;
          const errorMessages: string[] = [];
          for (const item of pendingItems) {
            try {
              let url = item.url;
              const file = effectivePendingFiles[item.id];
              if (file) {
                const safePendingName = sanitizeStorageFileName(file.name);
                const filePath = `contests/${contestId}/gallery/${Date.now()}-${crypto.randomUUID()}-${safePendingName}`;
                const { error: uploadError } = await supabase.storage
                  .from("contest-images")
                  .upload(filePath, file);
                if (uploadError) throw new Error("Galerii se nepodařilo nahrát. Zkuste soubor přejmenovat bez speciálních znaků.");
                const { data: pub } = supabase.storage.from("contest-images").getPublicUrl(filePath);
                url = pub.publicUrl;
              }
              const { error: insertError } = await supabase.from("contest_media").insert({
                contest_id: contestId,
                type: item.type,
                url,
                sort_order: item.sort_order,
              });
              if (insertError) throw insertError;
              okCount++;
            } catch (err: any) {
              console.error("Error flushing pending media:", err);
              failCount++;
              const msg = err?.message || String(err);
              if (!errorMessages.includes(msg)) errorMessages.push(msg);
            }
          }
          setPendingMediaFiles({});
          if (failCount > 0) {
            toast({
              title: "Galerie se neuložila",
              description: `Uloženo ${okCount}, selhalo ${failCount}. Chyba: ${errorMessages.slice(0, 2).join(" | ")}`,
              variant: "destructive",
            });
          }
        }
      }

      // Persist contest economy assumptions (Phase 4).
      // This is non-blocking: a failure logs a warning but does not abort the save.
      if (contestId) {
        const { error: econSaveError } = await supabase
          .from("contest_economy")
          .upsert(
            {
              contest_id: contestId,
              main_prize_cost_czk: economyAssumptions.mainPrizeRealCost,
              miocoin_real_cost_czk: effectiveMioCoinCost,
              vat_rate_percent: economyAssumptions.vatRate,
              setup_cost_czk: economyAssumptions.setupCost,
              marketing_percent: economyAssumptions.marketingPercent,
              default_handling_czk: economyAssumptions.handlingCostPerPhysicalPrize,
              target_margin_percent: economyAssumptions.targetMarginPercent,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "contest_id" }
          );
        if (econSaveError) {
          console.error("Error saving economy assumptions:", econSaveError);
          // Non-fatal: economy data is planning-only; does not block contest save.
          toast({
            title: "Soutěž uložena",
            description: "Ekonomická data se nepodařilo uložit. Zkontrolujte konzoli a zkuste znovu.",
            variant: "destructive",
          });
        }
      }

      // Guard: generator inputs filled but "Vygenerovat MioCoiny" never clicked.
      // Saving in this state would silently persist 0 MioCoin rows — block and warn.
      const mioCoinGeneratorHasInput =
        totalMioCoinsInput > 0 || stepValue > 0 || distributionType !== "even";

      if (mioCoinBonuses.length === 0 && (mioCoinGeneratorTouched || mioCoinGeneratorHasInput)) {
        console.warn(
          "[AdminContestManagement] MioCoin save guard triggered — generator touched/filled but bonuses not generated.",
          { totalMioCoinsInput, stepValue, distributionType, computedPositionCount, mioCoinGeneratorTouched }
        );
        toast({
          title: "MioCoin bonusy nejsou vygenerované",
          description:
            "Upravil(a) jste nastavení MioCoin bonusů, ale preview pozice nejsou vygenerované. Klikněte nejdřív na 'Vygenerovat MioCoiny' a potom soutěž uložte.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Save bonuses if we have a contest ID
      if (contestId) {
        // Delete existing bonuses for this contest.
        // Edit mode keeps already-materialized MioCoin rows immutable.
        if (hasImmutablePersistedMioCoinBonuses) {
          await supabase
            .from("bonus_prizes")
            .delete()
            .eq("contest_id", contestId)
            .or("amount.is.null,amount.eq.0");
        } else {
          await supabase.from("bonus_prizes").delete().eq("contest_id", contestId);
        }

        // Insert physical prizes FIRST so MioCoin generation excludes their positions
        for (const prize of physicalPrizes) {
          let imageUrl = prize.image_url;

          // Upload image if file exists
          if (prize.image_file) {
            const ext = prize.image_file.name.split(".").pop();
            const fileName = `bonus-prizes/${contestId}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("contest-images")
              .upload(fileName, prize.image_file);

            if (uploadError) {
              throw new Error(`Chyba při nahrávání obrázku: ${uploadError.message}`);
            }
            imageUrl = fileName;
          }

          // Insert bonus prize record via RPC
          const { data: insertData, error: insertError } = await supabase.rpc("admin_manage_bonus_prize", {
            p_contest_id: contestId,
            p_ticket_position: prize.ticket_position,
            p_description: prize.description,
            p_detailed_description: prize.detailed_description ?? null,
            p_status: "pending",
            p_operation: "create",
            p_image_url: imageUrl ?? null,
          });

          if (insertError) {
            throw new Error(`Chyba při ukládání výhry: ${insertError.message}`);
          }
          // RPC catches exceptions internally and returns {success:false, message:...}
          if (insertData && (insertData as any).success === false) {
            throw new Error(`Chyba při ukládání výhry: ${(insertData as any).message}`);
          }

          // Persist economy metadata for this physical prize (Phase 4).
          // Non-blocking: a failure is logged but does not abort the save.
          const savedPrizeId = (insertData as any)?.prize_id as string | undefined;
          if (savedPrizeId) {
            const { error: econPrizeError } = await supabase
              .from("bonus_prizes")
              .update({
                supplier_name: prize.supplier_name ?? null,
                unit_cost_czk: prize.unit_cost_czk ?? null,
                vat_rate_percent: prize.vat_rate ?? null,
                handling_override_czk: prize.handling_override_czk ?? null,
              })
              .eq("id", savedPrizeId);
            if (econPrizeError) {
              console.error("Error saving physical prize economy data:", econPrizeError);
              toast({
                title: "Soutěž uložena",
                description: "Ekonomická data fyzické výhry se nepodařilo uložit. Zkontrolujte konzoli a zkuste znovu.",
                variant: "destructive",
              });
            }
          }
        }

        // Persist MioCoin bonuses via the chunked three-call SQL RPC pattern.
        //
        // Issue #71: A single synchronous RPC carrying ~95k positions could not
        // finish under the Supabase API gateway HTTP timeout (~60s), even after
        // PRs #65/#66/#68/#76 optimised the underlying function. The chunked
        // pattern splits the save so each call finishes well under the gateway
        // budget:
        //   1. admin_begin_miocoin_save     — wipe stale rows, reset total
        //   2. admin_append_miocoin_chunk   — insert one chunk (~5 000 rows)
        //   3. admin_finalize_miocoin_save  — verify count, sync total, write log
        //
        // The legacy admin_bulk_insert_miocoin_bonuses remains in place untouched
        // for any other callers; only this save path migrates to the chunked flow.
        if (mioCoinBonuses.length > 0 && !hasImmutablePersistedMioCoinBonuses) {
          const bonusPayload = mioCoinBonuses.map(({ ticket_position, amount }) => ({
            ticket_position,
            amount,
          }));
          const expectedCount = bonusPayload.length;
          // CHUNK_SIZE = 500: production test23 with 5 000 still hit the Supabase
          // API gateway HTTP timeout on chunk 1/9. Lowered to 500 so each
          // append RPC finishes comfortably under the gateway budget.
          const CHUNK_SIZE = 500;

          // 1) Begin: wipe stale rows + reset total + audit row
          const { data: beginResult, error: beginError } = await supabase.rpc(
            "admin_begin_miocoin_save",
            {
              p_contest_id: contestId,
              p_expected_count: expectedCount,
            }
          );
          if (beginError) {
            throw new Error(`Chyba při ukládání MioCoin bonusů (begin): ${beginError.message}`);
          }
          if (!beginResult?.success) {
            throw new Error(
              `Chyba při ukládání MioCoin bonusů (begin): ${beginResult?.message || "Nepodařilo se zahájit ukládání MioCoin bonusů"}`
            );
          }

          // 2) Append chunks sequentially
          for (let i = 0; i < bonusPayload.length; i += CHUNK_SIZE) {
            const chunk = bonusPayload.slice(i, i + CHUNK_SIZE);
            const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
            const totalChunks = Math.ceil(bonusPayload.length / CHUNK_SIZE);

            const { data: chunkResult, error: chunkError } = await supabase.rpc(
              "admin_append_miocoin_chunk",
              {
                p_contest_id: contestId,
                p_bonuses: chunk,
              }
            );
            if (chunkError) {
              throw new Error(
                `Chyba při ukládání MioCoin bonusů (chunk ${chunkIndex}/${totalChunks}): ${chunkError.message}`
              );
            }
            if (!chunkResult?.success) {
              throw new Error(
                `Chyba při ukládání MioCoin bonusů (chunk ${chunkIndex}/${totalChunks}): ${chunkResult?.message || "Nepodařilo se uložit chunk MioCoin bonusů"}`
              );
            }
          }

          // 3) Finalize: verify exact count, sync total, write final audit row.
          //    Save is only considered successful if finalize returns success.
          const { data: finalizeResult, error: finalizeError } = await supabase.rpc(
            "admin_finalize_miocoin_save",
            {
              p_contest_id: contestId,
              p_expected_count: expectedCount,
            }
          );
          if (finalizeError) {
            throw new Error(`Chyba při ukládání MioCoin bonusů (finalize): ${finalizeError.message}`);
          }
          if (!finalizeResult?.success) {
            throw new Error(
              `Chyba při ukládání MioCoin bonusů (finalize): ${finalizeResult?.message || "Finalizace MioCoin save selhala"}`
            );
          }
        }
      }

      toast({
        title: isEditing ? "Soutěž aktualizována" : "Soutěž vytvořena",
        description: isEditing ? "Změny byly úspěšně uloženy." : "Nová soutěž byla úspěšně uložena.",
      });

      // After successful save: clear draft + reset form to defaults (new contests only)
      if (!isEditing) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {}
        setForm({
          title: "",
          description: "",
          rules: "",
          rules_pdf_file: null,
          rules_pdf_url: "",
          main_prize: "",
          ticket_count: 1000000,
          ticket_price: 1,
          status: "pending",
          main_image_file: null,
          banner_image_file: null,
          detail_image_file: null,
          main_image_url: "",
          banner_image_url: "",
          detail_image_url: "",
          fast_game: false,
        });
        setMioCoinBonuses([]);
        setPhysicalPrizes([]);
        setGalleryMedia([]);
        setPendingMediaFiles({});
        setTotalMioCoinsInput(0);
        setStepValue(0);
        setDistributionType("even");
        setMioCoinGeneratorTouched(false);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Error saving contest:", err);
      // If a contest was already persisted in CREATE mode and a later step threw,
      // force-close the modal so a retry click cannot create a duplicate contest.
      // The admin must reopen the contest in EDIT mode (Archiv test) to fix missing data.
      if (createdContestIdInCreateMode) {
        toast({
          title: "Soutěž byla vytvořena, ale ne vše se uložilo",
          description:
            (err?.message ? err.message + " " : "") +
            "Otevřete soutěž v Archivu test a doplňte chybějící údaje (např. MioCoin bonusy).",
          variant: "destructive",
        });
        onSaved();
        onClose();
      } else {
        toast({
          title: "Chyba",
          description: err?.message || "Nepodařilo se uložit soutěž. Zkus to prosím znovu.",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!editingContest;
  const totalMioCoins = mioCoinBonuses.reduce((sum, b) => sum + b.amount, 0);
  // Effective MioCoin cost for Economy calculations:
  //   1. If MioCoin bonuses are configured → use their actual total (totalMioCoins)
  //   2. Else if the bulk MioCoin input field has a value → use that
  //   3. Else fall back to the manually entered economy assumption
  const effectiveMioCoinCost =
    mioCoinBonuses.length > 0
      ? totalMioCoins
      : totalMioCoinsInput > 0
        ? totalMioCoinsInput
        : economyAssumptions.mioCoinRealCost;
  const getHandlingCostForPrize = (prize: PhysicalPrize) =>
    prize.handling_override_czk != null
      ? Math.max(0, prize.handling_override_czk)
      : Math.max(0, economyAssumptions.handlingCostPerPhysicalPrize || 0);
  const getPhysicalPrizeCostIncludingVat = (prize: PhysicalPrize) => {
    const unitCostWithoutVat = Math.max(0, prize.unit_cost_czk || 0);
    const prizeVatRate = Math.max(0, prize.vat_rate ?? 21);
    return unitCostWithoutVat * (1 + prizeVatRate / 100);
  };
  const physicalPrizeBaseCost = physicalPrizes.reduce((sum, prize) => sum + getPhysicalPrizeCostIncludingVat(prize), 0);
  const grossRevenue = Math.max(0, form.ticket_count || 0) * Math.max(0, form.ticket_price || 0);
  const vatRate = Math.max(0, economyAssumptions.vatRate || 0);
  const vatFromRevenue = grossRevenue > 0 ? (grossRevenue * vatRate) / (100 + vatRate) : 0;
  const netRevenue = grossRevenue - vatFromRevenue;
  const netTicketRevenue = Math.max(0, form.ticket_price || 0) - ((Math.max(0, form.ticket_price || 0) * vatRate) / (100 + vatRate));
  const marketingCost = grossRevenue * Math.max(0, economyAssumptions.marketingPercent || 0) / 100;
  const physicalBonusEstimatedCost = physicalPrizeBaseCost;
  const handlingCostTotal = physicalPrizes.reduce(
    (sum, prize) => sum + getHandlingCostForPrize(prize),
    0
  );
  const totalEstimatedCost =
    Math.max(0, economyAssumptions.mainPrizeRealCost || 0) +
    Math.max(0, effectiveMioCoinCost || 0) +
    physicalBonusEstimatedCost +
    handlingCostTotal +
    Math.max(0, economyAssumptions.setupCost || 0) +
    marketingCost;
  const estimatedProfit = netRevenue - totalEstimatedCost;
  const marginPercent = netRevenue > 0 ? (estimatedProfit / netRevenue) * 100 : 0;
  const breakEvenTickets = netTicketRevenue > 0 ? Math.ceil(totalEstimatedCost / netTicketRevenue) : 0;
  const targetMarginRatio = Math.min(Math.max(economyAssumptions.targetMarginPercent || 0, 0), 95) / 100;
  const requiredNetRevenueForTarget = form.ticket_count > 0 ? totalEstimatedCost / (1 - targetMarginRatio) : 0;
  const recommendedTicketPrice =
    form.ticket_count > 0
      ? (requiredNetRevenueForTarget / form.ticket_count) * (1 + vatRate / 100)
      : 0;
  const formatCzk = (value: number) =>
    `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
  const formatPercent = (value: number) =>
    `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
  const updateEconomyAssumption =
    (field: keyof EconomyAssumptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setEconomyAssumptions((prev) => ({
        ...prev,
        [field]: Number(e.target.value || 0),
      }));
    };
  const economyWarnings = [
    estimatedProfit < 0 && "Marže je záporná. Odhadované náklady jsou vyšší než čistá tržba.",
    estimatedProfit >= 0 &&
      marginPercent < economyAssumptions.targetMarginPercent &&
      "Marže je nižší než cílová marže.",
    form.ticket_count > 0 &&
      breakEvenTickets > form.ticket_count &&
      "Bod zvratu je vyšší než počet dostupných ticketů.",
  ].filter(Boolean) as string[];
  const hasEconomyWarning = estimatedProfit < 0 || marginPercent < economyAssumptions.targetMarginPercent;
  const economySummaryClass = hasEconomyWarning
    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-100"
    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-50";

  // Validation logic for each tab
  const hasMainImage = !!(form.main_image_file || form.main_image_url || (isEditing && editingContest?.main_image));

  const validation = {
    basic: {
      isValid: !!(form.title.trim() && form.main_prize.trim() && form.ticket_count > 0 && form.ticket_price > 0),
      errors: [
        !form.title.trim() && "Název soutěže",
        !form.main_prize.trim() && "Hlavní výhra",
        form.ticket_count <= 0 && "Počet tiketů",
        form.ticket_price <= 0 && "Cena tiketu",
      ].filter(Boolean) as string[],
    },
    graphics: {
      isValid: hasMainImage,
      errors: [!hasMainImage && "Hlavní obrázek"].filter(Boolean) as string[],
    },
  };

  const isFormValid = validation.basic.isValid && validation.graphics.isValid;

  const TabIndicator = ({ isValid }: { isValid: boolean }) => (
    <span
      className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full ${isValid ? "text-green-500" : "text-red-500"}`}
    >
      {isValid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) attemptClose(); }}>
      <DialogContent
        className="max-w-[95vw] h-[90vh] flex flex-col p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
          <DialogTitle>{isEditing ? "Upravit soutěž" : "Vytvořit novou soutěž"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 px-6">
          <div className="shrink-0 py-4 space-y-3">
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 rounded-lg border p-3 ${economySummaryClass}`}>
              {[
                ["Počet ticketů", `${Math.max(0, form.ticket_count || 0).toLocaleString("cs-CZ")}`],
                ["Celkové odhadované náklady", formatCzk(totalEstimatedCost)],
                [
                  "Doporučená cena ticketu",
                  `${recommendedTicketPrice.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`,
                ],
                ["Odhadovaný čistý zisk", formatCzk(estimatedProfit)],
                ["Marže", formatPercent(marginPercent)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
            <TabsList className="flex flex-wrap h-auto w-full gap-1">
              <TabsTrigger value="basic" className="flex items-center">
                Základní údaje
                <TabIndicator isValid={validation.basic.isValid} />
              </TabsTrigger>
              <TabsTrigger value="bonus-coins">Bonusy – MioCoins</TabsTrigger>
              <TabsTrigger value="bonus-physical">Bonusy – věcné</TabsTrigger>
              <TabsTrigger value="economy">Ekonomika</TabsTrigger>
              <TabsTrigger value="graphics" className="flex items-center">
                Grafika
                <TabIndicator isValid={validation.graphics.isValid} />
              </TabsTrigger>
              <TabsTrigger value="create">Vytvořit soutěž</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 pb-4 min-h-0">
            {/* Tab 1: Základní údaje */}
            <TabsContent value="basic" className="space-y-4 mt-0">
              <div>
                <Label>Název soutěže</Label>
                <Input value={form.title} onChange={handleTitleChange} placeholder="Např. Corvette C8" />
              </div>

              <div>
                <Label>Hlavní výhra</Label>
                <Input value={form.main_prize} onChange={handleChange("main_prize")} placeholder="Např. Corvette C8" />
                <p className="text-xs text-muted-foreground mt-1">Automaticky předvyplněno z názvu soutěže</p>
              </div>

              <div>
                <Label>Náklad na hlavní výhru v Kč</Label>
                <Input
                  type="number"
                  min={0}
                  value={economyAssumptions.mainPrizeRealCost}
                  onChange={updateEconomyAssumption("mainPrizeRealCost")}
                  onFocus={handleNumericFocus}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">Pořizovací náklad hlavní výhry — použije se v ekonomické kalkulaci.</p>
              </div>

              {/* Popis soutěže */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Popis soutěže</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generatingDescription || (!form.title && !form.main_prize)}
                    className="text-xs"
                  >
                    {generatingDescription ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        Generuji…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-3 w-3" />
                        Vygenerovat AI popis
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={form.description}
                  onChange={handleChange("description")}
                  placeholder="Stručný popis soutěže… Nebo klikni na tlačítko pro AI generování."
                  rows={4}
                />
              </div>

              <div>
                <Label>Pravidla soutěže (PDF) <span className="text-red-400">*</span></Label>
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setForm((prev) => ({ ...prev, rules_pdf_file: file }));
                  }}
                />
                {form.rules_pdf_url && !form.rules_pdf_file && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Aktuální PDF:{" "}
                    <a href={form.rules_pdf_url} target="_blank" rel="noopener noreferrer" className="underline text-primary">
                      Zobrazit
                    </a>
                  </p>
                )}
                {form.rules_pdf_file && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Vybráno: {form.rules_pdf_file.name}
                  </p>
                )}
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>Počet tiketů</Label>
                  <Input type="number" min={1} value={form.ticket_count} onChange={handleChange("ticket_count")} onFocus={handleNumericFocus} />
                </div>
                <div className="flex-1">
                  <Label>Cena tiketu (MioCoins)</Label>
                  <Input type="number" min={1} value={form.ticket_price} onChange={handleChange("ticket_price")} onFocus={handleNumericFocus} />
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Vyber status" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700 z-50">
                    {SELECTABLE_STATUS_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:text-white cursor-pointer"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="fast_game"
                  checked={form.fast_game}
                  onChange={(e) => setForm((f) => ({ ...f, fast_game: e.target.checked }))}
                />
                <label htmlFor="fast_game" className="text-sm text-white">Fast game</label>
              </div>
            </TabsContent>

            {/* Tab 2: Bonusy – MioCoins */}
            <TabsContent value="bonus-coins" className="space-y-4 mt-0">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="h-5 w-5 text-yellow-500" />
                <span className="font-medium">MioCoin bonusy</span>
                <Badge variant="secondary" className="ml-auto">
                  Celkem: {totalMioCoins.toLocaleString("cs-CZ")} MC ({mioCoinBonuses.length} pozic)
                </Badge>
              </div>

              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Celkový počet MioCoinů ve hře</Label>
                    <Input
                      type="number"
                      min={1}
                      value={totalMioCoinsInput}
                      onChange={(e) => {
                        setMioCoinGeneratorTouched(true);
                        setTotalMioCoinsInput(Number(e.target.value));
                      }}
                      onFocus={handleNumericFocus}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Hodnota jednoho bonusu (po kolika)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={stepValue}
                      onChange={(e) => {
                        setMioCoinGeneratorTouched(true);
                        setStepValue(Number(e.target.value));
                      }}
                      onFocus={handleNumericFocus}
                    />
                  </div>
                </div>

                {totalMioCoinsInput > 0 && stepValue > 0 && (
                  <div className="bg-muted/30 rounded-md p-3 text-sm">
                    <span className="text-muted-foreground">Počet pozic: </span>
                    <span className="font-medium text-foreground">{computedPositionCount.toLocaleString("cs-CZ")}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Typ rozmístění</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="distributionType"
                        value="even"
                        checked={distributionType === "even"}
                        onChange={() => {
                          setMioCoinGeneratorTouched(true);
                          setDistributionType("even");
                        }}
                        className="w-4 h-4 accent-primary"
                      />
                      <span>Rovnoměrně</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="distributionType"
                        value="random"
                        checked={distributionType === "random"}
                        onChange={() => {
                          setMioCoinGeneratorTouched(true);
                          setDistributionType("random");
                        }}
                        className="w-4 h-4 accent-primary"
                      />
                      <span>Náhodně</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={generateMioCoinBonuses} className="flex-1" disabled={computedPositionCount <= 0}>
                    <Coins className="mr-2 h-4 w-4" />
                    Vygenerovat MioCoiny
                  </Button>
                  <Button variant="outline" onClick={clearMioCoinBonuses} disabled={mioCoinBonuses.length === 0}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Smazat vše
                  </Button>
                </div>
              </div>

              {mioCoinBonuses.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Vygenerováno {mioCoinBonuses.length} pozic s celkovou hodnotou {totalMioCoins.toLocaleString("cs-CZ")}{" "}
                  MioCoinů.
                </div>
              )}
            </TabsContent>

            {/* Tab 3: Bonusy – věcné */}
            <TabsContent value="bonus-physical" className="space-y-4 mt-0">
              <div className="font-medium mb-2">Věcné bonusové výhry</div>

              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-4">
                <div>
                  <Label>Popis výhry</Label>
                  <Input
                    value={newPhysicalPrize.description}
                    onChange={(e) => setNewPhysicalPrize((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Např. iPhone 15 Pro"
                  />
                </div>

                <div>
                  <Label>Detailní popis bonusové výhry</Label>
                  <Textarea
                    value={newPhysicalPrize.detailed_description || ""}
                    onChange={(e) => setNewPhysicalPrize((prev) => ({ ...prev, detailed_description: e.target.value }))}
                    placeholder="Kompletní popis produktu, který se zobrazí v modalu po kliknutí na výhru..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Dodavatel</Label>
                    <Input
                      value={newPhysicalPrize.supplier_name || ""}
                      onChange={(e) => setNewPhysicalPrize((prev) => ({ ...prev, supplier_name: e.target.value }))}
                      placeholder="Např. Apple Premium Reseller"
                    />
                  </div>
                  <div>
                    <Label>Nákupní cena bez DPH v Kč</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newPhysicalPrize.unit_cost_czk ?? 0}
                      onChange={(e) =>
                        setNewPhysicalPrize((prev) => ({ ...prev, unit_cost_czk: Number(e.target.value || 0) }))
                      }
                      onFocus={handleNumericFocus}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>DPH v %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={newPhysicalPrize.vat_rate ?? 21}
                      onChange={(e) =>
                        setNewPhysicalPrize((prev) => ({ ...prev, vat_rate: Number(e.target.value || 0) }))
                      }
                      onFocus={handleNumericFocus}
                    />
                  </div>
                  <div>
                    <Label>Balné / pošta / práce (override v Kč)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newPhysicalPrize.handling_override_czk ?? ""}
                      onChange={(e) =>
                        setNewPhysicalPrize((prev) => ({
                          ...prev,
                          handling_override_czk: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      onFocus={handleNumericFocus}
                      placeholder={`Jinak se použije ${Math.max(0, economyAssumptions.handlingCostPerPhysicalPrize || 0).toLocaleString("cs-CZ")} Kč`}
                    />
                  </div>
                </div>

                {/* Počet kusů + distribution — always visible */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Počet kusů</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={physicalPrizeQuantity}
                      onChange={(e) =>
                        setPhysicalPrizeQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                      }
                      onFocus={handleNumericFocus}
                      placeholder="1"
                    />
                  </div>
                  {physicalPrizeQuantity > 1 && (
                    <div>
                      <Label>Rozmístění pozic</Label>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="physicalDistribution"
                            value="even"
                            checked={physicalPrizeDistribution === "even"}
                            onChange={() => setPhysicalPrizeDistribution("even")}
                          />
                          Rovnoměrně
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="physicalDistribution"
                            value="random"
                            checked={physicalPrizeDistribution === "random"}
                            onChange={() => setPhysicalPrizeDistribution("random")}
                          />
                          Náhodně
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pozice tiketu — only for single prize */}
                {physicalPrizeQuantity === 1 && (
                  <div>
                    <Label>Pozice tiketu</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newPhysicalPrize.ticket_position}
                      onChange={(e) =>
                        setNewPhysicalPrize((prev) => ({ ...prev, ticket_position: Number(e.target.value) }))
                      }
                      onFocus={handleNumericFocus}
                    />
                  </div>
                )}

                {physicalPrizeQuantity > 1 && form.ticket_count > 1 && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground">
                    Pozice budou automaticky přiřazeny z {form.ticket_count - 1} tiketů (1–{form.ticket_count - 1}),
                    s vyloučením již obsazených pozic. Volných pozic:{" "}
                    {Math.max(
                      0,
                      (form.ticket_count - 1) -
                        physicalPrizes.length -
                        mioCoinBonuses.length
                    ).toLocaleString("cs-CZ")}.
                  </div>
                )}

                <div>
                  <Label>Obrázek výhry (volitelné)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setNewPhysicalPrize((prev) => ({ ...prev, image_file: e.target.files?.[0] || null }))
                    }
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground">
                  Nákupní cena se zadává bez DPH; do nákladů se počítá včetně DPH. Ekonomická metadata se ukládají do Supabase při uložení soutěže.
                </div>

                <Button onClick={addPhysicalPrize} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {physicalPrizeQuantity > 1
                    ? `Přidat ${physicalPrizeQuantity} věcných výher`
                    : "Přidat věcnou výhru"}
                </Button>
              </div>

              {physicalPrizes.length > 0 && (
                <div className="space-y-2">
                  <Label>Přidané výhry ({physicalPrizes.length})</Label>
                {physicalPrizes.map((prize, index) => {
                    const thumbnailSrc =
                      (prize.image_file ? URL.createObjectURL(prize.image_file) : null) ||
                      prize.image_url ||
                      null;

                    return (
                      <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-3">
                          {thumbnailSrc && (
                            <img
                              src={thumbnailSrc}
                              alt={prize.description}
                              className="w-10 h-10 rounded object-cover border border-white/10"
                            />
                          )}
                          <div className="flex flex-col">
                            <div>
                              <span className="font-medium">{prize.description}</span>
                              <span className="text-muted-foreground ml-2">Pozice #{prize.ticket_position}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Dodavatel: {prize.supplier_name?.trim() || "neuvedený"} · Nákupní cena bez DPH:{" "}
                              {formatCzk(prize.unit_cost_czk || 0)} · DPH: {(prize.vat_rate ?? 21).toLocaleString("cs-CZ")} % ·
                              {" "}Náklad včetně DPH: {formatCzk(getPhysicalPrizeCostIncludingVat(prize))} ·
                              {" "}Balné: {formatCzk(getHandlingCostForPrize(prize))}
                              {prize.handling_override_czk != null ? " (override)" : " (globální default)"}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePhysicalPrize(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Tab 4: Ekonomika */}
            <TabsContent value="economy" className="space-y-4 mt-0">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <span className="font-medium">Ekonomika soutěže</span>
                <Badge variant="secondary" className="ml-auto">
                  Pouze náhled
                </Badge>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
                Výpočet je orientační a neukládá se. Používá aktuální počet ticketů, cenu ticketu a níže uvedené
                plánovací předpoklady.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Reálný náklad na MioCoin bonusy v Kč</Label>
                  <Input
                    type="number"
                    min={0}
                    value={effectiveMioCoinCost}
                    readOnly
                    className="opacity-70 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Počítá se automaticky podle záložky Bonusy – MioCoins.
                  </p>
                </div>
                <div>
                  <Label>Sazba DPH v %</Label>
                  <Input
                    type="number"
                    min={0}
                    value={economyAssumptions.vatRate}
                    onChange={updateEconomyAssumption("vatRate")}
                    onFocus={handleNumericFocus}
                  />
                </div>
                <div>
                  <Label>Jednorázový náklad soutěže v Kč</Label>
                  <Input
                    type="number"
                    min={0}
                    value={economyAssumptions.setupCost}
                    onChange={updateEconomyAssumption("setupCost")}
                    onFocus={handleNumericFocus}
                  />
                </div>
                <div>
                  <Label>Marketingový náklad v %</Label>
                  <Input
                    type="number"
                    min={0}
                    value={economyAssumptions.marketingPercent}
                    onChange={updateEconomyAssumption("marketingPercent")}
                    onFocus={handleNumericFocus}
                  />
                </div>
                <div>
                  <Label>Balné / pošta / práce na věcnou výhru v Kč</Label>
                  <Input
                    type="number"
                    min={0}
                    value={economyAssumptions.handlingCostPerPhysicalPrize}
                    onChange={updateEconomyAssumption("handlingCostPerPhysicalPrize")}
                    onFocus={handleNumericFocus}
                  />
                </div>
                <div>
                  <Label>Cílová marže v %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={95}
                    value={economyAssumptions.targetMarginPercent}
                    onChange={updateEconomyAssumption("targetMarginPercent")}
                    onFocus={handleNumericFocus}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["Hrubá tržba včetně DPH", formatCzk(grossRevenue)],
                  ["DPH z tržby", formatCzk(vatFromRevenue)],
                  ["Čistá tržba bez DPH", formatCzk(netRevenue)],
                  ["Náklad na hlavní výhru", formatCzk(economyAssumptions.mainPrizeRealCost)],
                  ["Náklad na MioCoin bonusy", formatCzk(effectiveMioCoinCost)],
                  ["Odhad nákladů na věcné bonusové výhry", formatCzk(physicalBonusEstimatedCost)],
                  ["Balné / pošta / práce", formatCzk(handlingCostTotal)],
                  ["Jednorázový náklad soutěže", formatCzk(economyAssumptions.setupCost)],
                  ["Marketingový náklad", formatCzk(marketingCost)],
                  ["Celkové odhadované náklady", formatCzk(totalEstimatedCost)],
                  ["Odhadovaný zisk", formatCzk(estimatedProfit)],
                  ["Marže", formatPercent(marginPercent)],
                  ["Bod zvratu v počtu ticketů", `${breakEvenTickets.toLocaleString("cs-CZ")} ticketů`],
                  ["Doporučená minimální cena ticketu", `${recommendedTicketPrice.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold text-foreground text-right">{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-white/10 bg-muted/20 p-3 text-sm text-muted-foreground">
                Věcné bonusové výhry: {physicalPrizes.length.toLocaleString("cs-CZ")} položek. MioCoin bonusy:{" "}
                {totalMioCoins.toLocaleString("cs-CZ")} MC na {mioCoinBonuses.length.toLocaleString("cs-CZ")} pozicích.
                Nákupní ceny věcných výher zatím nejsou v této fázi modelované.
              </div>

              {economyWarnings.length > 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-300">
                    <AlertCircle className="h-4 w-4" />
                    Varování ekonomiky
                  </div>
                  <ul className="ml-5 list-disc space-y-1 text-sm text-yellow-100/90">
                    {economyWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            {/* Tab 4: Grafika */}
            <TabsContent value="graphics" className="space-y-6 mt-0">
              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Hlavní obrázek výhry</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Nahraj obrázek hlavní výhry pro zobrazení v seznamu soutěží.
                </p>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange("main_image_file")}
                />
                {form.main_image_file && (
                  <p className="text-xs text-green-500">Vybrán soubor: {form.main_image_file.name}</p>
                )}
                {isEditing && editingContest?.main_image && !form.main_image_file && (
                  <p className="text-xs text-muted-foreground">Aktuální: {editingContest.main_image}</p>
                )}
              </div>

              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-4">
                <Label className="text-base font-medium">Detail obrázek (hero)</Label>
                <p className="text-xs text-muted-foreground">
                  Obrázek pro detail soutěže (main_prize_secondary_image).
                </p>
                <Input type="file" accept="image/*" onChange={handleFileChange("detail_image_file")} />
                {form.detail_image_file && (
                  <p className="text-xs text-green-500">Vybrán soubor: {form.detail_image_file.name}</p>
                )}
              </div>

              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-4">
                <Label className="text-base font-medium">Banner obrázek</Label>
                <p className="text-xs text-muted-foreground">
                  Obrázek banneru pro homepage a přehled soutěží.
                </p>
                <Input type="file" accept="image/*" onChange={handleFileChange("banner_image_file")} />
                {form.banner_image_file && (
                  <p className="text-xs text-green-500">Vybrán soubor: {form.banner_image_file.name}</p>
                )}
              </div>

              {/* Gallery section */}
              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    <Label className="text-base font-medium">Galerie hlavní výhry</Label>
                  </div>
                  {galleryMedia.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {galleryMedia.length} {galleryMedia.length === 1 ? "položka" : galleryMedia.length < 5 ? "položky" : "položek"}
                    </Badge>
                  )}
                </div>

                <>
                  {!editingContest && (
                    <p className="text-xs text-muted-foreground">
                      Přidaná média se uloží do galerie po vytvoření soutěže.
                    </p>
                  )}
                  <>
                    {/* Existing media list */}
                    {loadingMedia ? (
                      <div className="flex items-center justify-center py-6 gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Načítám galerii…</span>
                      </div>
                    ) : galleryMedia.length > 0 ? (
                      <div className="space-y-1.5">
                        {galleryMedia.map((media) => {
                          const isImage = media.type === "image" || media.type === "background";
                          const isDeleting = deletingMediaId === media.id;
                          const isTemp = media.id.startsWith("temp-");

                          return (
                            <div
                              key={media.id}
                              className={`flex items-center gap-3 p-2 rounded-lg border border-border/30 bg-muted/20 transition-opacity ${isDeleting || isTemp ? "opacity-50" : ""}`}
                            >
                              {/* Thumbnail */}
                              <div className="w-10 h-10 rounded bg-muted/40 shrink-0 overflow-hidden flex items-center justify-center">
                                {isImage ? (
                                  <img src={media.url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-lg">{media.type === "video" ? "▶" : "🖼"}</span>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                    {media.type === "image" ? "Obrázek" : media.type === "video" ? "Video" : "Pozadí"}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground shrink-0">Pořadí: {media.sort_order}</span>
                                </div>
                                <span className="text-xs text-muted-foreground truncate mt-0.5">{media.url}</span>
                              </div>

                              {/* Delete */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteMedia(media.id)}
                                disabled={isDeleting}
                                className="shrink-0 h-8 w-8 p-0"
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-3 text-center">Žádná média v galerii.</p>
                    )}

                    {/* Add new media form */}
                    <div className="border-t border-border/30 pt-4 mt-2 space-y-3">
                      <Label className="text-sm font-medium text-muted-foreground">Přidat nové médium</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Typ</Label>
                          <Select value={newMediaType} onValueChange={setNewMediaType}>
                            <SelectTrigger className="bg-background h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-800 border-neutral-700 z-50">
                              <SelectItem value="image" className="text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:text-white cursor-pointer">Obrázek</SelectItem>
                              <SelectItem value="video" className="text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:text-white cursor-pointer">Video (YouTube)</SelectItem>
                              <SelectItem value="background" className="text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:text-white cursor-pointer">Pozadí</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Pořadí</Label>
                          <Input
                            type="number"
                            min={0}
                            value={newMediaSortOrder}
                            onChange={(e) => setNewMediaSortOrder(Number(e.target.value))}
                            onFocus={handleNumericFocus}
                            className="h-9"
                          />
                        </div>
                      </div>
                      {newMediaType === "background" ? (
                        <div>
                          <Label className="text-xs">Nahrát obrázek (pozadí)</Label>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setNewMediaFile(e.target.files?.[0] || null)}
                          />
                        </div>
                      ) : newMediaType === "image" ? (
                        <div>
                          <Label className="text-xs">Nahrát obrázek</Label>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setNewMediaFile(e.target.files?.[0] || null)}
                          />
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">URL (YouTube nebo obrázek)</Label>
                          <Input
                            value={newMediaUrl}
                            onChange={(e) => setNewMediaUrl(e.target.value)}
                            placeholder="https://..."
                            className="h-9"
                          />
                        </div>
                      )}
                      <Button onClick={handleAddMedia} disabled={addingMedia} size="sm" className="w-full">
                        {addingMedia ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                        Přidat do galerie
                      </Button>
                    </div>
                  </>
                </>
              </div>
            </TabsContent>

            {/* Tab: Vytvořit soutěž (summary) */}
            <TabsContent value="create" className="space-y-4 mt-0">
              <div className="font-medium text-lg mb-4">Shrnutí soutěže</div>

              <div className="space-y-3 bg-muted/20 rounded-lg p-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Název:</span>
                  <span className="font-medium">{form.title || "–"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hlavní výhra:</span>
                  <span className="font-medium">{form.main_prize || "–"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Počet tiketů:</span>
                  <span className="font-medium">{form.ticket_count.toLocaleString("cs-CZ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cena tiketu:</span>
                  <span className="font-medium">{form.ticket_price} MC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MioCoin bonusy:</span>
                  <span className="font-medium">
                    {totalMioCoins.toLocaleString("cs-CZ")} MC ({mioCoinBonuses.length} pozic)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Věcné výhry:</span>
                  <span className="font-medium">{physicalPrizes.length} položek</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Galerie:</span>
                  <span className="font-medium">{galleryMedia.length} médií</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium">
                    {STATUS_OPTIONS.find((o) => o.value === form.status)?.label || form.status}
                  </span>
                </div>
              </div>

              {!isFormValid && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Chybějící povinné údaje:
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                    {[...validation.basic.errors, ...validation.graphics.errors].map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button onClick={handleSave} disabled={saving || !isFormValid} className="w-full" size="lg">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Uložit změny" : "Vytvořit soutěž"}
              </Button>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t border-white/10 shrink-0 bg-background gap-2 sm:justify-between">
          <div>
            {isNewContest && (
              <Button
                type="button"
                variant="ghost"
                onClick={clearDraft}
                disabled={saving}
                className="text-destructive hover:text-destructive"
              >
                Smazat rozdělanou práci
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={attemptClose} disabled={saving}>
            Zavřít
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent className="bg-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Zavřít bez uložení?</AlertDialogTitle>
            <AlertDialogDescription>
              Máte nevyplněné údaje. Opravdu chcete zavřít bez uložení?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardAndClose}>Zavřít</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export const AdminContestManagement: React.FC = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState<ContestData[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, ContestViewStats>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContest, setEditingContest] = useState<ContestData | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [closingContest, setClosingContest] = useState<string | null>(null);
  const [deletingContest, setDeletingContest] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contestToDelete, setContestToDelete] = useState<ContestData | null>(null);
  const [archiveTab, setArchiveTab] = useState<"active" | "test" | "closed">("active");
  const [linkedContestIds, setLinkedContestIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoving, setBulkMoving] = useState(false);

  const loadContests = async () => {
    setLoading(true);

    try {
      const [
        contestsRes,
        progressRes,
        revenueRes,
        activityRes,
      ] = await Promise.all([
        supabase
          .from("contests")
          .select("id, title, description, rules, rules_pdf_url, main_prize, main_image, status, ticket_count, ticket_price, total_miocoin_bonus, created_at, updated_at, fast_game")
          .order("created_at", { ascending: false }),
        supabase.from("contest_progress").select("contest_id, tickets_sold, tickets_remaining, sold_percent"),
        supabase.from("contest_revenue").select("contest_id, estimated_revenue"),
        supabase.from("contest_activity_last_24h").select("contest_id, tickets_last_24h, users_last_24h"),
      ]);

      if (contestsRes.error) {
        throw contestsRes.error;
      }

      if (progressRes.error) {
        console.error("Error fetching contest progress:", progressRes.error);
      }

      if (revenueRes.error) {
        console.error("Error fetching contest revenue:", revenueRes.error);
      }

      if (activityRes.error) {
        console.error("Error fetching contest activity:", activityRes.error);
      }

      const progressRows = progressRes.data || [];
      const revenueRows = revenueRes.data || [];
      const activityRows = activityRes.data || [];

      const contestsData: ContestData[] = (contestsRes.data || []).map((contest) => {
        const progress = progressRows.find((row: any) => row.contest_id === contest.id);

        return {
          contest_id: contest.id,
          title: contest.title,
          description: contest.description,
          rules: (contest as any).rules ?? null,
          rules_pdf_url: (contest as any).rules_pdf_url ?? null,
          main_prize: contest.main_prize,
          main_image: contest.main_image,
          status: contest.status,
          ticket_count: contest.ticket_count,
          ticket_price: contest.ticket_price,
          tickets_sold: progress?.tickets_sold ?? 0,
          progress_percentage: progress?.sold_percent ?? 0,
          total_miocoin_bonus: contest.total_miocoin_bonus ?? 0,
          created_at: contest.created_at,
          updated_at: contest.updated_at,
          fast_game: contest.fast_game ?? false,
        };
      });

      // Build per-contest stats map from analytics views
      const newStatsMap: Record<string, ContestViewStats> = {};
      contestsData.forEach((c) => {
        const progress = progressRows.find((r: any) => r.contest_id === c.contest_id);
        const revenue = revenueRows.find((r: any) => r.contest_id === c.contest_id);
        const activity = activityRows.find((r: any) => r.contest_id === c.contest_id);
        newStatsMap[c.contest_id] = {
          tickets_remaining: progress?.tickets_remaining ?? c.ticket_count - c.tickets_sold,
          sold_percent: progress?.sold_percent ?? c.progress_percentage,
          estimated_revenue: revenue?.estimated_revenue ?? 0,
          tickets_last_24h: activity?.tickets_last_24h ?? 0,
          users_last_24h: activity?.users_last_24h ?? 0,
        };
      });
      setStatsMap(newStatsMap);

      // Fetch MioCoin counts per contest using count query (bypasses 1000 row limit)
      const contestIds = contestsData.map(c => c.contest_id);

      // Fetch contest IDs that have ANY row in partner_offer_contests (FK guard for delete)
      if (contestIds.length > 0) {
        const { data: linkedRows } = await supabase
          .from("partner_offer_contests")
          .select("contest_id")
          .in("contest_id", contestIds);
        const linked = new Set((linkedRows || []).map((r: any) => r.contest_id as string));
        setLinkedContestIds(linked);
      } else {
        setLinkedContestIds(new Set());
      }

      // Fix: contests.total_miocoin_bonus is NOT kept in sync by any trigger in production
      // (the referenced trg_sync_total_miocoin_bonus does not exist). When MioCoins are
      // generated via the legacy distribute-bonus-prizes Edge Function (triggered on
      // contest insert) instead of admin_bulk_insert_miocoin_bonuses, the column stays at 0
      // even though bonus_prizes contains tens of thousands of MioCoin rows.
      // Compute the real sum from bonus_prizes and override the displayed value.
      if (contestIds.length > 0) {
        try {
          const { data: bonusSumRows, error: bonusSumError } = await supabase
            .from("bonus_prizes")
            .select("contest_id, amount.sum()")
            .gt("amount", 0)
            .in("contest_id", contestIds);

          if (bonusSumError) {
            console.error("Error fetching real MioCoin bonus sums:", bonusSumError);
          } else if (bonusSumRows) {
            const sumMap = new Map<string, number>();
            for (const row of bonusSumRows as any[]) {
              const cid = row.contest_id as string;
              const sum = Number(row.sum ?? 0);
              if (cid) sumMap.set(cid, sum);
            }
            for (const c of contestsData) {
              const real = sumMap.get(c.contest_id);
              if (real !== undefined && real > 0) {
                c.total_miocoin_bonus = real;
              }
            }
          }
        } catch (e) {
          console.error("Unexpected error computing real MioCoin bonus sums:", e);
        }
      }

      setContests(contestsData);
    } catch (error: any) {
      console.error("Error fetching contests:", error);
      setContests([]);
      setStatsMap({});
      toast({
        title: "Chyba při načítání soutěží",
        description: error?.message || "Nepodařilo se načíst seznam soutěží. Zkus to znovu.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContests();
  }, []);

  const handleStatusChange = async (contestId: string, newStatus: string) => {
    const current = contests.find((c) => c.contest_id === contestId);

    if (current?.status === "closed") {
      toast({
        title: "Akce zamítnuta",
        description: "Ukončenou soutěž nelze znovu aktivovat ani přesunout.",
        variant: "destructive",
      });
      return;
    }

    if (newStatus === "closed") {
      toast({
        title: "Akce zamítnuta",
        description: "Soutěž lze uzavřít pouze automaticky systémem.",
        variant: "destructive",
      });
      return;
    }

    if (newStatus === "draft") {
      if (current?.status === "active") {
        toast({
          title: "Akce zamítnuta",
          description: "Aktivní soutěž nelze přesunout do Archivu test. Nejprve ji pozastavte nebo vraťte do stavu Čeká na start.",
          variant: "destructive",
        });
        return;
      }
    }

    setUpdatingStatus(contestId);

    try {
      const { error } = await supabase.rpc("admin_manage_contest", {
        p_operation: "update",
        p_contest_id: contestId,
        p_status: newStatus,
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Status aktualizován",
        description: `Status soutěže byl změněn na "${newStatus}".`,
      });

      await loadContests();
    } catch (err: any) {
      console.error("Error updating contest status:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se změnit status soutěže.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleCloseContest = async (contestId: string) => {
    if (!confirm("Opravdu chcete uzavřít tuto soutěž? Tato akce nelze vrátit.")) {
      return;
    }

    setClosingContest(contestId);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error("Nejste přihlášeni.");
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/close-contest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contest_id: contestId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se uzavřít soutěž.");
      }

      toast({
        title: "Soutěž uzavřena",
        description: result.message || "Soutěž byla úspěšně uzavřena a vítěz byl určen.",
      });

      await loadContests();
    } catch (err: any) {
      console.error("Error closing contest:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se uzavřít soutěž.",
        variant: "destructive",
      });
    } finally {
      setClosingContest(null);
    }
  };

  const handleEdit = (contest: ContestData) => {
    setEditingContest(contest);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingContest(null);
  };

  const handleDeleteClick = (contest: ContestData) => {
    if (linkedContestIds.has(contest.contest_id)) {
      toast({
        title: "Nelze smazat",
        description: "Soutěž nelze smazat – je navázaná na nabídky. Přesuň ji do Archivu test.",
        variant: "destructive",
      });
      return;
    }
    setContestToDelete(contest);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!contestToDelete) return;

    console.log("[AdminContestManagement] delete contest id:", contestToDelete.contest_id);
    console.log("[AdminContestManagement] delete contest status:", contestToDelete.status);
    setDeletingContest(contestToDelete.contest_id);
    setDeleteDialogOpen(false);

    // Allow delete only for draft or pending (test) contests
    if (contestToDelete.status !== "draft" && contestToDelete.status !== "pending") {
      console.log("[AdminContestManagement] delete blocked: status is not draft or pending, got:", contestToDelete.status);
      setDeletingContest(null);
      toast({
        title: "Mazání zakázáno",
        description: "Mazání je povoleno jen u testovacích soutěží ve stavu Archiv test nebo Čeká na start.",
        variant: "destructive",
      });
      return;
    }

    // Soft-detach all active partner offer links before the count check
    const { data: detachData, error: detachError } = await supabase
      .from("partner_offer_contests")
      .update({ detached_at: new Date().toISOString() })
      .eq("contest_id", contestToDelete.contest_id)
      .is("detached_at", null)
      .select("id");

    console.log("[AdminContestManagement] soft detach response data:", detachData);
    console.log("[AdminContestManagement] soft detach response error:", detachError);

    if (detachError) {
      console.log("[AdminContestManagement] delete blocked: soft detach failed");
      setDeletingContest(null);
      toast({
        title: "Chyba",
        description: detachError.message || "Nepodařilo se odpojit partner nabídky.",
        variant: "destructive",
      });
      return;
    }

    // Block delete if contest is linked to active partner offers (detached_at IS NULL)
    const { count: activeLinkCount, error: activeLinkError } = await supabase
      .from("partner_offer_contests")
      .select("id", { count: "exact", head: true })
      .eq("contest_id", contestToDelete.contest_id)
      .is("detached_at", null);

    console.log("[AdminContestManagement] active partner_offer_contests count after soft detach:", activeLinkCount);

    if (activeLinkError) {
      console.log("[AdminContestManagement] delete blocked: active link check error");
      setDeletingContest(null);
      toast({
        title: "Chyba",
        description: activeLinkError.message || "Nepodařilo se ověřit vazby na partner nabídky.",
        variant: "destructive",
      });
      return;
    }

    if ((activeLinkCount ?? 0) > 0) {
      console.log("[AdminContestManagement] delete blocked: active partner offer links exist");
      setDeletingContest(null);
      toast({
        title: "Chyba",
        description:
          "Tuto soutěž nelze smazat, protože je navázaná na aktivní partner nabídky.",
        variant: "destructive",
      });
      return;
    }
    console.log("[AdminContestManagement] delete allowed: no active partner offer links");

    // Optimistic update - remove from list immediately
    const previousContests = [...contests];
    setContests((prev) => prev.filter((c) => c.contest_id !== contestToDelete.contest_id));

    try {
      const { data, error } = await supabase
        .from("contests")
        .delete()
        .eq("id", contestToDelete.contest_id)
        .select("id");

      console.log("[AdminContestManagement] delete response data:", data);
      console.log("[AdminContestManagement] delete response error:", error);

      if (error) {
        throw error;
      }

      if (!data || data.length !== 1) {
        toast({
          title: "Chyba",
          description: "Soutěž se v databázi nesmazala.",
          variant: "destructive",
        });
        // Revert optimistic update if DB did not delete
        setContests(previousContests);
        await loadContests();
        return;
      }

      toast({
        title: "Soutěž smazána",
        description: `Soutěž "${contestToDelete.title}" byla úspěšně smazána.`,
      });
      // Sync once with DB after successful delete
      await loadContests();
    } catch (err: any) {
      console.error("Error deleting contest:", err);
      // Revert optimistic update on error
      setContests(previousContests);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se smazat soutěž.",
        variant: "destructive",
      });
      await loadContests();
    } finally {
      setDeletingContest(null);
      setContestToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setContestToDelete(null);
  };

  // Aggregate totals across all contests for the summary strip
  const summaryTotals = contests.reduce(
    (acc, c) => {
      const s = statsMap[c.contest_id];
      return {
        tickets_sold:       acc.tickets_sold      + c.tickets_sold,
        tickets_remaining:  acc.tickets_remaining + (s?.tickets_remaining  ?? 0),
        estimated_revenue:  acc.estimated_revenue + (s?.estimated_revenue  ?? 0),
        tickets_last_24h:   acc.tickets_last_24h  + (s?.tickets_last_24h  ?? 0),
        total_tickets:      acc.total_tickets     + c.ticket_count,
      };
    },
    { tickets_sold: 0, tickets_remaining: 0, estimated_revenue: 0, tickets_last_24h: 0, total_tickets: 0 },
  );
  const overallSoldPct = summaryTotals.total_tickets > 0
    ? ((summaryTotals.tickets_sold / summaryTotals.total_tickets) * 100).toFixed(1)
    : "0.0";

  const filteredContests = contests.filter((c) => {
    if (archiveTab === "active") return ["pending", "active", "paused"].includes(c.status);
    if (archiveTab === "test")   return c.status === "draft";
    if (archiveTab === "closed") return c.status === "closed";
    return true;
  });

  const movableSelected = filteredContests.filter(
    (c) => selectedIds.has(c.contest_id) && (c.status === "pending" || c.status === "paused")
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const movable = filteredContests.filter((c) => c.status === "pending" || c.status === "paused");
    if (movable.every((c) => selectedIds.has(c.contest_id))) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        movable.forEach((c) => next.delete(c.contest_id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        movable.forEach((c) => next.add(c.contest_id));
        return next;
      });
    }
  };

  const handleBulkMoveToDraft = async () => {
    if (movableSelected.length === 0) return;
    setBulkMoving(true);
    try {
      const succeeded: typeof movableSelected = [];
      const failed: { contest: typeof movableSelected[0]; error: any }[] = [];

      for (const c of movableSelected) {
        const { error } = await supabase.rpc("admin_manage_contest", {
          p_operation: "update",
          p_contest_id: c.contest_id,
          p_status: "draft",
          p_title: null,
          p_description: null,
          p_main_prize: null,
          p_main_image: null,
          p_ticket_count: null,
          p_ticket_price: null,
          p_fast_game: null,
        } as any);
        if (error) {
          console.error("[BulkMoveToDraft] failed:", c.title, c.contest_id, error);
          failed.push({ contest: c, error });
        } else {
          succeeded.push(c);
        }
      }

      if (failed.length > 0) {
        const failedNames = failed.map((f) => f.contest.title).slice(0, 2).join(", ");
        const firstErr = failed[0].error?.message || "neznámá chyba";
        toast({
          title: "Částečná chyba",
          description: `${succeeded.length} přesunuto. Selhalo (${failed.length}): ${failedNames}. Důvod: ${firstErr}`,
          variant: "destructive",
        });
      } else {
        const names = movableSelected.map((c) => c.title);
        const preview = names.slice(0, 3).join(", ");
        const rest = names.length > 3 ? ` a ${names.length - 3} další` : "";
        toast({ title: "Přesunuto do Archivu test", description: `${preview}${rest}.` });
        setArchiveTab("test");
      }
      setSelectedIds(new Set());
      await loadContests();
    } catch (err: any) {
      toast({ title: "Chyba", description: err?.message || "Nepodařilo se přesunout soutěže.", variant: "destructive" });
    } finally {
      setBulkMoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Správa soutěží</h2>
        <Button
          onClick={() => {
            setEditingContest(null);
            setModalOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nová soutěž
        </Button>
      </div>

      {/* ── Archive tabs ── */}
      <div className="flex gap-1 border-b border-white/10 pb-0">
        {(["active", "test", "closed"] as const).map((tab) => {
          const labels: Record<string, string> = {
            active: "Aktivní soutěže",
            test:   "Archiv test",
            closed: "Archiv ukončených soutěží",
          };
          const counts: Record<string, number> = {
            active: contests.filter((c) => ["pending", "active", "paused"].includes(c.status)).length,
            test:   contests.filter((c) => c.status === "draft").length,
            closed: contests.filter((c) => c.status === "closed").length,
          };
          const isActive = archiveTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setArchiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/30"
              }`}
            >
              {labels[tab]}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"}`}>
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Contest statistics panel ── */}
      {!loading && contests.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-4 py-3">
            <Ticket className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Tikety prodány</p>
              <p className="text-base font-semibold tabular-nums truncate">
                {summaryTotals.tickets_sold.toLocaleString("cs-CZ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-4 py-3">
            <BarChart2 className="h-5 w-5 shrink-0 text-orange-400" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Tikety zbývají</p>
              <p className="text-base font-semibold tabular-nums truncate">
                {summaryTotals.tickets_remaining.toLocaleString("cs-CZ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-4 py-3">
            <TrendingUp className="h-5 w-5 shrink-0 text-green-400" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Prodáno %</p>
              <p className="text-base font-semibold tabular-nums">
                {overallSoldPct}%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-4 py-3">
            <Coins className="h-5 w-5 shrink-0 text-yellow-400" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Výnos (MC)</p>
              <p className="text-base font-semibold tabular-nums truncate">
                {summaryTotals.estimated_revenue.toLocaleString("cs-CZ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-4 py-3">
            <Clock className="h-5 w-5 shrink-0 text-blue-400" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Tikety za 24h</p>
              <p className="text-base font-semibold tabular-nums">
                {summaryTotals.tickets_last_24h.toLocaleString("cs-CZ")}
              </p>
            </div>
          </div>
        </div>
      )}

      <Card className="bg-card/40 border border-white/10">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredContests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Žádné soutěže v této kategorii.</div>
          ) : (
            <>
              {/* Bulk action bar — visible only on active tab when something is selected */}
              {archiveTab === "active" && selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border border-primary/30 rounded-md mb-2">
                  <span className="text-sm text-primary font-medium">
                    Vybráno: {selectedIds.size} ({movableSelected.length} lze přesunout)
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-primary/50 text-primary hover:bg-primary/10"
                    disabled={bulkMoving || movableSelected.length === 0}
                    onClick={handleBulkMoveToDraft}
                  >
                    {bulkMoving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Přesunout do Archivu test ({movableSelected.length})
                  </Button>
                  <button className="text-xs text-muted-foreground hover:text-foreground ml-auto" onClick={() => setSelectedIds(new Set())}>
                    Zrušit výběr
                  </button>
                </div>
              )}
            <div className="rounded-md border border-white/10 max-h-[550px] overflow-auto relative">
              <div className="min-w-max">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    {archiveTab === "active" && (
                      <TableHead className="w-10 bg-card">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/30 accent-primary cursor-pointer"
                          checked={
                            filteredContests.filter((c) => c.status === "pending" || c.status === "paused").length > 0 &&
                            filteredContests.filter((c) => c.status === "pending" || c.status === "paused").every((c) => selectedIds.has(c.contest_id))
                          }
                          onChange={toggleSelectAll}
                          title="Vybrat vše (jen přesunutelné)"
                        />
                      </TableHead>
                    )}
                    <TableHead className="bg-card">Název</TableHead>
                    <TableHead className="text-center bg-card">Hlavní výhra</TableHead>
                    <TableHead className="text-center bg-card">Status</TableHead>
                    <TableHead className="text-center bg-card">Tikety</TableHead>
                    <TableHead className="text-center bg-card">% hotovo</TableHead>
                    <TableHead className="text-center bg-card">Bonusové MioCoiny</TableHead>
                    <TableHead className="text-right bg-card">Akce</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredContests.map((contest, index) => (
                    <TableRow
                      key={contest.contest_id}
                      className={`border-b border-white/5 transition-colors hover:bg-white/5 ${index % 2 === 0 ? "bg-white/[0.02]" : ""} ${selectedIds.has(contest.contest_id) ? "bg-primary/5" : ""}`}
                    >
                      {archiveTab === "active" && (
                        <TableCell className="w-10">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-white/30 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                            checked={selectedIds.has(contest.contest_id)}
                            disabled={contest.status === "active"}
                            onChange={() => toggleSelect(contest.contest_id)}
                            title={contest.status === "active" ? "Aktivní soutěž nelze přesunout" : ""}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="font-medium">{contest.title}</div>
                        <div className="text-xs text-muted-foreground">ID: {contest.contest_id}</div>
                      </TableCell>

                      <TableCell className="text-center">{contest.main_prize}</TableCell>

                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(contest.status)}`}
                          >
                            {STATUS_OPTIONS.find((opt) => opt.value === contest.status)?.label || contest.status}
                          </span>
                          <Select
                            value={contest.status}
                            onValueChange={(value) => handleStatusChange(contest.contest_id, value)}
                            disabled={updatingStatus === contest.contest_id || contest.status === "closed"}
                          >
                            <SelectTrigger className="w-8 h-8 p-0 bg-transparent border-white/10 hover:bg-white/10">
                              {updatingStatus === contest.contest_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Pencil className="h-3 w-3" />
                              )}
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-800 border-neutral-700 z-50">
                              {SELECTABLE_STATUS_OPTIONS.map((option) => {
                                const isBlocked = option.value === "draft" && contest.status === "active";
                                return (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    disabled={isBlocked}
                                    className={isBlocked ? "text-neutral-500 cursor-not-allowed" : "text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:text-white cursor-pointer"}
                                  >
                                    {option.label}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <div>{contest.tickets_sold.toLocaleString("cs-CZ")} / {contest.ticket_count.toLocaleString("cs-CZ")}</div>
                        {statsMap[contest.contest_id] && (
                          <div className="flex items-center justify-center gap-1.5 mt-1">
                            <span className="text-[10px] text-muted-foreground">
                              zbývá {statsMap[contest.contest_id].tickets_remaining.toLocaleString("cs-CZ")}
                            </span>
                            {statsMap[contest.contest_id].tickets_last_24h > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-400">
                                <Activity className="h-2.5 w-2.5" />
                                +{statsMap[contest.contest_id].tickets_last_24h.toLocaleString("cs-CZ")} 24h
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        <div>{contest.progress_percentage}%</div>
                        {statsMap[contest.contest_id] && (
                          <div className="text-[10px] text-yellow-400 mt-1 tabular-nums">
                            {statsMap[contest.contest_id].estimated_revenue.toLocaleString("cs-CZ")} MC
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {contest.total_miocoin_bonus?.toLocaleString("cs-CZ") || 0}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(contest)}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Upravit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/contest/${contest.contest_id}`)}
                          >
                            Otevřít
                          </Button>
                          {contest.status === "active" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCloseContest(contest.contest_id)}
                              disabled={closingContest === contest.contest_id}
                            >
                              {closingContest === contest.contest_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <X className="h-4 w-4 mr-1" />
                                  Uzavřít
                                </>
                              )}
                            </Button>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={linkedContestIds.has(contest.contest_id) ? "cursor-not-allowed" : ""}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteClick(contest)}
                                    disabled={deletingContest === contest.contest_id || linkedContestIds.has(contest.contest_id)}
                                    className={
                                      linkedContestIds.has(contest.contest_id)
                                        ? "opacity-40 cursor-not-allowed text-red-400 border-red-500/30"
                                        : "text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                                    }
                                  >
                                    {deletingContest === contest.contest_id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Smazat
                                      </>
                                    )}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {linkedContestIds.has(contest.contest_id) && (
                                <TooltipContent>
                                  <p>Soutěž nelze smazat – je navázaná na nabídky</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <ContestModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSaved={loadContests}
        editingContest={editingContest}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat soutěž</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete tuto soutěž smazat? Tuto akci nelze vrátit zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminContestManagement;
