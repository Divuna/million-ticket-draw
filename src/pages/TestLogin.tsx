import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTestAuth } from '@/hooks/useTestAuth';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, TestTube } from 'lucide-react';

const TestLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { testSignIn } = useTestAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Chyba",
        description: "Zadejte email adresu.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await testSignIn(email);
      
      if (error) {
        toast({
          title: "Chyba přihlášení",
          description: error.message,
          variant: "destructive"
        });
      } else {
        // Navigate to admin dashboard in test mode
        navigate('/admin?test=true');
      }
    } catch (error) {
      toast({
        title: "Chyba",
        description: "Něco se pokazilo. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Warning Alert */}
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <strong>POUZE PRO TESTOVÁNÍ!</strong> Tento login obchází normální autentifikaci 
            a neměl by být používán v produkčním prostředí.
          </AlertDescription>
        </Alert>

        <Card className="border-2 border-dashed border-yellow-400">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <TestTube className="h-6 w-6 text-yellow-600" />
              <CardTitle className="text-yellow-700">TEST LOGIN</CardTitle>
            </div>
            <CardDescription>
              Zadejte email existujícího uživatele pro přístup k admin panelu
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  E-mail uživatele
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-yellow-300 focus:border-yellow-500"
                />
                <p className="text-xs text-muted-foreground">
                  Email musí existovat v tabulce uživatelů
                </p>
              </div>
            </CardContent>
            
            <CardFooter className="flex flex-col space-y-4">
              <Button 
                type="submit" 
                className="w-full bg-yellow-600 hover:bg-yellow-700" 
                disabled={loading}
              >
                {loading ? 'Ověřuji...' : '🧪 Test Login'}
              </Button>
              
              <Button 
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate('/login')}
              >
                Zpět na normální přihlášení
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="text-xs text-center text-muted-foreground">
          <p>Test režim umožňuje přihlášení pouze s emailem.</p>
          <p>Pro produkci použijte standardní přihlašovací formulář.</p>
        </div>
      </div>
    </div>
  );
};

export default TestLogin;