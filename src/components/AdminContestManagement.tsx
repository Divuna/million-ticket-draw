import React, { useState, useEffect, useRef } from 'react';
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
import { Plus, Edit2, Trophy, Ticket, Image, Coins, Target, TrendingUp, Settings, Trash2, Package } from 'lucide-react';

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
  status: string;
  ticket_count: number;
  ticket_price: number;
}

interface BonusPrizeForm {
  description: string;
  ticket_position: number;
  amount: number | null;
  status: string;
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
  const [selectedContestId, setSelectedContestId] = useState<string>('');
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingContest, setEditingContest] = useState<ContestData | null>(null);
  const [editingBonusPrize, setEditingBonusPrize] = useState<BonusPrize | null>(null);
  const [showContestDialog, setShowContestDialog] = useState(false);
  const [showBonusDialog, setShowBonusDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const bonusPanelRef = useRef<HTMLDivElement>(null);
  const [dialogTab, setDialogTab] = useState('basic');
  const [generatingBonuses, setGeneratingBonuses] = useState(false);
  const [generatedMioCoins, setGeneratedMioCoins] = useState<number[]>([]);

  const [contestForm, setContestForm] = useState<ContestForm>({
    title: '',
    description: '',
    main_prize: '',
    main_image: '',
    status: 'pending',
    ticket_count: 1000000,
    ticket_price: 1
  });

  const [bonusPrizeForm, setBonusPrizeForm] = useState<BonusPrizeForm>({
    description: '',
    ticket_position: 1,
    amount: null,
    status: 'pending'
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

  // Fetch bonus prizes when contest is selected
  useEffect(() => {
    if (selectedContestId) {
      fetchBonusPrizes(selectedContestId);
    }
  }, [selectedContestId]);

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

      // Upload image if file is selected
      if (selectedFile) {
        imageUrl = await handleImageUpload(selectedFile);
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

  const handleSaveBonusPrize = async () => {
    try {
      const operation = editingBonusPrize ? 'update' : 'create';
      const { data, error } = await supabase
        .rpc('admin_manage_bonus_prize', {
          p_prize_id: editingBonusPrize?.id || null,
          p_contest_id: selectedContestId,
          p_description: bonusPrizeForm.description,
          p_ticket_position: bonusPrizeForm.ticket_position,
          p_amount: bonusPrizeForm.amount,
          p_status: bonusPrizeForm.status,
          p_operation: operation
        });

      if (error) throw error;

      toast({
        title: "Úspěch",
        description: (data as any)?.message || "Bonusová výhra byla úspěšně uložena",
      });

      // Reset form and refresh data
      resetBonusPrizeForm();
      setShowBonusDialog(false);
      fetchBonusPrizes(selectedContestId);
      fetchContests(); // Refresh to update bonus summary

    } catch (error: any) {
      console.error('Error saving bonus prize:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se uložit bonusovou výhru.",
        variant: "destructive"
      });
    }
  };

  const handleEditContest = (contest: ContestData) => {
    setEditingContest(contest);
    setContestForm({
      title: contest.title,
      description: contest.description || '',
      main_prize: contest.main_prize,
      main_image: contest.main_image || '',
      status: contest.status,
      ticket_count: contest.ticket_count,
      ticket_price: contest.ticket_price
    });
    setShowContestDialog(true);
  };

  const handleEditBonusPrize = (prize: BonusPrize) => {
    setEditingBonusPrize(prize);
    setBonusPrizeForm({
      description: prize.description,
      ticket_position: prize.ticket_position,
      amount: prize.amount || null,
      status: prize.status
    });
    setShowBonusDialog(true);
  };

  const resetContestForm = () => {
    setEditingContest(null);
    setContestForm({
      title: '',
      description: '',
      main_prize: '',
      main_image: '',
      status: 'pending',
      ticket_count: 1000000,
      ticket_price: 1
    });
    setSelectedFile(null);
    setImagePreview('');
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
    
    return tab1Valid && tab2Valid && tab3Valid;
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

    // Generate positions locally (will be saved with contest)
    const positions: number[] = [];
    const maxPosition = contestForm.ticket_count;
    
    if (mioCoinBonusForm.distributionMethod === 'random') {
      const selectedPositions = new Set<number>();
      let attempts = 0;
      const maxAttempts = numberOfBonuses * 10;
      
      while (positions.length < numberOfBonuses && attempts < maxAttempts) {
        const randomPos = Math.floor(Math.random() * maxPosition) + 1;
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
        positions.push(Math.min((i + 1) * step, maxPosition));
      }
    }
    
    positions.sort((a, b) => a - b);
    setGeneratedMioCoins(positions);
    
    toast({
      title: "Pozice vygenerovány",
      description: `Vygenerováno ${positions.length} pozic pro MioCoiny. Budou uloženy po vytvoření soutěže.`,
    });
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

  const resetBonusPrizeForm = () => {
    setEditingBonusPrize(null);
    setBonusPrizeForm({
      description: '',
      ticket_position: 1,
      amount: null,
      status: 'pending'
    });
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
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Základní údaje</TabsTrigger>
                <TabsTrigger value="miocoins" disabled={!!editingContest}>Bonusy – MioCoins</TabsTrigger>
                <TabsTrigger value="physical" disabled={!!editingContest}>Bonusy – věcné výhry</TabsTrigger>
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
                  <input
                    id="image"
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="w-full p-2 border rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {imagePreview && (
                    <div className="mt-2">
                      <img 
                        src={imagePreview} 
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
              <TabsContent value="miocoins" className="space-y-4 mt-4">
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

              {/* Tab 3: Bonusy – věcné výhry */}
              <TabsContent value="physical" className="space-y-4 mt-4">
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
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowContestDialog(false)}>
                Zrušit
              </Button>
              <Button onClick={handleSaveContest} disabled={!isContestFormValid()}>
                {editingContest ? 'Aktualizovat' : 'Vytvořit'}
              </Button>
            </DialogFooter>
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
                          onClick={() => {
                            setSelectedContestId(contest.contest_id);
                            setTimeout(() => {
                              bonusPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 100);
                          }}
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

      {/* Bonus Prizes Management */}
      {selectedContestId && (
        <Card ref={bonusPanelRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5" />
              Bonusové výhry - {contests.find(c => c.contest_id === selectedContestId)?.title}
            </CardTitle>
            <CardDescription>
              Spravujte bonusové výhry pro vybranou soutěž
            </CardDescription>
            <div className="flex justify-end">
              <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
                <DialogTrigger asChild>
                  <Button onClick={resetBonusPrizeForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    Přidat bonusovou výhru
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingBonusPrize ? 'Upravit bonusovou výhru' : 'Přidat bonusovou výhru'}
                    </DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="bonus_description">Popis výhry *</Label>
                      <Input
                        id="bonus_description"
                        value={bonusPrizeForm.description}
                        onChange={(e) => setBonusPrizeForm({...bonusPrizeForm, description: e.target.value})}
                        placeholder="Např. 100 MioCoins nebo Samsung Galaxy Watch"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="ticket_position">Pozice tiketu *</Label>
                        <Input
                          id="ticket_position"
                          type="number"
                          min="1"
                          value={bonusPrizeForm.ticket_position}
                          onChange={(e) => setBonusPrizeForm({...bonusPrizeForm, ticket_position: parseInt(e.target.value) || 1})}
                        />
                      </div>
                      <div>
                        <Label htmlFor="amount">Hodnota MioCoins</Label>
                        <Input
                          id="amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={bonusPrizeForm.amount || ''}
                          onChange={(e) => setBonusPrizeForm({...bonusPrizeForm, amount: e.target.value ? parseFloat(e.target.value) : null})}
                          placeholder="Pro fyzické výhry ponechte prázdné"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="bonus_status">Status</Label>
                      <Select value={bonusPrizeForm.status} onValueChange={(value) => setBonusPrizeForm({...bonusPrizeForm, status: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Čeká</SelectItem>
                          <SelectItem value="won">Vyhráno</SelectItem>
                          <SelectItem value="delivered">Předáno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowBonusDialog(false)}>
                      Zrušit
                    </Button>
                    <Button onClick={handleSaveBonusPrize}>
                      {editingBonusPrize ? 'Aktualizovat' : 'Přidat'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {bonusPrizes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">V této soutěži nejsou žádné bonusové výhry.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pozice</TableHead>
                    <TableHead>Popis</TableHead>
                    <TableHead>Hodnota</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bonusPrizes.map((prize) => (
                    <TableRow key={prize.id}>
                      <TableCell className="font-medium">#{prize.ticket_position}</TableCell>
                      <TableCell>{prize.description}</TableCell>
                      <TableCell>
                        {prize.amount && prize.amount > 0 ? `${prize.amount} MioCoins` : 'Fyzická výhra'}
                      </TableCell>
                      <TableCell>{getStatusBadge(prize.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditBonusPrize(prize)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Upravit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};