import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit2, Trophy, Ticket, Image, Coins, Target, TrendingUp, Settings, Trash2, Package, Sparkles, Loader2 } from 'lucide-react';

interface ContestData {
  contest_id: string;
  title: string;
  description: string;
  main_prize: string;
  main_image: string;
  status: string;
  ticket_count: number;
  ticket_price: number;
  tickets_sold: number;
  progress_percentage: number;
  bonus_count: number;
  bonus_summary: string;
  created_at: string;
  updated_at: string;
}

interface BonusPrize {
  id: string;
  contest_id: string;
  description: string;
  ticket_position: number;
  status: string;
  amount?: number;
  admin_notes?: string;
  created_at: string;
}

interface ContestForm {
  title: string;
  description: string;
  main_prize: string;
  main_image: string;
  main_prize_secondary_image: string;
  banner_image: string;
  status: string;
  ticket_count: number;
  ticket_price: number;
}

interface MioCoinBonusForm {
  totalToDistribute: number;
  valuePerWin: number;
  distributionMethod: 'random' | 'step_interval';
}

interface PhysicalPrize {
  id: string;
  description: string;
  ticketPosition: number;
  imageFile: File | null;
  imagePreview: string;
}

export const AdminContestManagement: React.FC = () => {
  const [contests, setContests] = useState<ContestData[]>([]);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingContest, setEditingContest] = useState<ContestData | null>(null);
  const [showContestDialog, setShowContestDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [selectedSecondaryFile, setSelectedSecondaryFile] = useState<File | null>(null);
  const [secondaryImagePreview, setSecondaryImagePreview] = useState<string>('');
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [bannerImagePreview, setBannerImagePreview] = useState<string>('');
  const [dialogTab, setDialogTab] = useState('basic');
  const [generatingBonuses, setGeneratingBonuses] = useState(false);
  const [generatedMioCoins, setGeneratedMioCoins] = useState<number[]>([]);
  const [generatingBanner, setGeneratingBanner] = useState(false);
  const [generatingPoster, setGeneratingPoster] = useState(false);
  const [generatedPosterUrl, setGeneratedPosterUrl] = useState<string>('');

  const [contestForm, setContestForm] = useState<ContestForm>({
    title: '',
    description: '',
    main_prize: '',
    main_image: '',
    main_prize_secondary_image: '',
    banner_image: '',
    status: 'pending',
    ticket_count: 1000000,
    ticket_price: 1
  });

  const [mioCoinBonusForm, setMioCoinBonusForm] = useState<MioCoinBonusForm>({
    totalToDistribute: 1000,
    valuePerWin: 10,
    distributionMethod: 'random'
  });

  const [physicalPrizes, setPhysicalPrizes] = useState<PhysicalPrize[]>([]);
  const [newPhysicalPrize, setNewPhysicalPrize] = useState<Omit<PhysicalPrize, 'id'>>({
    description: '',
    ticketPosition: 1,
    imageFile: null,
    imagePreview: ''
  });

  // Fetch data on component mount
  useEffect(() => {
    fetchContests();
  }, []);


  const fetchContests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_contest_management_data');

      if (error) {
        console.error('Error fetching contests:', error.message, error.details, error.hint);
        toast({
          title: "Chyba při načítání soutěží",
          description: `Nepodařilo se načíst seznam soutěží: ${error.message}. Zkuste to prosím znovu.`,
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        console.warn('No contests data returned');
        setContests([]);
        return;
      }

      console.log('Contests loaded successfully:', data.length);
      setContests(data);
      toast({
        title: "Soutěže načteny",
        description: `Úspěšně načteno ${data.length} soutěží.`,
      });
    } catch (error: any) {
      console.error('Unexpected error fetching contests:', error);
      toast({
        title: "Chyba při načítání soutěží",
        description: `Došlo k neočekávané chybě: ${error?.message || 'Neznámá chyba'}. Zkuste to prosím znovu.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBonusPrizes = async (contestId: string) => {
    try {
      const { data, error } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', contestId)
        .order('ticket_position', { ascending: true });

      if (error) throw error;
      setBonusPrizes(data || []);
    } catch (error) {
      console.error('Error fetching bonus prizes:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst bonusové výhry.",
        variant: "destructive"
      });
    }
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('contest-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      return filePath;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSaveContest = async () => {
    try {
      let imageUrl = contestForm.main_image;
      let secondaryImageUrl = contestForm.main_prize_secondary_image;
      let bannerImageUrl = contestForm.banner_image;

      // Upload image if file is selected
      if (selectedFile) {
        imageUrl = await handleImageUpload(selectedFile);
      }

      // Upload secondary image if file is selected
      if (selectedSecondaryFile) {
        secondaryImageUrl = await handleImageUpload(selectedSecondaryFile);
      }

      // Upload banner image if file is selected
      if (selectedBannerFile) {
        bannerImageUrl = await handleImageUpload(selectedBannerFile);
      }

      const operation = editingContest ? 'update' : 'create';
      const { data, error } = await supabase
        .rpc('admin_manage_contest', {
          p_contest_id: editingContest?.contest_id || null,
          p_title: contestForm.title,
          p_description: contestForm.description || null,
          p_main_prize: contestForm.main_prize,
          p_main_image: imageUrl || null,
          p_status: contestForm.status,
          p_ticket_count: contestForm.ticket_count,
          p_ticket_price: contestForm.ticket_price,
          p_operation: operation
        });

      if (error) throw error;

      const contestData = data as any;
      const createdContestId = contestData?.contest_id || editingContest?.contest_id;

      // Save secondary image and banner image separately (not in RPC)
      if (createdContestId && (secondaryImageUrl || bannerImageUrl)) {
        const updateData: { main_prize_secondary_image?: string; banner_image?: string } = {};
        if (secondaryImageUrl) updateData.main_prize_secondary_image = secondaryImageUrl;
        if (bannerImageUrl) updateData.banner_image = bannerImageUrl;
        
        const { error: updateError } = await supabase
          .from('contests')
          .update(updateData)
          .eq('id', createdContestId);

        if (updateError) {
          console.error('Error saving images:', updateError);
        }
      }

      // Save MioCoin bonuses if we have generated positions and this is a new contest
      if (!editingContest && createdContestId && generatedMioCoins.length > 0) {
        const mioCoinBonuses = generatedMioCoins.map(position => ({
          contest_id: createdContestId,
          description: `MioCoin - ${mioCoinBonusForm.valuePerWin} MioCoins`,
          ticket_position: position,
          status: 'pending',
          amount: mioCoinBonusForm.valuePerWin
        }));

        const { error: bonusError } = await supabase
          .from('bonus_prizes')
          .insert(mioCoinBonuses);

        if (bonusError) {
          console.error('Error saving MioCoin bonuses:', bonusError);
          toast({
            title: "Varování",
            description: "Soutěž vytvořena, ale MioCoin bonusy se nepodařilo uložit.",
            variant: "destructive"
          });
        }
      }

      // Save physical prizes if we have any and this is a new contest
      if (!editingContest && createdContestId && physicalPrizes.length > 0) {
        const physicalBonuses = physicalPrizes.map(prize => ({
          contest_id: createdContestId,
          description: prize.description,
          ticket_position: prize.ticketPosition,
          status: 'pending',
          amount: 0
        }));

        const { error: physicalError } = await supabase
          .from('bonus_prizes')
          .insert(physicalBonuses);

        if (physicalError) {
          console.error('Error saving physical prizes:', physicalError);
          toast({
            title: "Varování",
            description: "Soutěž vytvořena, ale věcné výhry se nepodařilo uložit.",
            variant: "destructive"
          });
        }
      }

      toast({
        title: "Úspěch",
        description: contestData?.message || "Soutěž byla úspěšně uložena",
      });

      // Reset form and refresh data
      resetContestForm();
      setShowContestDialog(false);
      fetchContests();

    } catch (error: any) {
      console.error('Error saving contest:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se uložit soutěž.",
        variant: "destructive"
      });
    }
  };

  const handleEditContest = async (contest: ContestData, openTab: string = 'basic') => {
    setEditingContest(contest);
    
    // Fetch full contest data including secondary image, banner, and poster
    let secondaryImage = '';
    let bannerImage = '';
    let posterUrl = '';
    try {
      const { data: fullContest } = await supabase
        .from('contests')
        .select('main_prize_secondary_image, banner_image, generated_poster_url')
        .eq('id', contest.contest_id)
        .single();
      if (fullContest) {
        secondaryImage = fullContest.main_prize_secondary_image || '';
        bannerImage = fullContest.banner_image || '';
        posterUrl = fullContest.generated_poster_url || '';
      }
    } catch (error) {
      console.error('Error fetching contest images:', error);
    }
    
    setContestForm({
      title: contest.title,
      description: contest.description || '',
      main_prize: contest.main_prize,
      main_image: contest.main_image || '',
      main_prize_secondary_image: secondaryImage,
      banner_image: bannerImage,
      status: contest.status,
      ticket_count: contest.ticket_count,
      ticket_price: contest.ticket_price
    });
    setSecondaryImagePreview(secondaryImage);
    setBannerImagePreview(bannerImage);
    setGeneratedPosterUrl(posterUrl);
    
    // Load existing bonus prizes for this contest
    try {
      const { data, error } = await supabase
        .from('bonus_prizes')
        .select('*')
        .eq('contest_id', contest.contest_id)
        .order('ticket_position', { ascending: true });

      if (!error && data) {
        setBonusPrizes(data);
        
        // Separate MioCoin bonuses from physical prizes
        const mioCoins = data.filter(p => p.amount && p.amount > 0);
        const physical = data.filter(p => !p.amount || p.amount === 0);
        
        // Set generated MioCoins positions for display
        setGeneratedMioCoins(mioCoins.map(p => p.ticket_position));
        
        // Set physical prizes for display
        setPhysicalPrizes(physical.map(p => ({
          id: p.id,
          description: p.description,
          ticketPosition: p.ticket_position,
          imageFile: null,
          imagePreview: ''
        })));
        
        // If there are MioCoins, calculate the form values
        if (mioCoins.length > 0) {
          const valuePerWin = mioCoins[0].amount || 10;
          setMioCoinBonusForm({
            totalToDistribute: mioCoins.length * valuePerWin,
            valuePerWin: valuePerWin,
            distributionMethod: 'random'
          });
        }
      }
    } catch (error) {
      console.error('Error loading bonus prizes:', error);
    }
    
    setDialogTab(openTab);
    setShowContestDialog(true);
  };

  const resetContestForm = () => {
    setEditingContest(null);
    setContestForm({
      title: '',
      description: '',
      main_prize: '',
      main_image: '',
      main_prize_secondary_image: '',
      banner_image: '',
      status: 'pending',
      ticket_count: 1000000,
      ticket_price: 1
    });
    setSelectedFile(null);
    setImagePreview('');
    setSelectedSecondaryFile(null);
    setSecondaryImagePreview('');
    setSelectedBannerFile(null);
    setBannerImagePreview('');
    setDialogTab('basic');
    setGeneratedMioCoins([]);
    setMioCoinBonusForm({
      totalToDistribute: 1000,
      valuePerWin: 10,
      distributionMethod: 'random'
    });
    setPhysicalPrizes([]);
    setNewPhysicalPrize({
      description: '',
      ticketPosition: 1,
      imageFile: null,
      imagePreview: ''
    });
    setGeneratedPosterUrl('');
  };

  // Helper function to check for position conflicts
  const getPositionConflicts = (): { hasDuplicates: boolean; conflictingPositions: number[] } => {
    const physicalPositions = physicalPrizes.map(p => p.ticketPosition);
    const mioCoinPositions = generatedMioCoins;
    
    // Check for duplicates within physical prizes
    const physicalDuplicates = physicalPositions.filter((pos, idx) => 
      physicalPositions.indexOf(pos) !== idx
    );
    
    // Check for duplicates within MioCoin positions
    const mioCoinDuplicates = mioCoinPositions.filter((pos, idx) => 
      mioCoinPositions.indexOf(pos) !== idx
    );
    
    // Check for conflicts between physical and MioCoin positions
    const crossConflicts = physicalPositions.filter(pos => mioCoinPositions.includes(pos));
    
    const allConflicts = [...new Set([...physicalDuplicates, ...mioCoinDuplicates, ...crossConflicts])];
    
    return {
      hasDuplicates: allConflicts.length > 0,
      conflictingPositions: allConflicts
    };
  };

  const isContestFormValid = (): boolean => {
    // TAB 1: Základní údaje
    const hasTitle = contestForm.title.trim() !== '';
    const hasMainPrize = contestForm.main_prize.trim() !== '';
    const hasTicketCount = contestForm.ticket_count > 0;
    const hasTicketPrice = contestForm.ticket_price > 0;
    const hasImage = editingContest
      ? true
      : (selectedFile !== null || contestForm.main_image.trim() !== '');
    
    const tab1Valid = hasTitle && hasMainPrize && hasTicketCount && hasTicketPrice && hasImage;
    
    // TAB 2: Bonusy – MioCoins
    let tab2Valid = true;
    if (mioCoinBonusForm.totalToDistribute > 0) {
      const hasValuePerWin = mioCoinBonusForm.valuePerWin > 0;
      const totalIsGreaterOrEqual = mioCoinBonusForm.totalToDistribute >= mioCoinBonusForm.valuePerWin;
      const hasGeneratedPositions = generatedMioCoins.length > 0;
      tab2Valid = hasValuePerWin && totalIsGreaterOrEqual && hasGeneratedPositions;
    }
    
    // TAB 3: Bonusy – věcné výhry
    let tab3Valid = true;
    if (physicalPrizes.length > 0) {
      tab3Valid = physicalPrizes.every(prize => 
        prize.description.trim() !== '' && prize.ticketPosition >= 1
      );
    }
    
    // Check for position conflicts
    const { hasDuplicates } = getPositionConflicts();
    const noPositionConflicts = !hasDuplicates;
    
    return tab1Valid && tab2Valid && tab3Valid && noPositionConflicts;
  };

  const handleGenerateMioCoinPositions = async () => {
    if (!contestForm.title || !contestForm.main_prize) {
      toast({
        title: "Chyba",
        description: "Nejprve vyplňte název soutěže a hlavní cenu na záložce Základní údaje.",
        variant: "destructive"
      });
      return;
    }

    const numberOfBonuses = Math.floor(mioCoinBonusForm.totalToDistribute / mioCoinBonusForm.valuePerWin);
    if (numberOfBonuses <= 0) {
      toast({
        title: "Chyba",
        description: "Celková hodnota musí být vyšší než hodnota jedné výhry.",
        variant: "destructive"
      });
      return;
    }

    // Get positions already used by physical prizes
    const physicalPositions = new Set(physicalPrizes.map(p => p.ticketPosition));

    // Generate positions locally (will be saved with contest)
    const positions: number[] = [];
    const maxPosition = contestForm.ticket_count;
    let skippedCount = 0;
    
    if (mioCoinBonusForm.distributionMethod === 'random') {
      const selectedPositions = new Set<number>();
      let attempts = 0;
      const maxAttempts = numberOfBonuses * 20; // Increased attempts due to potential conflicts
      
      while (positions.length < numberOfBonuses && attempts < maxAttempts) {
        const randomPos = Math.floor(Math.random() * maxPosition) + 1;
        // Skip positions already used by physical prizes
        if (physicalPositions.has(randomPos)) {
          skippedCount++;
          attempts++;
          continue;
        }
        if (!selectedPositions.has(randomPos)) {
          positions.push(randomPos);
          selectedPositions.add(randomPos);
        }
        attempts++;
      }
    } else {
      // step_interval (rovnoměrně)
      const step = Math.floor(maxPosition / numberOfBonuses);
      for (let i = 0; i < numberOfBonuses; i++) {
        const pos = Math.min((i + 1) * step, maxPosition);
        // Skip positions already used by physical prizes
        if (physicalPositions.has(pos)) {
          skippedCount++;
          continue;
        }
        positions.push(pos);
      }
    }
    
    positions.sort((a, b) => a - b);
    setGeneratedMioCoins(positions);
    
    let message = `Vygenerováno ${positions.length} pozic pro MioCoiny.`;
    if (skippedCount > 0) {
      message += ` Přeskočeno ${skippedCount} pozic obsazených věcnými výhrami.`;
    }
    message += ' Budou uloženy po vytvoření soutěže.';
    
    toast({
      title: "Pozice vygenerovány",
      description: message,
    });
  };

  const handleGenerateAIBanner = async () => {
    if (!contestForm.title || !contestForm.main_prize) {
      toast({
        title: "Chyba",
        description: "Nejprve vyplňte název soutěže a hlavní cenu.",
        variant: "destructive"
      });
      return;
    }

    setGeneratingBanner(true);
    
    try {
      // Build bonus summary
      let bonusSummary = '';
      if (generatedMioCoins.length > 0) {
        bonusSummary += `${generatedMioCoins.length}x MioCoin bonus (${mioCoinBonusForm.valuePerWin} each)`;
      }
      if (physicalPrizes.length > 0) {
        if (bonusSummary) bonusSummary += ', ';
        bonusSummary += `${physicalPrizes.length} physical prizes`;
      }

      const { data, error } = await supabase.functions.invoke('generate-contest-banner', {
        body: {
          title: contestForm.title,
          description: contestForm.description,
          main_prize: contestForm.main_prize,
          ticket_count: contestForm.ticket_count,
          ticket_price: contestForm.ticket_price,
          bonus_summary: bonusSummary
        }
      });

      if (error) {
        throw new Error(error.message || 'Chyba při volání funkce');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.url) {
        setContestForm({ ...contestForm, main_image: data.url });
        setImagePreview(data.url);
        setSelectedFile(null);
        toast({
          title: "Banner vygenerován",
          description: "AI úspěšně vygeneroval banner pro soutěž.",
        });
      }
    } catch (error: any) {
      console.error('Error generating AI banner:', error);
      toast({
        title: "Chyba při generování banneru",
        description: error.message || "Nepodařilo se vygenerovat banner.",
        variant: "destructive"
      });
    } finally {
      setGeneratingBanner(false);
    }
  };

  const handleGeneratePoster = async () => {
    if (!editingContest?.contest_id) {
      toast({
        title: "Chyba",
        description: "Plakát lze generovat pouze pro existující soutěž.",
        variant: "destructive"
      });
      return;
    }

    setGeneratingPoster(true);
    toast({
      title: "Generuji AI plakát…",
      description: "Prosím počkejte, toto může trvat několik sekund.",
    });

    try {
      const { data, error } = await supabase.functions.invoke('generate-poster', {
        body: { contest_id: editingContest.contest_id }
      });

      if (error) {
        throw new Error(error.message || 'Chyba při volání funkce');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.url) {
        setGeneratedPosterUrl(data.url);
        toast({
          title: "Plakát byl úspěšně vygenerován.",
          description: "AI vytvořil plakát pro soutěž.",
        });
      }
    } catch (error: any) {
      console.error('Error generating AI poster:', error);
      toast({
        title: "Chyba při generování plakátu",
        description: error.message || "Nepodařilo se vygenerovat plakát.",
        variant: "destructive"
      });
    } finally {
      setGeneratingPoster(false);
    }
  };

  const handleAddPhysicalPrize = () => {
    if (!newPhysicalPrize.description || newPhysicalPrize.ticketPosition < 1) {
      toast({
        title: "Chyba",
        description: "Vyplňte název výhry a pozici tiketu.",
        variant: "destructive"
      });
      return;
    }

    const position = newPhysicalPrize.ticketPosition;

    // Check if position is already used by another physical prize
    const existingPhysical = physicalPrizes.find(p => p.ticketPosition === position);
    if (existingPhysical) {
      toast({
        title: "Konflikt pozice",
        description: `Pozice #${position} je již obsazena jinou výhrou.`,
        variant: "destructive"
      });
      return;
    }

    // Check if position is already used by MioCoin bonuses
    if (generatedMioCoins.includes(position)) {
      toast({
        title: "Konflikt pozice",
        description: `Pozice #${position} je již obsazena jinou výhrou.`,
        variant: "destructive"
      });
      return;
    }

    const newPrize: PhysicalPrize = {
      id: crypto.randomUUID(),
      ...newPhysicalPrize
    };
    
    setPhysicalPrizes([...physicalPrizes, newPrize]);
    setNewPhysicalPrize({
      description: '',
      ticketPosition: 1,
      imageFile: null,
      imagePreview: ''
    });
    
    toast({
      title: "Přidáno",
      description: "Věcná výhra přidána do seznamu. Bude uložena po vytvoření soutěže.",
    });
  };

  const handleRemovePhysicalPrize = (id: string) => {
    setPhysicalPrizes(physicalPrizes.filter(p => p.id !== id));
  };

  const handlePhysicalPrizeImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Chyba",
          description: "Povolené formáty: .jpg, .jpeg, .png",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "Chyba",
          description: "Maximální velikost souboru je 5 MB",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setNewPhysicalPrize(prev => ({
          ...prev,
          imageFile: file,
          imagePreview: event.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500"><Target className="w-3 h-3 mr-1" />Aktivní</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Settings className="w-3 h-3 mr-1" />Připravena</Badge>;
      case 'closed':
        return <Badge variant="destructive"><Trophy className="w-3 h-3 mr-1" />Ukončena</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Připravena';
      case 'active':
        return 'Aktivní';
      case 'closed':
        return 'Ukončena';
      default:
        return status;
    }
  };

  const handleStatusChange = async (contestId: string, newStatus: string) => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .update({ status: newStatus })
        .eq('id', contestId)
        .select();

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: `Status soutěže byl změněn na: ${newStatus === 'pending' ? 'Připravena' : newStatus === 'active' ? 'Aktivní' : 'Ukončena'}`,
      });

      // Refresh contests list
      fetchContests();

    } catch (error: any) {
      console.error('Error updating contest status:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se změnit status soutěže.",
        variant: "destructive"
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Chyba",
          description: "Povolené formáty: .jpg, .jpeg, .png",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast({
          title: "Chyba",
          description: "Maximální velikost souboru je 5 MB",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      setSelectedFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSecondaryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Chyba",
          description: "Povolené formáty: .jpg, .jpeg, .png",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast({
          title: "Chyba",
          description: "Maximální velikost souboru je 5 MB",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      setSelectedSecondaryFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setSecondaryImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Chyba",
          description: "Povolené formáty: .jpg, .jpeg, .png",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast({
          title: "Chyba",
          description: "Maximální velikost souboru je 5 MB",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }

      setSelectedBannerFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setBannerImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      {/* Contest Management Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Správa soutěží</h2>
          <p className="text-muted-foreground">Vytvářejte a spravujte soutěže s bonusovými výhrami</p>
        </div>
        <Dialog open={showContestDialog} onOpenChange={setShowContestDialog}>
          <DialogTrigger asChild>
            <Button onClick={resetContestForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nová soutěž
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingContest ? 'Upravit soutěž' : 'Vytvořit novou soutěž'}
              </DialogTitle>
              <DialogDescription>
                Vyplňte informace o soutěži. Povinná pole jsou označena *.
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={dialogTab} onValueChange={setDialogTab} className="w-full">
              <TabsList className="flex w-full h-auto flex-wrap gap-1 p-1 overflow-x-auto">
                <TabsTrigger value="basic" className="flex-shrink-0 px-3 py-2 text-xs">Základní údaje</TabsTrigger>
                <TabsTrigger value="bonus-coins" className="flex-shrink-0 px-3 py-2 text-xs">Bonusy – MioCoins</TabsTrigger>
                <TabsTrigger value="main-prize-description" className="flex-shrink-0 px-3 py-2 text-xs">Popis hlavní výhry</TabsTrigger>
                <TabsTrigger value="bonus-physical" className="flex-shrink-0 px-3 py-2 text-xs">Bonusy – věcné</TabsTrigger>
                <TabsTrigger value="graphics-detail" className="flex-shrink-0 px-3 py-2 text-xs">Grafika – detail</TabsTrigger>
                <TabsTrigger value="graphics-banner" className="flex-shrink-0 px-3 py-2 text-xs">Grafika – banner</TabsTrigger>
                <TabsTrigger value="create" className="flex-shrink-0 px-3 py-2 text-xs">Vytvořit soutěž</TabsTrigger>
              </TabsList>

              {/* Tab 1: Základní údaje */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Název soutěže *</Label>
                    <Input
                      id="title"
                      value={contestForm.title}
                      onChange={(e) => setContestForm({...contestForm, title: e.target.value})}
                      placeholder="Zadejte název soutěže"
                    />
                  </div>
                  <div>
                    <Label htmlFor="main_prize">Hlavní cena *</Label>
                    <Input
                      id="main_prize"
                      value={contestForm.main_prize}
                      onChange={(e) => setContestForm({...contestForm, main_prize: e.target.value})}
                      placeholder="Např. iPhone 15 Pro"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Popis soutěže</Label>
                  <Textarea
                    id="description"
                    value={contestForm.description}
                    onChange={(e) => setContestForm({...contestForm, description: e.target.value})}
                    placeholder="Volitelný popis soutěže"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="image">Hlavní obrázek</Label>
                  <div className="flex gap-2 mt-1">
                    <input
                      id="image"
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      className="flex-1 p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateAIBanner}
                      disabled={generatingBanner || !contestForm.title || !contestForm.main_prize}
                      className="shrink-0"
                    >
                      {generatingBanner ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generuji...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Vygenerovat pomocí AI
                        </>
                      )}
                    </Button>
                  </div>
                  {(imagePreview || contestForm.main_image) && (
                    <div className="mt-2">
                      <img 
                        src={imagePreview || contestForm.main_image} 
                        alt="Preview" 
                        className="max-w-xs max-h-32 rounded-md border object-cover"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="ticket_count">Počet tiketů *</Label>
                    <Input
                      id="ticket_count"
                      type="number"
                      min="1"
                      value={contestForm.ticket_count}
                      onChange={(e) => setContestForm({...contestForm, ticket_count: parseInt(e.target.value) || 1})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ticket_price">Cena tiketu (MioCoins) *</Label>
                    <Input
                      id="ticket_price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={contestForm.ticket_price}
                      onChange={(e) => setContestForm({...contestForm, ticket_price: parseFloat(e.target.value) || 1})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={contestForm.status} onValueChange={(value) => setContestForm({...contestForm, status: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Připravena</SelectItem>
                        <SelectItem value="active">Aktivní</SelectItem>
                        <SelectItem value="closed">Ukončena</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Bonusy – MioCoins */}
              <TabsContent value="bonus-coins" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="totalToDistribute">Celkem rozdělit (MioCoins)</Label>
                    <Input
                      id="totalToDistribute"
                      type="number"
                      min="1"
                      value={mioCoinBonusForm.totalToDistribute}
                      onChange={(e) => setMioCoinBonusForm({...mioCoinBonusForm, totalToDistribute: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="valuePerWin">Hodnota jedné výhry (MioCoins)</Label>
                    <Input
                      id="valuePerWin"
                      type="number"
                      min="1"
                      value={mioCoinBonusForm.valuePerWin}
                      onChange={(e) => setMioCoinBonusForm({...mioCoinBonusForm, valuePerWin: parseInt(e.target.value) || 1})}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="distributionMethod">Způsob rozmístění</Label>
                  <Select 
                    value={mioCoinBonusForm.distributionMethod} 
                    onValueChange={(value: 'random' | 'step_interval') => setMioCoinBonusForm({...mioCoinBonusForm, distributionMethod: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="random">Náhodně</SelectItem>
                      <SelectItem value="step_interval">Rovnoměrně</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Počet bonusů: {Math.floor(mioCoinBonusForm.totalToDistribute / mioCoinBonusForm.valuePerWin) || 0}
                    </p>
                    {generatedMioCoins.length > 0 && (
                      <p className="text-sm text-green-600 font-medium">
                        Vygenerováno {generatedMioCoins.length} pozic
                      </p>
                    )}
                  </div>
                  <Button 
                    type="button" 
                    onClick={handleGenerateMioCoinPositions}
                    disabled={generatingBonuses}
                  >
                    <Coins className="w-4 h-4 mr-2" />
                    Vygenerovat pozice
                  </Button>
                </div>

                {generatedMioCoins.length > 0 && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Náhled pozic (prvních 20):</p>
                    <p className="text-sm font-mono">
                      {generatedMioCoins.slice(0, 20).join(', ')}{generatedMioCoins.length > 20 ? '...' : ''}
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Popis hlavní výhry */}
              <TabsContent value="main-prize-description" className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="main_prize_description">Popis hlavní výhry</Label>
                  <Textarea
                    id="main_prize_description"
                    value={contestForm.description}
                    onChange={(e) => setContestForm({...contestForm, description: e.target.value})}
                    placeholder="Podrobný popis hlavní výhry soutěže..."
                    rows={6}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="secondary_image_tab3">Doplňková fotografie hlavní výhry</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Tato fotografie se zobrazí na stránce detailu soutěže.
                  </p>
                  <input
                    id="secondary_image_tab3"
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    onChange={handleSecondaryFileSelect}
                    className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {(secondaryImagePreview || contestForm.main_prize_secondary_image) && (
                    <div className="mt-2">
                      <img 
                        src={secondaryImagePreview || contestForm.main_prize_secondary_image} 
                        alt="Náhled doplňkové fotografie" 
                        className="max-w-xs max-h-32 rounded-md border object-cover"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 4: Bonusy – věcné výhry */}
              <TabsContent value="bonus-physical" className="space-y-4 mt-4">
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Přidat věcnou výhru
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="physicalDescription">Název / popis *</Label>
                      <Input
                        id="physicalDescription"
                        value={newPhysicalPrize.description}
                        onChange={(e) => setNewPhysicalPrize({...newPhysicalPrize, description: e.target.value})}
                        placeholder="Např. Samsung Galaxy Watch"
                      />
                    </div>
                    <div>
                      <Label htmlFor="physicalPosition">Pozice tiketu *</Label>
                      <Input
                        id="physicalPosition"
                        type="number"
                        min="1"
                        max={contestForm.ticket_count}
                        value={newPhysicalPrize.ticketPosition}
                        onChange={(e) => setNewPhysicalPrize({...newPhysicalPrize, ticketPosition: parseInt(e.target.value) || 1})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="physicalImage">Obrázek výhry</Label>
                    <input
                      id="physicalImage"
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      onChange={handlePhysicalPrizeImageSelect}
                      className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {newPhysicalPrize.imagePreview && (
                      <div className="mt-2">
                        <img 
                          src={newPhysicalPrize.imagePreview} 
                          alt="Preview" 
                          className="max-w-xs max-h-24 rounded-md border object-cover"
                        />
                      </div>
                    )}
                  </div>
                  <Button type="button" onClick={handleAddPhysicalPrize} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Přidat do seznamu
                  </Button>
                </div>

                {physicalPrizes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Přidané věcné výhry ({physicalPrizes.length})</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Název</TableHead>
                          <TableHead>Pozice</TableHead>
                          <TableHead>Akce</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {physicalPrizes.map((prize) => (
                          <TableRow key={prize.id}>
                            <TableCell>{prize.description}</TableCell>
                            <TableCell>#{prize.ticketPosition}</TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleRemovePhysicalPrize(prize.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {physicalPrizes.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    Zatím nebyly přidány žádné věcné výhry.
                  </p>
                )}
              </TabsContent>

              {/* Tab 5: Grafika – detail soutěže */}
              <TabsContent value="graphics-detail" className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="secondary_image">Doplňková fotka hlavní výhry (pravý box)</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Tato fotka se zobrazí na stránce detailu soutěže v pravém boxu pod hero obrázkem.
                  </p>
                  <input
                    id="secondary_image"
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    onChange={handleSecondaryFileSelect}
                    className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {(secondaryImagePreview || contestForm.main_prize_secondary_image) && (
                    <div className="mt-2">
                      <img 
                        src={secondaryImagePreview || contestForm.main_prize_secondary_image} 
                        alt="Secondary Preview" 
                        className="max-w-xs max-h-32 rounded-md border object-cover"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 6: Grafika – banner */}
              <TabsContent value="graphics-banner" className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="banner_image">Banner soutěže</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Tento banner se zobrazí na stránce detailu soutěže nahoře nad ostatním obsahem.
                  </p>
                  <input
                    id="banner_image"
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    onChange={handleBannerFileSelect}
                    className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {(bannerImagePreview || contestForm.banner_image) && (
                    <div className="mt-2">
                      <img 
                        src={bannerImagePreview || contestForm.banner_image} 
                        alt="Banner Preview" 
                        className="max-w-xs max-h-32 rounded-md border object-cover"
                      />
                    </div>
                  )}
                </div>

                {/* AI Poster Generator */}
                {editingContest && (
                  <div className="pt-4 border-t">
                    <Label>AI generátor plakátu</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Vygenerujte plakát pomocí AI na základě informací o soutěži.
                    </p>
                    <Button 
                      type="button" 
                      onClick={handleGeneratePoster}
                      disabled={generatingPoster}
                      variant="outline"
                      className="w-full"
                    >
                      {generatingPoster ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generuji…
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Vygenerovat plakát (AI)
                        </>
                      )}
                    </Button>
                    {generatedPosterUrl && (
                      <img 
                        src={generatedPosterUrl} 
                        alt="AI Generated Poster" 
                        className="mt-4 w-full rounded-lg"
                      />
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Tab 7: Vytvořit soutěž */}
              <TabsContent value="create" className="space-y-4 mt-4">
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <p className="text-muted-foreground text-center">
                    Zkontrolujte všechny údaje a poté klikněte na tlačítko níže.
                  </p>
                  <div className="flex gap-4">
                    <Button variant="outline" onClick={() => setShowContestDialog(false)}>
                      Zrušit
                    </Button>
                    <Button onClick={handleSaveContest} disabled={!isContestFormValid()}>
                      {editingContest ? 'Aktualizovat' : 'Vytvořit'}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Contests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Seznam soutěží
          </CardTitle>
          <CardDescription>
            Přehled všech soutěží s jejich statusem a pokrokem
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Načítám soutěže...</p>
            </div>
          ) : contests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Žádné soutěže nebyly nalezeny.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Hlavní cena</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Pokrok</TableHead>
                  <TableHead className="text-center">Bonusy</TableHead>
                  <TableHead>Cena tiketu</TableHead>
                  <TableHead>Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contests.map((contest) => (
                  <TableRow key={contest.contest_id}>
                    <TableCell className="font-medium">{contest.title}</TableCell>
                    <TableCell>{contest.main_prize}</TableCell>
                    <TableCell>{getStatusBadge(contest.status)}</TableCell>
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <div className="text-sm">
                          {contest.tickets_sold.toLocaleString()} / {contest.ticket_count.toLocaleString()}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(contest.progress_percentage, 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {contest.progress_percentage}%
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{contest.bonus_count}</Badge>
                    </TableCell>
                    <TableCell>{contest.ticket_price} MioCoins</TableCell>
                    <TableCell>
                      <div className="flex gap-2 items-center">
                        <Select
                          value={contest.status}
                          onValueChange={(value) => handleStatusChange(contest.contest_id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue>
                              {getStatusLabel(contest.status)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Připravena</SelectItem>
                            <SelectItem value="active">Aktivní</SelectItem>
                            <SelectItem value="closed">Ukončena</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditContest(contest)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Editovat
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditContest(contest, 'bonus-coins')}
                        >
                          <Coins className="w-3 h-3 mr-1" />
                          Bonusy
                        </Button>
                      </div>
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