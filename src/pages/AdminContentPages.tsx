import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, FileText, Scale, HelpCircle } from 'lucide-react';

interface ContentPage {
  id: string;
  title: string;
  slug: string;
  section: string;
  content: string;
  version: string | null;
  is_active: boolean;
  order: number | null;
  created_at: string;
  updated_at: string;
}

const SECTIONS = [
  { value: 'info', label: 'Informace', icon: FileText },
  { value: 'support', label: 'Podpora', icon: HelpCircle },
  { value: 'legal', label: 'Právní dokumenty', icon: Scale },
];

const AdminContentPages: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [contentPages, setContentPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<ContentPage | null>(null);
  const [formData, setFormData] = useState({
    section: 'info',
    slug: '',
    title: '',
    content: '',
    version: '',
    order: 100,
    is_active: true,
  });

  useEffect(() => {
    if (user && isAdmin) {
      fetchContentPages();
    }
  }, [user, isAdmin]);

  const fetchContentPages = async () => {
    try {
      const { data, error } = await supabase
        .from('content_pages')
        .select('*')
        .is('deleted_at', null)
        .order('order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      setContentPages(data || []);
    } catch (error) {
      console.error('Error fetching content pages:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst obsahové stránky.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingPage(null);
    setFormData({
      section: 'info',
      slug: '',
      title: '',
      content: '',
      version: '',
      order: 100,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (page: ContentPage) => {
    setEditingPage(page);
    setFormData({
      section: page.section,
      slug: page.slug,
      title: page.title,
      content: page.content,
      version: page.version || '',
      order: page.order ?? 100,
      is_active: page.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.slug.trim() || !formData.title.trim() || !formData.content.trim()) {
      toast({
        title: 'Chyba',
        description: 'Vyplňte všechna povinná pole (slug, název, obsah).',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        section: formData.section,
        slug: formData.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        title: formData.title.trim(),
        content: formData.content,
        version: formData.version.trim() || null,
        order: formData.order,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingPage) {
        const { error } = await supabase
          .from('content_pages')
          .update(payload)
          .eq('id', editingPage.id);

        if (error) throw error;

        toast({
          title: 'Úspěch',
          description: 'Stránka byla úspěšně aktualizována.',
        });
      } else {
        const { error } = await supabase
          .from('content_pages')
          .insert([payload]);

        if (error) throw error;

        toast({
          title: 'Úspěch',
          description: 'Stránka byla úspěšně vytvořena.',
        });
      }

      setDialogOpen(false);
      fetchContentPages();
    } catch (error: any) {
      console.error('Error saving content page:', error);
      toast({
        title: 'Chyba',
        description: error.message || 'Nepodařilo se uložit stránku.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (page: ContentPage) => {
    try {
      const { error } = await supabase
        .from('content_pages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', page.id);

      if (error) throw error;

      toast({
        title: 'Úspěch',
        description: 'Stránka byla úspěšně smazána.',
      });

      fetchContentPages();
    } catch (error: any) {
      console.error('Error deleting content page:', error);
      toast({
        title: 'Chyba',
        description: error.message || 'Nepodařilo se smazat stránku.',
        variant: 'destructive',
      });
    }
  };

  const getPagesBySection = (section: string) => {
    return contentPages.filter((page) => page.section === section);
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">Načítání...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Obsah & Právní dokumenty</h1>
            <p className="text-muted-foreground">Správa statických obsahových stránek</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Nová stránka
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingPage ? 'Upravit stránku' : 'Vytvořit novou stránku'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="section">Sekce *</Label>
                    <Select
                      value={formData.section}
                      onValueChange={(value) => setFormData({ ...formData, section: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Vyberte sekci" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (URL) *</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      placeholder="např. obchodni-podminky"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Název *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Název stránky"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Obsah *</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Obsah stránky (HTML nebo text)"
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="version">Verze</Label>
                    <Input
                      id="version"
                      value={formData.version}
                      onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                      placeholder="např. 1.0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order">Pořadí</Label>
                    <Input
                      id="order"
                      type="number"
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 100 })}
                      placeholder="100"
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-8">
                    <Checkbox
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked as boolean })
                      }
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">
                      Aktivní
                    </Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Zrušit
                  </Button>
                  <Button onClick={handleSave}>
                    {editingPage ? 'Uložit změny' : 'Vytvořit'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="info" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <TabsTrigger key={s.value} value={s.value} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {s.label}
                  <Badge variant="secondary" className="ml-1">
                    {getPagesBySection(s.value).length}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {SECTIONS.map((s) => (
            <TabsContent key={s.value} value={s.value}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <s.icon className="h-5 w-5" />
                    {s.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Načítání...</div>
                  ) : getPagesBySection(s.value).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      V této sekci nejsou žádné stránky.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Pořadí</TableHead>
                          <TableHead>Název</TableHead>
                          <TableHead>Slug</TableHead>
                          <TableHead>Verze</TableHead>
                          <TableHead>Stav</TableHead>
                          <TableHead className="text-right">Akce</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getPagesBySection(s.value).map((page) => (
                          <TableRow key={page.id}>
                            <TableCell className="text-muted-foreground">{page.order ?? 100}</TableCell>
                            <TableCell className="font-medium">{page.title}</TableCell>
                            <TableCell>
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                /{page.section}/{page.slug}
                              </code>
                            </TableCell>
                            <TableCell>{page.version || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={page.is_active ? 'default' : 'secondary'}>
                                {page.is_active ? 'Aktivní' : 'Neaktivní'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(page)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Smazat stránku?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Opravdu chcete smazat stránku "{page.title}"? Stránka bude skryta, ale lze ji obnovit v databázi.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Zrušit</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(page)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Smazat
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};

export default AdminContentPages;
