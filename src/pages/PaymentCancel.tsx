import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { isNativeApp } from '@/lib/nativeApp';

const PaymentCancel: React.FC = () => {
  const navigate = useNavigate();
  // Nativní aplikace: platební stránky nejsou dostupné — okamžitý redirect.
  const nativeApp = isNativeApp();

  useEffect(() => {
    if (nativeApp) {
      navigate('/games', { replace: true });
      return;
    }
    // Show cancel toast
    toast({
      title: "Platba byla zrušena",
      description: "Nákup voucherů byl zrušen. Žádné peníze nebyly účtovány.",
      variant: "destructive"
    });
  }, [nativeApp, navigate]);

  if (nativeApp) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <CardTitle className="text-red-600">Platba zrušena</CardTitle>
              <CardDescription>
                Nákup voucherů byl zrušen. Žádné peníze nebyly účtovány.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="flex flex-col space-y-3">
                <Button 
                  onClick={() => navigate('/profile')}
                  className="w-full"
                >
                  Zkusit znovu
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

export default PaymentCancel;