import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
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
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Upload, Calendar as CalendarIcon, Image as ImageIcon, Search, Edit, Trash2, Eye, LayoutTemplate } from 'lucide-react';
import YouTubeEmbed from '@/components/YouTubeEmbed';
import { useHomepageVideoSimple } from '@/hooks/useHomepageVideoSimple';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface BannerForm {
  title: string;
  imageFile: File | null;
  videoUrl: string;
  active: boolean;
  targetPage: string;
  permanent: boolean;
  startDate: Date | undefined;
  endDate: Date | undefined;
}

interface Banner {
  id: string;
  title: string;
  image_url: string;
  active: boolean;
  target_page: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

const AdminBanners: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [previewBanner, setPreviewBanner] = useState<Banner | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
  const [homepageVideoUrl, setHomepageVideoUrl] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [videoSaveLoading, setVideoSaveLoading] = useState(false);
  const { videoUrl, isActive: isVideoActive, loading: videoSettingsLoading, updateVideoSettings } = useHomepageVideoSimple();
  
  // Coming soon banners state
  const [comingSoonBanners, setComingSoonBanners] = useState<Array<{id: string, image_url: string, title: string | null}>>([]);
  const [comingSoonUploading, setComingSoonUploading] = useState<{[key: number]: boolean}>({});
  const [comingSoonTitles, setComingSoonTitles] = useState<{[key: number]: string}>({0: '', 1: '', 2: ''});
  const [comingSoonTitleSaving, setComingSoonTitleSaving] = useState<{[key: number]: boolean}>({});
  
  const [bannerForm, setBannerForm] = useState<BannerForm>({
    title: '',
    imageFile: null,
    videoUrl: '',
    active: true,
    targetPage: 'homepage_customer',
    permanent: true,
    startDate: undefined,
    endDate: undefined,
  });

  useEffect(() => {
    if (roleLoading || !user || !isAdmin) return;
    fetchBanners();
    fetchComingSoonBanners();
  }, [user, isAdmin, roleLoading]);

