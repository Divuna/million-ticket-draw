import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Gift, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Voucher {
  id: string;
  code: string;
  value: number;
  redeemed: boolean;
  created_at: string;
  redeemed_at?: string;
}

const Vouchers: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchVouchers();
    }
  }, [user]);

  const fetchVouchers = async () => {
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching vouchers:', error);
        toast({
          title: "Chyba",
          description: "Nepodařilo se načíst vouchery.",
          variant: "destructive"
        });
      } else {
        setVouchers(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst vouchery.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = (voucherId: string) => {
    toast({
      title: "Úspěch",
      description: "Voucher uplatněn"
    });
  };

  const getVoucherStatus = (voucher: Voucher) => {
    if (voucher.redeemed) {
      return { label: 'Použit', variant: 'secondary' as const, icon: CheckCircle };
    }
    
    // For now, all non-redeemed vouchers are considered valid
    // Later we can add expiration date logic
    return { label: 'Platný', variant: 'default' as const, icon: Clock };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám vouchery...</p>
          </div>
        </div>
        <BottomNavigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Gift className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Moje vouchery</h1>
          </div>

          {vouchers.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Žádné vouchery</h3>
                  <p className="text-muted-foreground">
                    Zatím nemáte žádné vouchery. Vouchery získáte při nákupu nebo jako výhry.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {vouchers.map((voucher) => {
                const status = getVoucherStatus(voucher);
                const StatusIcon = status.icon;
                
                return (
                  <Card key={voucher.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          Voucher #{voucher.code}
                        </CardTitle>
                        <Badge variant={status.variant}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                      <CardDescription>
                        Vytvořen: {formatDate(voucher.created_at)}
                        {voucher.redeemed_at && (
                          <span className="block">
                            Použit: {formatDate(voucher.redeemed_at)}
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-2xl font-bold text-primary">
                            {voucher.value.toLocaleString('cs-CZ')} CZK
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Hodnota voucheru
                          </p>
                        </div>
                        
                        {!voucher.redeemed && (
                          <Button 
                            onClick={() => handleRedeem(voucher.id)}
                            size="sm"
                          >
                            Uplatnit
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Vouchers;