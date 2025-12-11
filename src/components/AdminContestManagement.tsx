import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, X, Sparkles, ImagePlus, Wand2, Trash2, Coins, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

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
}

interface MioCoinBonus {
  ticket_position: number;
  amount: number;
}

interface PhysicalPrize {
  id?: string;
  ticket_position: number;
  description: string;
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
  { value: "draft", label: "Koncept", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
  { value: "pending", label: "Čeká na start", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  { value: "active", label: "Aktivní", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  { value: "paused", label: "Pozastaveno", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  { value: "closed", label: "Ukončeno", color: "bg-red-500/20 text-red-300 border-red-500/30" },
];

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
      });
      // Load existing bonuses for editing
      loadExistingBonuses(editingContest.contest_id);
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
      });
      setMioCoinBonuses([]);
      setPhysicalPrizes([]);
    }
    setActiveTab("basic");
  }, [editingContest, open]);

  const loadExistingBonuses = async (contestId: string) => {
    const { data, error } = await supabase
      .from("bonus_prizes")
      .select("*")
      .eq("contest_id", contestId);

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

  const handleFileChange = (field: "main_image_file" | "banner_image_file" | "detail_image_file") => 
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

  // AI Image-to-Image generation (Vertex AI Imagen 2)
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

      // Generate hero and banner variants in parallel using Vertex AI image-to-image
      const [heroResult, bannerResult] = await Promise.allSettled([
        styleImage("hero", imageBase64),
        styleImage("banner", imageBase64),
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

      const result = await styleImage("hero", imageBase64!);

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

      const result = await styleImage("banner", imageBase64!);

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

  // Image-to-image styling using Vertex AI Imagen 2
  const styleImage = async (
    layout: "hero" | "banner" | "bonus",
    imageBase64: string
  ): Promise<{ success: boolean; url?: string; error?: string }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vertex-style-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layout,
            image_base64: imageBase64,
          }),
        }
      );

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
        }
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

      const result = await styleImage("banner", imageBase64!);

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

  // MioCoin bonus generation
  const generateMioCoinBonuses = () => {
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
      // Evenly spaced positions
      const spacing = Math.floor(ticketCount / (computedPositionCount + 1));
      for (let i = 1; i <= computedPositionCount; i++) {
        let position = spacing * i;
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

    setMioCoinBonuses((prev) => [...prev, ...newBonuses]);
    toast({
      title: "MioCoiny vygenerovány",
      description: `Přidáno ${newBonuses.length} MioCoin bonusů.`,
    });
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
    
    // If image file is provided, generate AI styled version using image-to-image
    if (prizeToAdd.image_file) {
      prizeToAdd.ai_generating = true;
      setPhysicalPrizes((prev) => [...prev, prizeToAdd]);
      setNewPhysicalPrize({ ticket_position: 1, description: "", image_file: null });
      
      toast({
        title: "Generuji AI grafiku pro bonus…",
        description: "Stylizuji nahraný obrázek bonusové výhry pomocí Vertex AI.",
      });

      try {
        // Convert bonus image to base64 and use image-to-image
        const bonusImageBase64 = await fileToBase64(prizeToAdd.image_file);
        const result = await styleImage("bonus", bonusImageBase64);
        
        setPhysicalPrizes((prev) => 
          prev.map((p) => 
            p.ticket_position === prizeToAdd.ticket_position && p.description === prizeToAdd.description
              ? { ...p, ai_image_url: result.url, ai_generating: false }
              : p
          )
        );

        if (result.success) {
          toast({
            title: "AI grafika vytvořena",
            description: "Bonusový obrázek byl stylizován pomocí Vertex AI.",
          });
        }
      } catch (err) {
        console.error("AI bonus image error:", err);
        setPhysicalPrizes((prev) => 
          prev.map((p) => 
            p.ticket_position === prizeToAdd.ticket_position && p.description === prizeToAdd.description
              ? { ...p, ai_generating: false }
              : p
          )
        );
      }
    } else {
      setPhysicalPrizes((prev) => [...prev, prizeToAdd]);
      setNewPhysicalPrize({ ticket_position: 1, description: "", image_file: null });
      toast({ title: "Výhra přidána", description: "Věcná výhra byla přidána." });
    }
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
        p_ticket_count: form.ticket_count,
        p_ticket_price: form.ticket_price,
        p_operation: isEditingContest ? "update" : "create",
      });

      if (error) {
        throw error;
      }

      // Get contest_id for bonus saving and additional updates
      const contestId = isEditingContest 
        ? editingContest.contest_id 
        : (contestResult as any)?.contest_id;

      // Update AI-generated images directly in contests table
      // PRIORITY: AI-generated URLs ALWAYS override manual uploads
      if (contestId) {
        const additionalUpdates: Record<string, string | null> = {};
        
        // Handle secondary/detail image (hero layout)
        // AI-generated URL has priority, then manual upload as fallback
        if (aiGeneratedImages.hero) {
          additionalUpdates.main_prize_secondary_image = aiGeneratedImages.hero;
          console.log("Using AI hero image:", aiGeneratedImages.hero);
        } else if (form.detail_image_file) {
          const detailPath = await handleImageUpload(form.detail_image_file);
          additionalUpdates.main_prize_secondary_image = detailPath;
          console.log("Using uploaded detail image:", detailPath);
        }
        
        // Handle banner image
        // AI-generated URL has priority, then manual upload as fallback
        if (aiGeneratedImages.banner) {
          additionalUpdates.banner_image = aiGeneratedImages.banner;
          console.log("Using AI banner image:", aiGeneratedImages.banner);
        } else if (form.banner_image_file) {
          const bannerPath = await handleImageUpload(form.banner_image_file);
          additionalUpdates.banner_image = bannerPath;
          console.log("Using uploaded banner image:", bannerPath);
        }
        
        // Apply additional updates if any
        if (Object.keys(additionalUpdates).length > 0) {
          console.log("Saving contest image updates:", additionalUpdates);
          const { error: updateError } = await supabase
            .from("contests")
            .update(additionalUpdates)
            .eq("id", contestId);
          
          if (updateError) {
            console.error("Error updating AI images:", updateError);
          } else {
            console.log("Contest images saved successfully");
          }
        }
      }

      // Save bonuses if we have a contest ID
      if (contestId) {
        // Delete existing bonuses for this contest
        await supabase.from("bonus_prizes").delete().eq("contest_id", contestId);

        // Insert MioCoin bonuses
        for (const bonus of mioCoinBonuses) {
          await supabase.from("bonus_prizes").insert({
            contest_id: contestId,
            ticket_position: bonus.ticket_position,
            amount: bonus.amount,
            description: `${bonus.amount} MioCoinů`,
            status: "pending",
          });
        }

        // Insert physical prizes
        for (const prize of physicalPrizes) {
          // Prefer AI-generated image, then uploaded file, then existing URL
          let imageUrl = prize.ai_image_url || prize.image_url;
          
          if (!imageUrl && prize.image_file) {
            const ext = prize.image_file.name.split(".").pop();
            const fileName = `bonus-prizes/${contestId}/${crypto.randomUUID()}.${ext}`;
            await supabase.storage.from("contest-images").upload(fileName, prize.image_file);
            imageUrl = fileName;
          }

          await supabase.from("bonus_prizes").insert({
            contest_id: contestId,
            ticket_position: prize.ticket_position,
            description: prize.description,
            image_url: imageUrl,
            status: "pending",
          });
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
      errors: [
        !hasMainImage && "Hlavní obrázek",
      ].filter(Boolean) as string[],
    },
  };

  const isFormValid = validation.basic.isValid && validation.graphics.isValid;

  const TabIndicator = ({ isValid }: { isValid: boolean }) => (
    <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full ${isValid ? 'text-green-500' : 'text-red-500'}`}>
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
                <Input 
                  value={form.title} 
                  onChange={handleTitleChange} 
                  placeholder="Např. Corvette C8" 
                />
              </div>

              <div>
                <Label>Hlavní výhra</Label>
                <Input 
                  value={form.main_prize} 
                  onChange={handleChange("main_prize")} 
                  placeholder="Např. Corvette C8" 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Automaticky předvyplněno z názvu soutěže
                </p>
              </div>

              {/* AI Popis hlavní výhry - moved here */}
              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Popis soutěže</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generatingDescription || (!form.title && !form.main_prize)}
                  >
                    {generatingDescription ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generuji…
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
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
                <p className="text-xs text-muted-foreground">
                  <Sparkles className="inline h-3 w-3 mr-1" />
                  AI generování vytvoří poutavý marketingový popis na základě názvu a hlavní výhry.
                </p>
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
                    {STATUS_OPTIONS.map((option) => (
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
                  Vygenerováno {mioCoinBonuses.length} pozic s celkovou hodnotou {totalMioCoins.toLocaleString("cs-CZ")} MioCoinů.
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
                  <Label>Pozice tiketu</Label>
                  <Input 
                    type="number"
                    min={1}
                    value={newPhysicalPrize.ticket_position}
                    onChange={(e) => setNewPhysicalPrize((prev) => ({ ...prev, ticket_position: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <Label>Obrázek výhry (volitelné)</Label>
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => setNewPhysicalPrize((prev) => ({ ...prev, image_file: e.target.files?.[0] || null }))}
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
                    // Prefer AI image, then original
                    const thumbnailSrc = prize.ai_image_url 
                      || (prize.image_file ? URL.createObjectURL(prize.image_file) : null)
                      || prize.image_url 
                      || null;
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-3">
                          {prize.ai_generating ? (
                            <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            </div>
                          ) : thumbnailSrc ? (
                            <div className="relative">
                              <img 
                                src={thumbnailSrc} 
                                alt={prize.description} 
                                className="w-10 h-10 rounded object-cover border border-white/10"
                              />
                              {prize.ai_image_url && (
                                <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-primary" />
                              )}
                            </div>
                          ) : null}
                          <div>
                            <span className="font-medium">{prize.description}</span>
                            <span className="text-muted-foreground ml-2">Pozice #{prize.ticket_position}</span>
                            {prize.ai_generating && (
                              <span className="text-xs text-muted-foreground ml-2">(generuji AI…)</span>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removePhysicalPrize(index)} disabled={prize.ai_generating}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Tab 4: Grafika (merged) */}
            <TabsContent value="graphics" className="space-y-6 mt-0">
              <div className="border border-dashed border-primary/30 rounded-lg p-4 space-y-4 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  <Label className="text-base font-medium">Hlavní obrázek výhry + AI transformace</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Nahraj obrázek hlavní výhry. AI automaticky vytvoří stylizovaný hero obrázek a banner v OneMil stylu.
                </p>
                <Input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange("main_image_file")} 
                  disabled={transformingImage}
                />
                {isEditing && editingContest?.main_image && !form.main_image_file && !form.main_image_url && (
                  <p className="text-xs text-muted-foreground">Aktuální: {editingContest.main_image}</p>
                )}
                
                {transformingImage && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generuji AI grafiku (hero + banner)…
                  </div>
                )}

                {/* AI Generated Images Preview with Regenerate Buttons */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {/* Hero Image Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        AI Hero (detail)
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRegenerateHero}
                        disabled={regeneratingHero || transformingImage || (!form.main_image_file && !form.main_image_url && !editingContest?.main_image)}
                        className="h-7 text-xs"
                      >
                        {regeneratingHero ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Wand2 className="h-3 w-3 mr-1" />
                            Regenerovat
                          </>
                        )}
                      </Button>
                    </div>
                    {aiGeneratedImages.hero ? (
                      <img 
                        src={aiGeneratedImages.hero} 
                        alt="AI Hero" 
                        className="w-full h-32 object-cover rounded-md border border-primary/20"
                      />
                    ) : (
                      <div className="w-full h-32 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground">
                        Zatím nevygenerováno
                      </div>
                    )}
                  </div>

                  {/* Banner Image Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        AI Banner
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRegenerateBanner}
                        disabled={regeneratingBanner || transformingImage || (!form.main_image_file && !form.main_image_url && !editingContest?.main_image)}
                        className="h-7 text-xs"
                      >
                        {regeneratingBanner ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Wand2 className="h-3 w-3 mr-1" />
                            Regenerovat
                          </>
                        )}
                      </Button>
                    </div>
                    {aiGeneratedImages.banner ? (
                      <img 
                        src={aiGeneratedImages.banner} 
                        alt="AI Banner" 
                        className="w-full h-32 object-cover rounded-md border border-primary/20"
                      />
                    ) : (
                      <div className="w-full h-32 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground">
                        Zatím nevygenerováno
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label>Detail obrázek (manuální override)</Label>
                <Input type="file" accept="image/*" onChange={handleFileChange("detail_image_file")} />
                <p className="text-xs text-muted-foreground mt-1">
                  Volitelné - přepíše AI vygenerovaný hero obrázek.
                </p>
              </div>

              <div>
                <Label>Banner obrázek (manuální override)</Label>
                <Input type="file" accept="image/*" onChange={handleFileChange("banner_image_file")} />
                <p className="text-xs text-muted-foreground mt-1">
                  Volitelné - přepíše AI vygenerovaný banner.
                </p>
              </div>

              <div className="border border-dashed border-white/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">AI Banner generátor</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automaticky vygeneruje banner pomocí AI na základě údajů soutěže.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleGenerateBanner}
                    disabled={generatingBanner || (!form.title && !form.main_prize)}
                  >
                    {generatingBanner ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generuji…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="mr-2 h-4 w-4" />
                        Vygenerovat banner (AI)
                      </>
                    )}
                  </Button>
                </div>

                {form.main_image_url && (
                  <div className="mt-3">
                    <Label className="text-sm mb-2 block">Náhled AI banneru:</Label>
                    <img 
                      src={form.main_image_url} 
                      alt="AI vygenerovaný banner" 
                      className="w-full max-h-48 object-cover rounded-md border border-white/10"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 7: Vytvořit soutěž (summary) */}
            <TabsContent value="create" className="space-y-4 mt-0">
              <div className="font-medium text-lg mb-4">Shrnutí soutěže</div>

              <div className="space-y-3 bg-white/5 rounded-lg p-4">
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
                  <span className="font-medium">{totalMioCoins.toLocaleString("cs-CZ")} MC ({mioCoinBonuses.length} pozic)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Věcné výhry:</span>
                  <span className="font-medium">{physicalPrizes.length} položek</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium">{STATUS_OPTIONS.find((o) => o.value === form.status)?.label || form.status}</span>
                </div>
              </div>

              {!isFormValid && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
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
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContest, setEditingContest] = useState<ContestData | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [closingContest, setClosingContest] = useState<string | null>(null);

  const loadContests = async () => {
    setLoading(true);

    const { data, error } = await supabase.rpc("get_contest_management_data", { p_contest_id_filter: null });

    if (error) {
      console.error("Error fetching contests:", error);
      toast({
        title: "Chyba při načítání soutěží",
        description: error.message || "Nepodařilo se načíst seznam soutěží. Zkus to znovu.",
        variant: "destructive",
      });
      setContests([]);
      setLoading(false);
      return;
    }

    setContests((data || []) as ContestData[]);
    setLoading(false);
  };

  useEffect(() => {
    loadContests();
  }, []);

  const handleStatusChange = async (contestId: string, newStatus: string) => {
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

      const response = await fetch(
        `https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/close-contest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ contest_id: contestId }),
        }
      );

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Správa soutěží</h2>
        <Button onClick={() => { setEditingContest(null); setModalOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nová soutěž
        </Button>
      </div>

      <Card className="bg-card/40 border border-white/10">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : contests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Žádné soutěže nebyly nalezeny.</div>
          ) : (
            <div className="w-full overflow-x-auto overflow-y-auto max-h-[70vh]">
              <Table className="min-w-max">
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
                  {contests.map((contest, index) => (
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
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(contest.status)}`}>
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
                              {STATUS_OPTIONS.map((option) => (
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
                      </TableCell>

                      <TableCell className="text-center">
                        {contest.tickets_sold} / {contest.ticket_count}
                      </TableCell>

                      <TableCell className="text-center">{contest.progress_percentage}%</TableCell>

                      <TableCell className="text-center">
                        {contest.total_miocoin_bonus?.toLocaleString("cs-CZ") || 0}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(contest)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Upravit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => (window.location.href = `/admin/contest/${contest.contest_id}`)}
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </div>
  );
};

export default AdminContestManagement;