  // Load existing video URL when component mounts
  useEffect(() => {
    if (videoUrl) {
      setHomepageVideoUrl(videoUrl);
    }
  }, [videoUrl]);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, active, target_page, start_date, end_date, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBanners(data || []);
    } catch (error: any) {
      console.error('Error fetching banners:', error);
      toast.error('Chyba při načítání bannerů');
    } finally {
      setLoading(false);
    }
  };

  // Sync editable titles when banners load
  useEffect(() => {
    setComingSoonTitles({
      0: comingSoonBanners[0]?.title ?? `Připravujeme 1`,
      1: comingSoonBanners[1]?.title ?? `Připravujeme 2`,
      2: comingSoonBanners[2]?.title ?? `Připravujeme 3`,
    });
  }, [comingSoonBanners]);

  const handleComingSoonTitleSave = async (slotIndex: number) => {
    const banner = comingSoonBanners[slotIndex];
    if (!banner) {
      toast.info('Nejprve nahrajte obrázek banneru, pak popisek bude uložen automaticky.');
      return;
    }
    const newTitle = comingSoonTitles[slotIndex] || `Připravujeme ${slotIndex + 1}`;
    setComingSoonTitleSaving(prev => ({ ...prev, [slotIndex]: true }));
    try {
      const { error } = await supabase
        .from('coming_soon_banners')
        .update({ title: newTitle })
        .eq('id', banner.id);
      if (error) throw error;
      toast.success('Popisek uložen');
      fetchComingSoonBanners();
    } catch {
      toast.error('Chyba při ukládání popisku');
    } finally {
      setComingSoonTitleSaving(prev => ({ ...prev, [slotIndex]: false }));
    }
  };

  const fetchComingSoonBanners = async () => {
    try {
      const { data, error } = await supabase
        .from('coming_soon_banners')
        .select('id, image_url, title')
        .order('created_at', { ascending: true })
        .limit(3);

      if (error) throw error;
      setComingSoonBanners(data || []);
    } catch (error: any) {
      console.error('Error fetching coming soon banners:', error);
    }
  };

  const handleComingSoonUpload = async (slotIndex: number, file: File) => {
    try {
      setComingSoonUploading({ ...comingSoonUploading, [slotIndex]: true });
      
      // Upload image
      const imageUrl = await uploadImage(file, 'banner-images');
      
      // Check if we already have a banner for this slot
      const existingBanner = comingSoonBanners[slotIndex];
      
      if (existingBanner) {
        // Update existing record
        const { error } = await supabase
          .from('coming_soon_banners')
          .update({ image_url: imageUrl })
          .eq('id', existingBanner.id);
        
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('coming_soon_banners')
          .insert({
            image_url: imageUrl,
            title: comingSoonTitles[slotIndex] || `Připravujeme ${slotIndex + 1}`
          });
        
        if (error) throw error;
      }
      
      toast.success(`Banner ${slotIndex + 1} byl úspěšně nahrán`);
      fetchComingSoonBanners();
    } catch (error: any) {
      console.error('Error uploading coming soon banner:', error);
      toast.error('Chyba při nahrávání banneru');
    } finally {
      setComingSoonUploading({ ...comingSoonUploading, [slotIndex]: false });
    }
  };

  const uploadImage = async (file: File, bucket: string = 'banner-images'): Promise<string> => {
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

  const handleCreateBanner = async () => {
    if (!bannerForm.title) {
      toast.error('Název banneru je povinný');
      return;
    }

    if (bannerForm.targetPage === 'homepage_video') {
      if (!bannerForm.videoUrl) {
        toast.error('YouTube URL je povinná pro video banner');
        return;
      }
    } else {
      if (!bannerForm.imageFile) {
        toast.error('Obrázek je povinný pro běžný banner');
        return;
      }
    }

    try {
      setCreateLoading(true);

      let imageUrl = '';
      
      if (bannerForm.targetPage === 'homepage_video') {
        // For video banners, store the YouTube URL in image_url field
        imageUrl = bannerForm.videoUrl;
      } else {
        // For regular banners, upload the image file
        imageUrl = await uploadImage(bannerForm.imageFile!);
      }

      // Create banner
      const { data, error } = await supabase
        .from('banners')
        .insert({
          title: bannerForm.title,
          image_url: imageUrl,
          active: bannerForm.active,
          target_page: bannerForm.targetPage,
          start_date: bannerForm.permanent ? null : bannerForm.startDate?.toISOString().split('T')[0],
          end_date: bannerForm.permanent ? null : bannerForm.endDate?.toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Banner byl úspěšně vytvořen');
      setShowCreateDialog(false);
      resetForm();
      fetchBanners();
    } catch (error: any) {
      console.error('Error creating banner:', error);
      toast.error('Chyba při vytváření banneru');
    } finally {
      setCreateLoading(false);
    }
  };

  const resetForm = () => {
    setBannerForm({
      title: '',
      imageFile: null,
      videoUrl: '',
      active: true,
      targetPage: 'homepage_customer',
      permanent: true,
      startDate: undefined,
      endDate: undefined,
    });
  };

  const handleDeleteBanner = async (bannerId: string) => {
    try {
      setDeleteLoading(true);
      
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', bannerId);

      if (error) throw error;
      
      toast.success('Banner byl úspěšně smazán');
      fetchBanners();
    } catch (error: any) {
      console.error('Error deleting banner:', error);
      toast.error('Chyba při mazání banneru');
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleBannerActive = async (bannerId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('banners')
        .update({ active: !currentActive })
        .eq('id', bannerId);

      if (error) throw error;
      
      toast.success(currentActive ? 'Banner byl deaktivován' : 'Banner byl aktivován');
      fetchBanners();
    } catch (error: any) {
      console.error('Error toggling banner:', error);
      toast.error('Chyba při změně stavu banneru');
    }
  };

  const filteredBanners = banners.filter(banner => {
    const matchesSearch = banner.title.toLowerCase().includes(searchTerm.toLowerCase());
    if (statusFilter === 'all') return matchesSearch;
    
    const now = new Date();
    const startDate = banner.start_date ? new Date(banner.start_date) : null;
    const endDate = banner.end_date ? new Date(banner.end_date) : null;
    
    let bannerStatus = 'active';
    if (!banner.active) bannerStatus = 'inactive';
    else if (startDate && now < startDate) bannerStatus = 'scheduled';
    else if (endDate && now > endDate) bannerStatus = 'expired';
    
    return matchesSearch && bannerStatus === statusFilter;
  });

  const getStatusBadge = (banner: Banner) => {
    if (!banner.active) {
      return <Badge variant="secondary">Neaktivní</Badge>;
    }

    const now = new Date();
    const startDate = banner.start_date ? new Date(banner.start_date) : null;
    const endDate = banner.end_date ? new Date(banner.end_date) : null;

    if (startDate && now < startDate) {
      return <Badge variant="secondary">Naplánováno</Badge>;
    }
    if (endDate && now > endDate) {
      return <Badge variant="destructive">Vypršelo</Badge>;
    }
    return <Badge variant="default">Aktivní</Badge>;
  };

  const getValidityText = (banner: Banner) => {
    if (!banner.start_date && !banner.end_date) return 'Trvale';
    const startDate = banner.start_date ? new Date(banner.start_date).toLocaleDateString('cs-CZ') : 'Neurčeno';
    const endDate = banner.end_date ? new Date(banner.end_date).toLocaleDateString('cs-CZ') : 'Neurčeno';
    return `${startDate} - ${endDate}`;
  };

  const handleUpdateBanner = async () => {
    if (!bannerForm.title || !editingBanner) {
      toast.error('Název banneru je povinný');
      return;
    }

    try {
      setEditLoading(true);

      let imageUrl = editingBanner.image_url;
      
      // If new image/video was provided
      if (bannerForm.targetPage === 'homepage_video' && bannerForm.videoUrl) {
        imageUrl = bannerForm.videoUrl;
      } else if (bannerForm.imageFile) {
        imageUrl = await uploadImage(bannerForm.imageFile);
      }

      const { error } = await supabase
        .from('banners')
        .update({
          title: bannerForm.title,
          image_url: imageUrl,
          active: bannerForm.active,
          target_page: bannerForm.targetPage,
          start_date: bannerForm.permanent ? null : bannerForm.startDate?.toISOString().split('T')[0],
          end_date: bannerForm.permanent ? null : bannerForm.endDate?.toISOString().split('T')[0],
        })
        .eq('id', editingBanner.id);

      if (error) throw error;

      toast.success('Banner byl úspěšně aktualizován');
      setShowEditDialog(false);
      setEditingBanner(null);
      resetForm();
      fetchBanners();
    } catch (error: any) {
      console.error('Error updating banner:', error);
      toast.error('Chyba při aktualizaci banneru');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditClick = (banner: Banner) => {
    setEditingBanner(banner);
    const isPermanent = !banner.start_date && !banner.end_date;
    setBannerForm({
      title: banner.title,
      imageFile: null,
      videoUrl: banner.target_page === 'homepage_video' ? banner.image_url : '',
      active: banner.active,
      targetPage: banner.target_page,
      permanent: isPermanent,
      startDate: banner.start_date ? new Date(banner.start_date) : undefined,
      endDate: banner.end_date ? new Date(banner.end_date) : undefined,
    });
    setShowEditDialog(true);
  };

  const handlePreviewClick = (banner: Banner) => {
    setPreviewBanner(banner);
    setShowPreviewDialog(true);
  };

  const handleSaveVideoSettings = async () => {
    if (!homepageVideoUrl.trim()) {
      toast.error('YouTube URL je povinná');
      return;
    }

    try {
      setVideoSaveLoading(true);
      const result = await updateVideoSettings(homepageVideoUrl, true);
      
      if (result.success) {
        toast.success('Nastavení videa bylo úspěšně uloženo');
      } else {
        toast.error('Chyba při ukládání nastavení: ' + result.error);
      }
    } catch (error: any) {
      toast.error('Chyba při ukládání nastavení videa');
      console.error('Error saving video settings:', error);
    } finally {
      setVideoSaveLoading(false);
    }
  };

  if (roleLoading || authLoading) {
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
    return <Navigate to="/" replace />;
  }

  if (loading) {
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
    <>
    <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Správa bannerů</h1>
            <p className="text-muted-foreground">
              Správa všech bannerů v systému
            </p>
          </div>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nový Banner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Vytvořit Nový Banner</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Název banneru *</Label>
                  <Input
                    id="title"
                    value={bannerForm.title}
                    onChange={(e) => setBannerForm({...bannerForm, title: e.target.value})}
                    placeholder="Např. Prémiová hlavní výhra - vyhrajte až 1 milion!"
                  />
                </div>

                {bannerForm.targetPage === 'homepage_video' ? (
                  <div className="space-y-2">
                    <Label htmlFor="videoUrl">YouTube URL *</Label>
                    <Input
                      id="videoUrl"
                      type="url"
                      value={bannerForm.videoUrl}
                      onChange={(e) => setBannerForm({...bannerForm, videoUrl: e.target.value})}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Zadejte URL YouTube videa, které bude zobrazeno na domovské stránce
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="bannerImage">Obrázek banneru *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="bannerImage"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setBannerForm({...bannerForm, imageFile: e.target.files?.[0] || null})}
                        className="flex-1"
                      />
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Doporučené rozměry: Plná šířka × 320px (mobil), 384px (desktop)
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Cílová stránka</Label>
                  <Select
                    value={bannerForm.targetPage}
                    onValueChange={(value) => setBannerForm({...bannerForm, targetPage: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="homepage_customer">Domovská stránka</SelectItem>
                      <SelectItem value="vouchers">Kupte Voucher</SelectItem>
                      <SelectItem value="games">Hraj o luxusní ceny</SelectItem>
                      <SelectItem value="homepage_video">Jak to funguje (Video)</SelectItem>
                      <SelectItem value="MioCoin balíček – 50">MioCoin balíček – 50</SelectItem>
                      <SelectItem value="MioCoin balíček – 310">MioCoin balíček – 310</SelectItem>
                      <SelectItem value="MioCoin balíček – 525">MioCoin balíček – 525</SelectItem>
                      <SelectItem value="MioCoin balíček – 1280">MioCoin balíček – 1280</SelectItem>
                      <SelectItem value="Probíhající soutěže">Probíhající soutěže</SelectItem>
                      <SelectItem value="Koupit voucher se slevou">Koupit voucher se slevou</SelectItem>
                      <SelectItem value="Vzhled – karta výher">Vzhled – karta výher</SelectItem>
                    </SelectContent>
                  </Select>
                  {(bannerForm.targetPage.startsWith('MioCoin') || bannerForm.targetPage === 'Probíhající soutěže' || bannerForm.targetPage === 'Koupit voucher se slevou') && (
                    <p className="text-xs text-muted-foreground">
                      Doporučené rozměry pro kartičkové bannery: 200 × 140 px
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={bannerForm.active}
                    onCheckedChange={(checked) => setBannerForm({...bannerForm, active: checked})}
                  />
                  <Label htmlFor="active">Aktivní</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="permanent"
                    checked={bannerForm.permanent}
                    onCheckedChange={(checked) => setBannerForm({...bannerForm, permanent: checked, startDate: checked ? undefined : bannerForm.startDate, endDate: checked ? undefined : bannerForm.endDate})}
                  />
                  <Label htmlFor="permanent">Zobrazovat trvale (bez omezení datumem)</Label>
                </div>

                {!bannerForm.permanent && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Datum začátku</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left font-normal",
                              !bannerForm.startDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {bannerForm.startDate ? format(bannerForm.startDate, 'dd.MM.yyyy') : 'Vybrat datum'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={bannerForm.startDate}
                            onSelect={(date) => setBannerForm({...bannerForm, startDate: date})}
                            initialFocus
                            className="p-3"
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
                              !bannerForm.endDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {bannerForm.endDate ? format(bannerForm.endDate, 'dd.MM.yyyy') : 'Vybrat datum'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={bannerForm.endDate}
                            onSelect={(date) => setBannerForm({...bannerForm, endDate: date})}
                            initialFocus
                            className="p-3"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <Button
                    onClick={handleCreateBanner}
                    disabled={createLoading}
                    className="flex-1"
                  >
                    {createLoading ? 'Vytváří se...' : 'Vytvořit Banner'}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                    disabled={createLoading}
                  >
                    Zrušit
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Filtry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Hledat banner podle názvu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filtr podle stavu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Všechny</SelectItem>
                  <SelectItem value="active">Aktivní</SelectItem>
                  <SelectItem value="inactive">Neaktivní</SelectItem>
                  <SelectItem value="scheduled">Naplánované</SelectItem>
                  <SelectItem value="expired">Vypršelé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Homepage Video Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎬 YouTube URL úvodní stránka
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="homepageVideoUrl">YouTube URL pro úvodní video</Label>
              <Input
                id="homepageVideoUrl"
                type="url"
                value={homepageVideoUrl}
                onChange={(e) => setHomepageVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full"
                disabled={videoSettingsLoading}
              />
              <p className="text-xs text-muted-foreground">
                Zadejte URL YouTube videa, které se zobrazí na úvodní stránce pod sekcí partnerů
              </p>
              {videoUrl && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Aktuální URL: {videoUrl}
                </p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="homepageVideoActive" 
                checked={isVideoActive}
                disabled={videoSettingsLoading}
              />
              <Label htmlFor="homepageVideoActive">Aktivní video na úvodní stránce</Label>
            </div>
            
            <Button 
              className="w-full"
              onClick={handleSaveVideoSettings}
              disabled={videoSaveLoading || videoSettingsLoading}
            >
              {videoSaveLoading ? 'Ukládá se...' : 'Uložit nastavení videa'}
            </Button>
          </CardContent>
        </Card>

        {/* Coming Soon Banners */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Připravujeme (3 bannery)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Nahrajte 3 obrázky, které se zobrazí v sekci "Připravujeme" na úvodní stránce
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((slotIndex) => {
                const banner = comingSoonBanners[slotIndex];
                const isUploading = comingSoonUploading[slotIndex];
                
                return (
                  <div key={slotIndex} className="space-y-3">
                    {/* Slot heading */}
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Slot {slotIndex + 1}
                    </p>

                    {/* Image preview with label overlay */}
                    {banner?.image_url ? (
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-[rgba(255,138,0,0.25)]">
                        <img
                          src={banner.image_url}
                          alt={banner.title ?? `Připravujeme ${slotIndex + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Premium label overlay */}
                        <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent">
                          <p
                            className="font-bold tracking-wide truncate"
                            style={{
                              fontFamily: "'Poppins', system-ui, sans-serif",
                              fontSize: '0.85rem',
                              background: 'linear-gradient(90deg, #E7EBF0 0%, #FFB547 60%, #FF8A00 100%)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text',
                              textShadow: 'none',
                            }}
                          >
                            {comingSoonTitles[slotIndex] || `Připravujeme ${slotIndex + 1}`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video rounded-lg border border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/10">
                        <p className="text-xs text-muted-foreground">Bez obrázku</p>
                      </div>
                    )}

                    {/* Editable label */}
                    <div className="space-y-1">
                      <Label htmlFor={`coming-soon-title-${slotIndex}`} className="text-xs text-muted-foreground">
                        Popisek banneru
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={`coming-soon-title-${slotIndex}`}
                          type="text"
                          value={comingSoonTitles[slotIndex] ?? ''}
                          onChange={(e) => setComingSoonTitles(prev => ({ ...prev, [slotIndex]: e.target.value }))}
                          placeholder={`Připravujeme ${slotIndex + 1}`}
                          className="flex-1 text-sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleComingSoonTitleSave(slotIndex)}
                          disabled={comingSoonTitleSaving[slotIndex]}
                          className="shrink-0 border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.1)] text-xs"
                        >
                          {comingSoonTitleSaving[slotIndex] ? 'Ukládám…' : 'Uložit'}
                        </Button>
                      </div>
                    </div>

                    {/* Image upload */}
                    <div className="space-y-1">
                      <Label htmlFor={`coming-soon-${slotIndex}`} className="text-xs text-muted-foreground">
                        Obrázek
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`coming-soon-${slotIndex}`}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleComingSoonUpload(slotIndex, file);
                          }}
                          disabled={isUploading}
                          className="flex-1"
                        />
                        <Upload className={cn(
                          "h-4 w-4",
                          isUploading ? "animate-pulse text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      {isUploading && (
                        <p className="text-xs text-primary">Nahrává se...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Banners Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              Bannery ({filteredBanners.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredBanners.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Žádné bannery nevyhovují nastaveným filtrům' 
                  : 'Zatím nebyly vytvořeny žádné bannery'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Název</TableHead>
                    <TableHead>Náhled</TableHead>
                    <TableHead>Aktivní</TableHead>
                    <TableHead>Platnost</TableHead>
                    <TableHead>Cílová stránka</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                    <TableHead>Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBanners.map((banner) => (
                    <TableRow key={banner.id}>
                      <TableCell className="font-medium">
                        {banner.title}
                      </TableCell>
                      <TableCell>
                        <img 
                          src={banner.image_url} 
                          alt={banner.title}
                          className="w-16 h-10 object-cover rounded border"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(banner)}
                          <Switch
                            checked={banner.active}
                            onCheckedChange={() => toggleBannerActive(banner.id, banner.active)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {getValidityText(banner)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {banner.target_page === 'homepage_customer' ? 'Domů' : 
                           banner.target_page === 'games' ? 'Hry' : 
                           banner.target_page === 'vouchers' ? 'Vouchery' : banner.target_page}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(banner.created_at).toLocaleDateString('cs-CZ')}
                      </TableCell>
                       <TableCell>
                         <div className="flex space-x-2">
                           <Button variant="outline" size="sm" onClick={() => handlePreviewClick(banner)}>
                             <Eye className="h-4 w-4" />
                           </Button>
                           <Button variant="outline" size="sm" onClick={() => handleEditClick(banner)}>
                             <Edit className="h-4 w-4" />
                           </Button>
                           <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Smazat banner</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Opravdu chcete smazat banner "{banner.title}"? Tato akce je nevratná.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Zrušit</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteBanner(banner.id)}
                                  disabled={deleteLoading}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Smazat
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
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Náhled banneru</DialogTitle>
          </DialogHeader>
          {previewBanner && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">{previewBanner.title}</h3>
                <div className="flex gap-2 items-center">
                  {getStatusBadge(previewBanner)}
                  <Badge variant="outline">{previewBanner.target_page}</Badge>
                </div>
              </div>
              
              {previewBanner.target_page === 'homepage_video' ? (
                <YouTubeEmbed url={previewBanner.image_url} className="w-full" />
              ) : (
                <img 
                  src={previewBanner.image_url} 
                  alt={previewBanner.title}
                  className="w-full h-auto rounded-lg border"
                />
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold">Platnost:</span>
                  <p className="text-muted-foreground">{getValidityText(previewBanner)}</p>
                </div>
                <div>
                  <span className="font-semibold">Vytvořeno:</span>
                  <p className="text-muted-foreground">
                    {new Date(previewBanner.created_at).toLocaleDateString('cs-CZ')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditingBanner(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upravit Banner</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Název banneru *</Label>
              <Input
                id="edit-title"
                value={bannerForm.title}
                onChange={(e) => setBannerForm({...bannerForm, title: e.target.value})}
                placeholder="Např. Prémiová hlavní výhra - vyhrajte až 1 milion!"
              />
            </div>

            {bannerForm.targetPage === 'homepage_video' ? (
              <div className="space-y-2">
                <Label htmlFor="edit-videoUrl">YouTube URL *</Label>
                <Input
                  id="edit-videoUrl"
                  type="url"
                  value={bannerForm.videoUrl}
                  onChange={(e) => setBannerForm({...bannerForm, videoUrl: e.target.value})}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Ponechejte prázdné pro zachování stávajícího videa
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="edit-bannerImage">Nový obrázek banneru</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-bannerImage"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setBannerForm({...bannerForm, imageFile: e.target.files?.[0] || null})}
                    className="flex-1"
                  />
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Ponechejte prázdné pro zachování stávajícího obrázku
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Cílová stránka</Label>
              <Select
                value={bannerForm.targetPage}
                onValueChange={(value) => setBannerForm({...bannerForm, targetPage: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homepage_customer">Domovská stránka</SelectItem>
                  <SelectItem value="vouchers">Kupte Voucher</SelectItem>
                  <SelectItem value="games">Hraj o luxusní ceny</SelectItem>
                  <SelectItem value="homepage_video">Jak to funguje (Video)</SelectItem>
                  <SelectItem value="MioCoin balíček – 50">MioCoin balíček – 50</SelectItem>
                  <SelectItem value="MioCoin balíček – 310">MioCoin balíček – 310</SelectItem>
                  <SelectItem value="MioCoin balíček – 525">MioCoin balíček – 525</SelectItem>
                  <SelectItem value="MioCoin balíček – 1280">MioCoin balíček – 1280</SelectItem>
                  <SelectItem value="Probíhající soutěže">Probíhající soutěže</SelectItem>
                  <SelectItem value="Koupit voucher se slevou">Koupit voucher se slevou</SelectItem>
                  <SelectItem value="Vzhled – karta výher">Vzhled – karta výher</SelectItem>
                </SelectContent>
              </Select>
              {(bannerForm.targetPage.startsWith('MioCoin') || bannerForm.targetPage === 'Probíhající soutěže' || bannerForm.targetPage === 'Koupit voucher se slevou') && (
                <p className="text-xs text-muted-foreground">
                  Doporučené rozměry pro kartičkové bannery: 200 × 140 px
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-active"
                checked={bannerForm.active}
                onCheckedChange={(checked) => setBannerForm({...bannerForm, active: checked})}
              />
              <Label htmlFor="edit-active">Aktivní</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-permanent"
                checked={bannerForm.permanent}
                onCheckedChange={(checked) => setBannerForm({...bannerForm, permanent: checked, startDate: checked ? undefined : bannerForm.startDate, endDate: checked ? undefined : bannerForm.endDate})}
              />
              <Label htmlFor="edit-permanent">Zobrazovat trvale (bez omezení datumem)</Label>
            </div>

            {!bannerForm.permanent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Datum začátku</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal",
                          !bannerForm.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bannerForm.startDate ? format(bannerForm.startDate, 'dd.MM.yyyy') : 'Vybrat datum'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bannerForm.startDate}
                        onSelect={(date) => setBannerForm({...bannerForm, startDate: date})}
                        initialFocus
                        className="p-3"
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
                          !bannerForm.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bannerForm.endDate ? format(bannerForm.endDate, 'dd.MM.yyyy') : 'Vybrat datum'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bannerForm.endDate}
                        onSelect={(date) => setBannerForm({...bannerForm, endDate: date})}
                        initialFocus
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <Button
                onClick={handleUpdateBanner}
                disabled={editLoading}
                className="flex-1"
              >
                {editLoading ? 'Aktualizuje se...' : 'Uložit změny'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                disabled={editLoading}
              >
                Zrušit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Menu */}
    </>
  );
};

export default AdminBanners;
