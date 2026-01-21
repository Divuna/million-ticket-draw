import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Key, Copy, Check, ArrowLeft, Plus, RotateCw, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { AdminMenu } from '@/components/AdminMenu';

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at?: string | null;
}

const AdminPartnerApiKeys = () => {
  const { id: partnerId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  
  // Generate key modal
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [keyDescription, setKeyDescription] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  
  // Show generated key modal
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [showKeyModalOpen, setShowKeyModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  
  // Rotate key confirmation
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [keyToRotate, setKeyToRotate] = useState<ApiKey | null>(null);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (partnerId) {
      loadData();
    }
  }, [partnerId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [partnerRes, keysRes] = await Promise.all([
        supabase
          .from('partners')
          .select('id, name, company_name, status')
          .eq('id', partnerId)
          .single(),
        supabase
          .from('partner_api_keys')
          .select('id, key_prefix, created_at, revoked_at')
          .eq('partner_id', partnerId)
          .order('created_at', { ascending: false }),
      ]);

      if (partnerRes.error) throw partnerRes.error;
      
      setPartner(partnerRes.data);
      setApiKeys(keysRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Nepodařilo se načíst data partnera');
    } finally {
      setLoading(false);
    }
  };

  const openGenerateModal = () => {
    setKeyDescription('');
    setGenerateModalOpen(true);
  };

  const handleGenerateKey = async () => {
    if (!partnerId) return;
    
    setGeneratingKey(true);
    
    try {
      // Use create_partner_api_key RPC
      const { data, error } = await supabase.rpc('create_partner_api_key', {
        p_partner_id: partnerId,
      });

      if (error) throw error;
      
      setNewlyGeneratedKey(data as string);
      setGenerateModalOpen(false);
      setShowKeyModalOpen(true);
      toast.success('API klíč byl úspěšně vygenerován');
      
      // Reload keys
      await loadApiKeys();
    } catch (error) {
      console.error('Error generating API key:', error);
      toast.error('Nepodařilo se vygenerovat API klíč');
    } finally {
      setGeneratingKey(false);
    }
  };

  const loadApiKeys = async () => {
    const { data } = await supabase
      .from('partner_api_keys')
      .select('id, key_prefix, created_at, revoked_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false });
    
    setApiKeys(data || []);
  };

  const copyKeyToClipboard = () => {
    if (newlyGeneratedKey) {
      navigator.clipboard.writeText(newlyGeneratedKey);
      setCopiedKey(true);
      toast.success('API klíč zkopírován do schránky');
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleCloseShowKeyModal = () => {
    setShowKeyModalOpen(false);
    setNewlyGeneratedKey(null);
    setCopiedKey(false);
  };

  const openRotateConfirm = (key: ApiKey) => {
    setKeyToRotate(key);
    setRotateConfirmOpen(true);
  };

  const handleRotateKey = async () => {
    if (!keyToRotate || !partnerId) return;
    
    setRotating(true);
    
    // Optimistic update - mark old key as revoked
    const previousKeys = [...apiKeys];
    setApiKeys(apiKeys.map(k => 
      k.id === keyToRotate.id 
        ? { ...k, revoked_at: new Date().toISOString() } 
        : k
    ));
    
    try {
      // Revoke old key
      const { error: revokeError } = await supabase
        .from('partner_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', keyToRotate.id);

      if (revokeError) throw revokeError;
      
      // Generate new key
      const { data: newKey, error: generateError } = await supabase.rpc('create_partner_api_key', {
        p_partner_id: partnerId,
      });

      if (generateError) throw generateError;
      
      setRotateConfirmOpen(false);
      setKeyToRotate(null);
      setNewlyGeneratedKey(newKey as string);
      setShowKeyModalOpen(true);
      toast.success('API klíč byl úspěšně rotován');
      
      // Reload keys
      await loadApiKeys();
    } catch (error) {
      console.error('Error rotating API key:', error);
      toast.error('Nepodařilo se rotovat API klíč');
      // Rollback optimistic update
      setApiKeys(previousKeys);
    } finally {
      setRotating(false);
    }
  };

  const activeKeys = apiKeys.filter(k => !k.revoked_at);
  const revokedKeys = apiKeys.filter(k => k.revoked_at);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Partner nenalezen</p>
          <Button onClick={() => navigate('/admin/partners-portal')} className="mt-4">
            Zpět na přehled partnerů
          </Button>
        </div>
        <AdminMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-card border-b border-border p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/partners-portal')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">API klíče</h1>
            <p className="text-sm text-muted-foreground">
              {partner.company_name || partner.name}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Button onClick={openGenerateModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Generovat nový API klíč
          </Button>
        </div>

        {/* Active Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Aktivní API klíče
            </CardTitle>
            <CardDescription>
              Klíče, které může partner aktuálně používat pro API volání
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeKeys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Partner nemá žádné aktivní API klíče</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prefix klíče</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {key.key_prefix}••••••••
                        </code>
                      </TableCell>
                      <TableCell>
                        {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRotateConfirm(key)}
                          className="gap-2"
                        >
                          <RotateCw className="w-4 h-4" />
                          Rotovat klíč
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Revoked Keys */}
        {revokedKeys.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground">Zneplatněné klíče</CardTitle>
              <CardDescription>
                Historie dříve používaných klíčů
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prefix klíče</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                    <TableHead>Zneplatněno</TableHead>
                    <TableHead>Stav</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revokedKeys.map((key) => (
                    <TableRow key={key.id} className="opacity-60">
                      <TableCell>
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {key.key_prefix}••••••••
                        </code>
                      </TableCell>
                      <TableCell>
                        {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                      </TableCell>
                      <TableCell>
                        {key.revoked_at && format(new Date(key.revoked_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">Zneplatněno</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Generate Key Modal */}
      <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generovat nový API klíč</DialogTitle>
            <DialogDescription>
              Nový API klíč bude zobrazen pouze jednou. Ujistěte se, že si ho partner uloží.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="description">Popis (volitelný)</Label>
              <Input
                id="description"
                placeholder="např. Produkční klíč, Testovací klíč..."
                value={keyDescription}
                onChange={(e) => setKeyDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Popis vám pomůže rozlišit různé klíče
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateModalOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleGenerateKey} disabled={generatingKey}>
              {generatingKey && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Vygenerovat klíč
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Generated Key Modal */}
      <Dialog open={showKeyModalOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Nový API klíč vygenerován
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Upozornění</p>
                <p className="text-muted-foreground mt-1">
                  Tento API klíč bude zobrazen <strong>pouze nyní</strong>. Po zavření tohoto okna
                  nebude možné ho znovu zobrazit. Ujistěte se, že si ho partner bezpečně uloží.
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>API klíč</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-sm font-mono bg-muted p-3 rounded-lg break-all">
                  {newlyGeneratedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyKeyToClipboard}
                  className="shrink-0"
                >
                  {copiedKey ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCloseShowKeyModal}>
              Rozumím, zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate Key Confirmation */}
      <AlertDialog open={rotateConfirmOpen} onOpenChange={setRotateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotovat API klíč?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce zneplatní stávající klíč <code className="bg-muted px-1 rounded">{keyToRotate?.key_prefix}••••</code> a 
              vygeneruje nový. Partner bude muset aktualizovat svou integraci.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateKey} disabled={rotating}>
              {rotating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Rotovat klíč
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminMenu />
    </div>
  );
};

export default AdminPartnerApiKeys;
