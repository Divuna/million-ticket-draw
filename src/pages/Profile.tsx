import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { RefreshCw } from 'lucide-react';

interface UserWallet {
  user_id: string;
  email: string;
  name: string;
  balance_coins: number;
  balance_vouchers: number;
  created_at: string;
}

const Profile: React.FC = () => {
  const { user, session } = useAuth();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [voucherAmount, setVoucherAmount] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserWallet();
    }
  }, [user]);

  const fetchUserWallet = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('wallets')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching wallet:', error);
        // Fallback to basic user data
        setWallet({
          user_id: user?.id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: 0,
          balance_vouchers: 0,
          created_at: new Date().toISOString()
        });
      } else if (data) {
        setWallet({
          user_id: data.user_id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: Number(data.balance_coins) || 0,
          balance_vouchers: Number(data.balance_vouchers) || 0,
          created_at: data.created_at || new Date().toISOString()
        });
      } else {
        // No wallet data found, use fallback
        setWallet({
          user_id: user?.id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: 0,
          balance_vouchers: 0,
          created_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setWallet({
        user_id: user?.id || '',
        email: user?.email || '',
        name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
        balance_coins: 0,
        balance_vouchers: 0,
        created_at: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };


  const handleRefreshBalance = async () => {
    setRefreshing(true);
    try {
      await fetchUserWallet();
      toast({
        title: "Úspěch",
        description: "Zůstatek byl aktualizován.",
      });
    } catch (error) {
      console.error('Error refreshing balance:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat zůstatek. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleVoucherPurchase = async () => {
    const amount = parseInt(voucherAmount);
    
    if (!amount || amount < 50) {
      toast({
        title: "Chyba",
        description: "Minimální částka je 50 CZK.",
        variant: "destructive"
      });
      return;
    }

    setPurchaseLoading(true);
    
    // Pre-open a blank window immediately (tied to user gesture)
    const preOpenedWindow = window.open('', '_blank');

    try {
      // Call edge function to create Stripe checkout session
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: { amount }
      });

      if (error) {
        throw error;
      }

      if (data.checkout_url) {
        // Try to redirect pre-opened window first
        if (preOpenedWindow && !preOpenedWindow.closed) {
          preOpenedWindow.location.href = data.checkout_url;
        } else {
          // Fallback to top-level navigation (escape iframe)
          if (window.top && window.top !== window) {
            window.top.location.assign(data.checkout_url);
          } else {
            // Final fallback to current window
            window.location.assign(data.checkout_url);
          }
        }
      } else {
        throw new Error('No checkout URL received');
      }

      setShowVoucherForm(false);
      setVoucherAmount('');

    } catch (error) {
      console.error('Error creating checkout session:', error);
      
      // Close pre-opened window on error
      if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.close();
      }
      
      toast({
        title: "Chyba",
        description: "Nepodařilo se vytvořit platbu. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setPurchaseLoading(false);
    }
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám profil...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Můj profil</CardTitle>
              <CardDescription>
                Přehled vašeho účtu a peněženky
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    E-mail:
                  </label>
                  <p className="text-lg">{wallet?.email || user?.email}</p>
                </div>
                
                {wallet?.name && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Jméno:
                    </label>
                    <p className="text-lg">{wallet.name}</p>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Peněženka</h3>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleRefreshBalance}
                    disabled={refreshing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Aktualizuji...' : 'Aktualizovat zůstatek'}
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">Mince (coins):</p>
                        <p className="text-3xl font-bold text-primary">
                          {wallet?.balance_coins?.toLocaleString('cs-CZ') || '0'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">Vouchery:</p>
                        <p className="text-3xl font-bold text-primary">
                          {wallet?.balance_vouchers?.toLocaleString('cs-CZ') || '0'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="flex justify-center">
                  <Button 
                    onClick={() => setShowVoucherForm(true)}
                    size="lg"
                  >
                    Dobít vouchery + miocoiny
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Voucher Purchase Dialog */}
      <Dialog open={showVoucherForm} onOpenChange={setShowVoucherForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koupit vouchery</DialogTitle>
            <DialogDescription>
              Zadejte částku v CZK (minimálně 50). 1 CZK = 1 voucher = 1 mince.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">
                Částka (CZK) *
              </label>
              <Input
                id="amount"
                type="number"
                placeholder="50"
                min="50"
                value={voucherAmount}
                onChange={(e) => setVoucherAmount(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Minimální částka je 50 CZK
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowVoucherForm(false);
                setVoucherAmount('');
              }}
              disabled={purchaseLoading}
            >
              Zrušit
            </Button>
            <Button 
              onClick={handleVoucherPurchase}
              disabled={purchaseLoading || !voucherAmount || parseInt(voucherAmount) < 50}
            >
              {purchaseLoading ? 'Zpracovávám...' : 'Pokračovat k platbě'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;