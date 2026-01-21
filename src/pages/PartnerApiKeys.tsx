import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Key, ArrowLeft, ShieldCheck, ShieldX, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

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
}

const PartnerApiKeys = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/partner/login');
        return;
      }

      // Load partner info
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id, name, company_name, status')
        .eq('auth_user_id', user.id)
        .single();

      if (partnerError || !partnerData) {
        toast.error('Partnerský účet nenalezen');
        navigate('/partner/login');
        return;
      }

      setPartner(partnerData);

      // Load API keys
      const { data: keysData, error: keysError } = await supabase
        .from('partner_api_keys')
        .select('id, key_prefix, created_at, revoked_at')
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false });

      if (keysError) throw keysError;
      
      setApiKeys(keysData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Nepodařilo se načíst data');
    } finally {
      setLoading(false);
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
          <p className="text-muted-foreground">Partnerský účet nenalezen</p>
          <Button onClick={() => navigate('/partner/login')} className="mt-4">
            Přihlásit se
          </Button>
        </div>
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
            onClick={() => navigate('/partner/dashboard')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Moje API klíče</h1>
            <p className="text-sm text-muted-foreground">
              Přehled vašich API klíčů pro integraci
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Jak používat API klíče</p>
              <p className="text-muted-foreground mt-1">
                API klíče slouží k autentizaci vašich požadavků na naše API. 
                Každý klíč je unikátní a měl by být bezpečně uložen. 
                Nikdy nesdílejte své API klíče s třetími stranami.
              </p>
              <p className="text-muted-foreground mt-2">
                Pokud potřebujete nový API klíč nebo rotaci stávajícího, kontaktujte administrátora.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Aktivní API klíče
            </CardTitle>
            <CardDescription>
              Klíče, které můžete aktuálně používat pro API volání
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeKeys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="w-10 h-10 mx-auto mb-2 opacity-50 text-muted-foreground" />
                <p>Nemáte žádné aktivní API klíče</p>
                <p className="text-sm mt-1">Kontaktujte administrátora pro vygenerování klíče</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prefix klíče</TableHead>
                    <TableHead>Vytvořeno</TableHead>
                    <TableHead>Stav</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {key.key_prefix}••••••••••••••••
                        </code>
                      </TableCell>
                      <TableCell>
                        {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          Aktivní
                        </Badge>
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
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <ShieldX className="w-5 h-5" />
                Zneplatněné klíče
              </CardTitle>
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
                          {key.key_prefix}••••••••••••••••
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
    </div>
  );
};

export default PartnerApiKeys;
