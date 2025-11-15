import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/AuthProvider';
import { toast } from '@/hooks/use-toast';

const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, signUp } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to homepage
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Chyba",
        description: "Hesla se neshodují.",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Chyba",
        description: "Heslo musí mít alespoň 6 znaků.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password);
      
      if (error) {
        toast({
          title: "Chyba registrace",
          description: error.message,
          variant: "destructive"
        });
      } else {
        // Redirect will happen automatically via useEffect
        navigate('/', { replace: true });
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

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    toast({
      title: "Funkce není dostupná",
      description: "OAuth přihlášení není aktuálně k dispozici.",
      variant: "destructive"
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Registrace</CardTitle>
          <CardDescription>
            Vytvořte si nový účet OneMil
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="email"
                type="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Heslo
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Alespoň 6 znaků"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Potvrzení hesla
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Zopakujte heslo"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Registruji...' : 'Zaregistrovat se'}
            </Button>
            
            <div className="flex flex-col space-y-2 w-full">
              <Button 
                type="button"
                variant="outline" 
                className="w-full"
                onClick={() => handleOAuthSignIn('google')}
              >
                Registrovat se přes Google
              </Button>
              
              <Button 
                type="button"
                variant="outline" 
                className="w-full"
                onClick={() => handleOAuthSignIn('apple')}
              >
                Registrovat se přes Apple
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              Už máte účet?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Přihlaste se
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Register;