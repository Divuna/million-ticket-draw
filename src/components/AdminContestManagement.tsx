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
  image_url?: string | null;
  image_file?: File | null;
  ai_image_url?: string | null;
  ai_generating?: boolean;
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

const getStatusBadgeClass = (status: string) => {
  const option = STATUS_OPTIONS.find((opt) => opt.value === status);
  return option?.color || "bg-gray-500/20 text-gray-300 border-gray-500/30";
};

const ContestModal: React.FC<ContestModalProps> = ({ open, onClose, onSaved, editingContest }) => {
  const [form, setForm] = useState<ContestFormData>({
    title: "",
    description: "",
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

  // MioCoin bonus state
  const [mioCoinBonuses, setMioCoinBonuses] = useState<MioCoinBonus[]>([]);
  const [totalMioCoinsInput, setTotalMioCoinsInput] = useState<number>(1000);
  const [stepValue, setStepValue] = useState<number>(10);
  const [distributionType, setDistributionType] = useState<"even" | "random">("even");

  // Physical prize state
  const [physicalPrizes, setPhysicalPrizes] = useState<PhysicalPrize[]>([]);
  const [newPhysicalPrize, setNewPhysicalPrize] = useState<PhysicalPrize>({
    ticket_position: 1,
    description: "",
    detailed_description: "",
    image_file: null,
  });

  // Reset form when modal opens or editingContest changes
  useEffect(() => {
    if (editingContest) {
      setForm({
        title: editingContest.title || "",
        description: editingContest.description || "",
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
    } else {
      setForm({
        title: "",
        description: "",
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
    }
    setActiveTab("basic");
  }, [editingContest, open]);

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

  const handleAddMedia = async () => {
    const contestId = editingContest?.contest_id;
    if (!contestId) {
      toast({ title: "Chyba", description: "Nejdříve uložte soutěž.", variant: "destructive" });
      return;
    }

    let finalUrl = newMediaUrl.trim();

    // For image type, require file upload
    if (newMediaType === "image") {
      if (!newMediaFile) {
        toast({ title: "Chyba", description: "Vyberte obrázek.", variant: "destructive" });
        return;
      }
      setAddingMedia(true);
      const filePath = `contests/${contestId}/gallery/${Date.now()}-${newMediaFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("contest-images")
        .upload(filePath, newMediaFile);
      if (uploadError) {
        toast({ title: "Chyba uploadu", description: uploadError.message, variant: "destructive" });
        setAddingMedia(false);
        return;
      }
      const { data: publicUrlData } = supabase.storage.from("contest-images").getPublicUrl(filePath);
      finalUrl = publicUrlData.publicUrl;
    } else if (newMediaType === "background") {
      if (!newMediaFile) {
        toast({ title: "Chyba", description: "Vyberte obrázek pozadí.", variant: "destructive" });
        return;
      }
      setAddingMedia(true);
      const filePath = `contests/${contestId}/gallery/${Date.now()}-${newMediaFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("contest-images")
        .upload(filePath, newMediaFile);
      if (uploadError) {
        toast({ title: "Chyba uploadu", description: uploadError.message, variant: "destructive" });
        setAddingMedia(false);
        return;
      }
      const { data: publicUrlData } = supabase.storage.from("contest-images").getPublicUrl(filePath);
      finalUrl = publicUrlData.publicUrl;
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
        // Delete from DB (ignore temp ids)
        const realIds = existingBgIds.filter((id) => !String(id).startsWith("temp-"));
        if (realIds.length > 0) {
          await supabase.from("contest_media").delete().in("id", realIds);
        }
      }
    }

    // Optimistic: add placeholder immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticItem = { id: tempId, type: newMediaType, url: finalUrl, sort_order: newMediaSortOrder };
    setGalleryMedia((prev) => [...prev, optimisticItem].sort((a, b) => a.sort_order - b.sort_order));

    // Clear form immediately for snappy UX
    const savedType = newMediaType;
    const savedUrl = finalUrl;
    const savedOrder = newMediaSortOrder;
    setNewMediaUrl("");
    setNewMediaFile(null);
    setNewMediaSortOrder(0);

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
          image_url: bonus.image_url,
        });
      }
    });

    setMioCoinBonuses(mioCoins);
    setPhysicalPrizes(physical);
  };

  const handleChange =
    (field: keyof ContestFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = field === "ticket_count" || field === "ticket_price" ? Number(e.target.value || 0) : e.target.value;
      setForm((prev) => ({ ...prev, [field]: value as any }));
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

  const handleImageUpload = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = fileName;

    const { error } = await supabase.storage.from("contest-images").upload(filePath, file);

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

  // MioCoin bonus generation - saves immediately to DB when editing existing contest
  const generateMioCoinBonuses = async () => {
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

    if (distributionType === "even") {
      // Evenly spaced positions (spacing must be >= 1 so ticket_position is never 0)
      const rawSpacing = Math.floor(ticketCount / (computedPositionCount + 1));
      const spacing = rawSpacing < 1 ? 1 : rawSpacing;
      for (let i = 1; i <= computedPositionCount; i++) {
        let position = spacing * i;
        if (position < 1) position = 1;
        if (position > ticketCount) continue;
        // Adjust if position is already used
        while (usedPositions.has(position) && position <= ticketCount) {
          position++;
        }
        if (position <= ticketCount && !usedPositions.has(position)) {
          usedPositions.add(position);
          newBonuses.push({ ticket_position: position, amount: stepValue });
        }
      }
    } else {
      // Random positions
      let attempts = 0;
      const maxAttempts = computedPositionCount * 10;

      while (newBonuses.length < computedPositionCount && attempts < maxAttempts) {
        const position = Math.floor(Math.random() * ticketCount) + 1;
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

    // If editing existing contest, save immediately to DB
    if (editingContest?.contest_id) {
      try {
        const contestId = editingContest.contest_id;
        
        // Delete existing MioCoin bonuses (only those with amount > 0)
        // Delete existing MioCoin bonuses (only those with amount > 0) via RPC
        // First fetch existing MioCoin bonus IDs to delete them via RPC
        const { data: existingMcBonuses } = await supabase
          .from("bonus_prizes")
          .select("id")
          .eq("contest_id", contestId)
          .gt("amount", 0);

        if (existingMcBonuses && existingMcBonuses.length > 0) {
          for (const bonus of existingMcBonuses) {
            await supabase.rpc("admin_manage_bonus_prize", {
              p_prize_id: bonus.id,
              p_contest_id: contestId,
              p_status: "deleted",
              p_operation: "update",
            });
          }
        }

        // Insert new MioCoin bonuses via RPC (writes to bonus_prizes)
        console.log(
          "[AdminContestManagement] MioCoin bonus RPC batch length:",
          newBonuses.length
        );
        for (const bonus of newBonuses) {
          console.log("[AdminContestManagement] MioCoin bonus RPC before insert", {
            contest_id: contestId,
            ticket_position: bonus.ticket_position,
            amount: bonus.amount,
          });
          try {
            const { error: rpcError } = await supabase.rpc("admin_manage_bonus_prize", {
              p_contest_id: contestId,
              p_ticket_position: bonus.ticket_position,
              p_amount: bonus.amount,
              p_description: `${bonus.amount} MioCoinů`,
              p_status: "pending",
              p_operation: "create",
            });
            if (rpcError) {
              console.error("[AdminContestManagement] MioCoin bonus RPC failed", {
                message: rpcError.message,
                details: rpcError.details,
                code: rpcError.code,
              });
            } else {
              console.log("[AdminContestManagement] MioCoin bonus RPC success", {
                contest_id: contestId,
                ticket_position: bonus.ticket_position,
                amount: bonus.amount,
              });
            }
          } catch (rpcErr: unknown) {
            const err = rpcErr as { message?: string; details?: string; code?: string };
            console.error("[AdminContestManagement] MioCoin bonus RPC exception", rpcErr, {
              message: err?.message,
              details: err?.details,
              code: err?.code,
            });
            throw rpcErr;
          }
        }

        // Note: total_miocoin_bonus is updated automatically by database trigger trg_sync_total_miocoin_bonus
        const totalMioCoins = newBonuses.reduce((sum, b) => sum + b.amount, 0);
        
        toast({
          title: "MioCoiny uloženy",
          description: `${newBonuses.length} MioCoin bonusů (celkem ${totalMioCoins}) bylo uloženo do databáze.`,
        });
      } catch (err: unknown) {
        const e = err as { message?: string; details?: string; code?: string };
        console.error("Error saving MioCoin bonuses:", err, {
          message: e?.message,
          details: e?.details,
          code: e?.code,
        });
        toast({
          title: "Chyba při ukládání",
          description: "MioCoiny byly vygenerovány, ale nepodařilo se je uložit.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "MioCoiny vygenerovány",
        description: `Přidáno ${newBonuses.length} MioCoin bonusů. Budou uloženy po vytvoření soutěže.`,
      });
    }

    setMioCoinBonuses((prev) => [...prev, ...newBonuses]);
  };

  const clearMioCoinBonuses = () => {
    setMioCoinBonuses([]);
    toast({ title: "MioCoiny smazány", description: "Všechny MioCoin bonusy byly odstraněny." });
  };

  // Physical prize management
  const addPhysicalPrize = async () => {
    if (!newPhysicalPrize.description || newPhysicalPrize.ticket_position < 1) {
      toast({
        title: "Chyba",
        description: "Vyplň popis a platnou pozici tiketu.",
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

    const prizeToAdd = { ...newPhysicalPrize };
    
    // Add prize directly without AI processing
    setPhysicalPrizes((prev) => [...prev, prizeToAdd]);
    setNewPhysicalPrize({ ticket_position: 1, description: "", detailed_description: "", image_file: null });
    toast({ title: "Výhra přidána", description: "Věcná výhra byla přidána." });
  };

  const removePhysicalPrize = (index: number) => {
    setPhysicalPrizes((prev) => prev.filter((_, i) => i !== index));
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

    // Normalize + validate ticket_count before submit (debug + guard against defaulting to 1,000,000)
    console.log("[AdminContestManagement] submit form.ticket_count:", form.ticket_count);
    const normalizedTicketCount = Number(form.ticket_count);
    console.log("[AdminContestManagement] normalizedTicketCount:", normalizedTicketCount);
    if (!Number.isFinite(normalizedTicketCount) || normalizedTicketCount < 100) {
      toast({
        title: "Chyba",
        description: "Počet ticketů musí být platné číslo alespoň 100.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      let imagePath: string | null = editingContest?.main_image || null;

      // If AI generated a URL, use it directly
      if (form.main_image_url && !form.main_image_file) {
        imagePath = form.main_image_url;
      } else if (form.main_image_file) {
        imagePath = await handleImageUpload(form.main_image_file);
      }

      const isEditingContest = !!editingContest;

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
      const contestId = isEditingContest ? editingContest.contest_id : (contestResult as any)?.contest_id;

      // Update images directly in contests table (manual uploads only)
      if (contestId) {
        const additionalUpdates: Record<string, string | null> = {};

        // Handle secondary/detail image (hero layout) - manual upload only
        if (form.detail_image_file) {
          const detailPath = await handleImageUpload(form.detail_image_file);
          additionalUpdates.main_prize_secondary_image = detailPath;
        }

        // Handle banner image - manual upload only
        if (form.banner_image_file) {
          const bannerPath = await handleImageUpload(form.banner_image_file);
          additionalUpdates.banner_image = bannerPath;
        }

        // Apply additional updates if any
        if (Object.keys(additionalUpdates).length > 0) {
          const { error: updateError } = await supabase.from("contests").update(additionalUpdates).eq("id", contestId);

          if (updateError) {
            console.error("Error updating images:", updateError);
          }
        }
      }

      // Save bonuses if we have a contest ID
      if (contestId) {
        // Delete existing bonuses for this contest
        await supabase.from("bonus_prizes").delete().eq("contest_id", contestId);

        // Generate MioCoin bonuses via edge function (handles batching → inserts into bonus_prizes)
        if (mioCoinBonuses.length > 0) {
          const totalMioCoinCount = mioCoinBonuses.reduce((sum, b) => sum + b.amount, 0);
          const distributeBody = {
            contest_id: contestId,
            bonus_type: "MioCoin",
            total_value: totalMioCoinCount,
            amount_per_unit: 1,
            distribution_rule: "random",
            batch_size: 500,
          };
          console.log("[DEBUG BONUS PAYLOAD]", {
            contest_id: contestId,
            ticketCount: form.ticket_count,
            newBonusesLength: mioCoinBonuses.length,
            newBonuses: mioCoinBonuses,
          });
          mioCoinBonuses.forEach((b, idx) => {
            console.log("[DEBUG BONUS PAYLOAD] row", idx, {
              ticket_position: b.ticket_position,
              amount: b.amount,
            });
          });

          try {
            const { data: distributionResult, error: distributionError } =
              await supabase.functions.invoke("distribute-bonus-prizes", {
                body: distributeBody,
              });

            if (distributionError) {
              console.error("[AdminContestManagement] distribute-bonus-prizes invoke error", {
                message: distributionError.message,
                details: (distributionError as { details?: string }).details,
                code: (distributionError as { code?: string }).code,
                raw: distributionError,
              });
              throw new Error(`Chyba při generování MioCoin bonusů: ${distributionError.message}`);
            }

            console.log("[AdminContestManagement] distribute-bonus-prizes after invoke", {
              success: distributionResult?.success,
              result: distributionResult,
            });

            if (!distributionResult?.success) {
              console.error("[AdminContestManagement] distribute-bonus-prizes logical failure", {
                distributionResult,
              });
              throw new Error(
                distributionResult?.error || "Nepodařilo se vygenerovat MioCoin bonusy"
              );
            }
          } catch (distErr: unknown) {
            const e = distErr as { message?: string; details?: string; code?: string };
            console.error("[AdminContestManagement] distribute-bonus-prizes catch", distErr, {
              message: e?.message,
              details: e?.details,
              code: e?.code,
            });
            throw distErr;
          }

          // Explicitly set total_miocoin_bonus in contests table
          // Update total_miocoin_bonus via admin_manage_contest RPC
          const { error: updateMioCoinError } = await supabase.rpc("admin_manage_contest", {
            p_operation: "update",
            p_contest_id: contestId,
            p_title: null,
            p_description: null,
            p_main_prize: null,
            p_main_image: null,
            p_status: null,
          });

          if (updateMioCoinError) {
            console.error("Error updating total_miocoin_bonus:", updateMioCoinError);
          }
        }

        // Insert physical prizes sequentially
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
          const { error: insertError } = await supabase.rpc("admin_manage_bonus_prize", {
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
        }
      }

      toast({
        title: isEditing ? "Soutěž aktualizována" : "Soutěž vytvořena",
        description: isEditing ? "Změny byly úspěšně uloženy." : "Nová soutěž byla úspěšně uložena.",
      });

      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Error saving contest:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se uložit soutěž. Zkus to prosím znovu.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!editingContest;
  const totalMioCoins = mioCoinBonuses.reduce((sum, b) => sum + b.amount, 0);

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
    <Dialog open={open} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
          <DialogTitle>{isEditing ? "Upravit soutěž" : "Vytvořit novou soutěž"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 px-6">
          <div className="shrink-0 overflow-x-auto py-4">
            <TabsList className="inline-flex w-max gap-1">
              <TabsTrigger value="basic" className="flex items-center">
                Základní údaje
                <TabIndicator isValid={validation.basic.isValid} />
              </TabsTrigger>
              <TabsTrigger value="bonus-coins">Bonusy – MioCoins</TabsTrigger>
              <TabsTrigger value="bonus-physical">Bonusy – věcné</TabsTrigger>
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

              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>Počet tiketů</Label>
                  <Input type="number" min={1} value={form.ticket_count} onChange={handleChange("ticket_count")} />
                </div>
                <div className="flex-1">
                  <Label>Cena tiketu (MioCoins)</Label>
                  <Input type="number" min={1} value={form.ticket_price} onChange={handleChange("ticket_price")} />
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
                      onChange={(e) => setTotalMioCoinsInput(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Hodnota jednoho bonusu (po kolika)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={stepValue}
                      onChange={(e) => setStepValue(Number(e.target.value))}
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
                        onChange={() => setDistributionType("even")}
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
                        onChange={() => setDistributionType("random")}
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

                <div>
                  <Label>Pozice tiketu</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newPhysicalPrize.ticket_position}
                    onChange={(e) =>
                      setNewPhysicalPrize((prev) => ({ ...prev, ticket_position: Number(e.target.value) }))
                    }
                  />
                </div>

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

                <Button onClick={addPhysicalPrize} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Přidat věcnou výhru
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

                {!editingContest ? (
                  <p className="text-sm text-muted-foreground">Galerii lze spravovat po uložení soutěže.</p>
                ) : (
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
                                disabled={isDeleting || isTemp}
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
                )}
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

        <DialogFooter className="px-6 py-4 border-t border-white/10 shrink-0 bg-background">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Zavřít
          </Button>
        </DialogFooter>
      </DialogContent>
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
          .select("id, title, description, main_prize, main_image, status, ticket_count, ticket_price, total_miocoin_bonus, created_at, updated_at, fast_game")
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

      if (contestIds.length > 0) {
        const mioCoinTotals: Record<string, number> = {};
        await Promise.all(
          contestIds.map(async (contestId) => {
            const { count } = await supabase
              .from("bonus_prizes")
              .select("*", { count: "exact", head: true })
              .eq("contest_id", contestId)
              .gt("amount", 0);
            mioCoinTotals[contestId] = count || 0;
          })
        );

        // Merge into contests data
        contestsData.forEach((contest) => {
          contest.total_miocoin_bonus = mioCoinTotals[contest.contest_id] || 0;
        });
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
    if (newStatus === "closed") {
      toast({
        title: "Akce zamítnuta",
        description: "Soutěž lze uzavřít pouze automaticky systémem.",
        variant: "destructive",
      });
      return;
    }

    if (newStatus === "draft") {
      const current = contests.find((c) => c.contest_id === contestId);
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
            <div className="rounded-md border border-white/10 max-h-[550px] overflow-auto relative">
              <div className="min-w-max">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
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
                      className={`border-b border-white/5 transition-colors hover:bg-white/5 ${index % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                    >
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
                            disabled={updatingStatus === contest.contest_id}
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
