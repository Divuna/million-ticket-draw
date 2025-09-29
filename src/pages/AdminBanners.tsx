import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
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
import { AdminMenu } from '@/components/AdminMenu';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface BannerForm {
  title: string;
  imageFile: File | null;
  videoUrl: string;
  active: boolean;
  targetPage: string;
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
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
  
  const [bannerForm, setBannerForm] = useState<BannerForm>({
    title: '',
    imageFile: null,
    videoUrl: '',
    active: true,
    targetPage: 'homepage_customer',
    startDate: undefined,
    endDate: undefined,
  });

  useEffect(() => {
    if (!roleLoading && (!user || !isAdmin)) {
      navigate('/login');
      return;
    }
    if (user && isAdmin) {
      fetchBanners();
    }
  }, [user, isAdmin, roleLoading, navigate]);

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
          start_date: bannerForm.startDate?.toISOString().split('T')[0],
          end_date: bannerForm.endDate?.toISOString().split('T')[0],
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
    const startDate = banner.start_date ? new Date(banner.start_date).toLocaleDateString('cs-CZ') : 'Neurčeno';
    const endDate = banner.end_date ? new Date(banner.end_date).toLocaleDateString('cs-CZ') : 'Neurčeno';
    return `${startDate} - ${endDate}`;
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
                    placeholder="Např. Mega Jackpot - Vyhrajte až 1 milion!"
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
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={bannerForm.active}
                    onCheckedChange={(checked) => setBannerForm({...bannerForm, active: checked})}
                  />
                  <Label htmlFor="active">Aktivní</Label>
                </div>

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
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
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

      {/* Admin Menu */}
      <AdminMenu />
    </div>
  );
};

export default AdminBanners;