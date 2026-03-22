import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import {
  clearPaymentSuccessContext,
  resolvePaymentSuccessViewContext,
} from '@/lib/paymentSuccessContext';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [{ kind, returnTo }] = useState(() => resolvePaymentSuccessViewContext(searchParams));

  const successLine =
    kind === 'voucher'
      ? 'Voucher byl přidán do tvého účtu'
      : 'MioCoiny byly připsány na tvůj účet';

  const handleBackToContests = () => {
    navigate(returnTo ?? '/games');
  };

  const toastShown = useRef(false);
  useEffect(() => {
    clearPaymentSuccessContext();
    if (toastShown.current) return;
    toastShown.current = true;
    const line =
      kind === 'voucher'
        ? 'Voucher byl přidán do tvého účtu'
        : 'MioCoiny byly připsány na tvůj účet';
    toast({
      title: line,
    });
  }, [kind]);

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
              <CardDescription>{successLine}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {sessionId && (
                <div className="text-sm text-muted-foreground text-center">
                  <p>ID transakce:</p>
                  <p className="font-mono break-all">{sessionId}</p>
                </div>
              )}

              <div className="flex flex-col space-y-3">
                <Button onClick={handleBackToContests} className="w-full">
                  Zpět do soutěže
                </Button>

                <Button variant="outline" onClick={() => navigate('/profile')} className="w-full">
                  Zobrazit peněženku
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
