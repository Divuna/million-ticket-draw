import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, ExternalLink, Upload } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';

interface Partner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  created_at: string;
  updated_at: string;
}

const AdminPartners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    website_url: ''
  });
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error('Error fetching partners:', error);
      toast.error('Nepodařilo se načíst partnery');
    } finally {
      setLoading(false);
    }
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('partner-logos')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('partner-logos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.website_url) {
      toast.error('Název partnera a URL webu jsou povinné');
      return;
    }

    if (!editingPartner && !selectedFile) {
      toast.error('Logo je povinné pro nového partnera');
      return;
    }

    try {
      setUploading(true);
      let logoUrl = formData.logo_url;

      // Upload new logo if file is selected
      if (selectedFile) {
        logoUrl = await uploadLogo(selectedFile);
      }

      const partnerData = {
        name: formData.name,
        logo_url: logoUrl,
        website_url: formData.website_url
      };

      if (editingPartner) {
        const { error } = await supabase
          .from('partners')
          .update(partnerData)
          .eq('id', editingPartner.id);

        if (error) throw error;
        toast.success('Partner byl úspěšně upraven');
      } else {
        const { error } = await supabase
          .from('partners')
          .insert([partnerData]);

        if (error) throw error;
        toast.success('Partner byl úspěšně přidán');
      }

      setDialogOpen(false);
      setEditingPartner(null);
      setFormData({ name: '', logo_url: '', website_url: '' });
      setSelectedFile(null);
      fetchPartners();
    } catch (error) {
      console.error('Error saving partner:', error);
      toast.error('Nepodařilo se uložit partnera');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      logo_url: partner.logo_url,
      website_url: partner.website_url
    });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Opravdu chcete smazat tohoto partnera?')) return;

    try {
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Partner byl úspěšně smazán');
      fetchPartners();
    } catch (error) {
      console.error('Error deleting partner:', error);
      toast.error('Nepodařilo se smazat partnera');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Povolené formáty: PNG, JPG, SVG');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Maximální velikost souboru je 5MB');
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const openDialog = () => {
    setEditingPartner(null);
    setFormData({ name: '', logo_url: '', website_url: '' });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Načítání partnerů...</p>
            </div>
          </div>
        </div>
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Správa partnerů</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openDialog} className="gap-2">
                <Plus className="w-4 h-4" />
                Přidat partnera
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingPartner ? 'Upravit partnera' : 'Přidat partnera'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Název partnera</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Zadejte název partnera"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="logo">Logo partnera</Label>
                  <div className="space-y-2">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      onChange={handleFileSelect}
                      className="cursor-pointer"
                    />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Upload className="w-4 h-4" />
                      <span>PNG, JPG, SVG (max 5MB)</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Doporučené rozměry: 16:9 poměr stran (např. 320×180px nebo 640×360px)
                    </p>
                    {selectedFile && (
                      <p className="text-sm text-green-600">
                        Vybrán soubor: {selectedFile.name}
                      </p>
                    )}
                    {editingPartner && !selectedFile && (
                      <p className="text-sm text-muted-foreground">
                        Aktuálně: {editingPartner.name} logo
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="website_url">URL webu</Label>
                  <Input
                    id="website_url"
                    value={formData.website_url}
                    onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1" disabled={uploading}>
                    {uploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                        Nahrávání...
                      </>
                    ) : (
                      editingPartner ? 'Uložit změny' : 'Přidat partnera'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={uploading}
                  >
                    Zrušit
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {partners.map((partner) => (
            <Card key={partner.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{partner.name}</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(partner.website_url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(partner)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(partner.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                    <img
                      src={partner.logo_url}
                      alt={partner.name}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                    <div className="hidden flex-col items-center justify-center text-muted-foreground">
                      <span className="text-sm">Chyba načítání loga</span>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Web:</strong> {partner.website_url}</p>
                    <p><strong>Vytvořeno:</strong> {new Date(partner.created_at).toLocaleDateString('cs-CZ')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {partners.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-center mb-4">
                Zatím nejsou přidáni žádní partneři
              </p>
              <Button onClick={openDialog} className="gap-2">
                <Plus className="w-4 h-4" />
                Přidat prvního partnera
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminPartners;