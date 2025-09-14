import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Show success toast
    toast({
      title: "Vouchery byly úspěšně zakoupeny",
      description: "Vaše platba byla zpracována a vouchery přidány do peněženky."
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-green-600">Platba úspěšná!</CardTitle>
              <CardDescription>
                Vouchery byly úspěšně zakoupeny a přidány do vaší peněženky.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {sessionId && (
                <div className="text-sm text-muted-foreground text-center">
                  <p>ID transakce:</p>
                  <p className="font-mono break-all">{sessionId}</p>
                </div>
              )}
              
              <div className="flex flex-col space-y-3">
                <Button 
                  onClick={() => navigate('/profile')}
                  className="w-full"
                >
                  Zobrazit peněženku
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="w-full"
                >
                  Zpět na domovskou stránku
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;