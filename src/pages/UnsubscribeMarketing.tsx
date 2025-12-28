import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle, Mail } from 'lucide-react';

const UnsubscribeMarketing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleUnsubscribe = async () => {
    if (!user) {
      toast({
        title: "Chyba",
        description: "Pro odhlášení z marketingových sdělení musíte být přihlášeni.",
        variant: "destructive"
      });
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('user_legal_acceptances').insert({
        user_id: user.id,
        document_slug: 'marketing',
        document_version: 'revoked'
      });

      if (error) throw error;

      setSuccess(true);
      toast({
        title: "Odhlášení úspěšné",
        description: "Byli jste odhlášeni z marketingových sdělení."
      });
    } catch (error: any) {
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se provést odhlášení.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
            <CardTitle>Přihlášení vyžadováno</CardTitle>
            <CardDescription>
              Pro odhlášení z marketingových sdělení se prosím nejprve přihlaste.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={() => navigate('/login')}>
              Přihlásit se
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle>Odhlášení dokončeno</CardTitle>
            <CardDescription>
              Byli jste úspěšně odhlášeni z marketingových sdělení. 
              Již vám nebudeme zasílat žádné propagační e-maily.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              Zpět na hlavní stránku
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <CardTitle>Odhlášení z marketingových sdělení</CardTitle>
          <CardDescription>
            Opravdu si přejete odhlásit se z odběru marketingových sdělení?
            Po odhlášení vám již nebudeme zasílat propagační e-maily.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center">
            E-mail: <strong>{user.email}</strong>
          </p>
        </CardContent>
        <CardFooter className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)} disabled={loading}>
            Zrušit
          </Button>
          <Button variant="destructive" onClick={handleUnsubscribe} disabled={loading}>
            {loading ? 'Zpracovávám...' : 'Odhlásit se'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default UnsubscribeMarketing;
