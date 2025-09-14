import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';

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

  useEffect(() => {
    if (user) {
      fetchUserWallet();
    }
  }, [user]);

  const fetchUserWallet = async () => {
    try {
      // For now, use basic user data since database tables may not be fully set up
      // This will be replaced with proper database query once tables are created
      setWallet({
        user_id: user?.id || '',
        email: user?.email || '',
        name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
        balance_coins: 0,
        balance_vouchers: 0,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = () => {
    toast({
      title: "Dobíjení peněženky",
      description: "Tato funkce bude brzy dostupná.",
    });
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
                <h3 className="text-lg font-semibold mb-4">Peněženka</h3>
                
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
                
                <Button 
                  onClick={handleTopUp}
                  className="w-full md:w-auto"
                  size="lg"
                >
                  Dobít peněženku
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;