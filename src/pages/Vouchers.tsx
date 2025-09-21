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
      <div className="min-h-screen bg-background">
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
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-black text-transparent bg-gradient-to-r from-neon-pink via-pink-400 to-neon-pink bg-clip-text animate-pulse mb-4">
              ⚡ VOUCHERY ⚡
            </h1>
            <p className="text-neon-pink/80 font-medium text-lg">Vaše voucher kolekce</p>
          </div>

          {vouchers.length === 0 ? (
            <div className="neon-ticket ticket-voucher ticket-perforations">
              {/* Ticket perforations */}
              <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-pink/50" />
                ))}
              </div>
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-pink/50" />
                ))}
              </div>
              
              <div className="relative z-10 p-8 text-center">
                <Gift className="h-16 w-16 mx-auto text-neon-pink mb-4 animate-pulse" />
                <h4 className="text-2xl font-black text-neon-pink mb-4">🎫 ŽÁDNÉ VOUCHERY</h4>
                <p className="text-neon-pink/80 font-medium">
                  Zatím nemáte žádné vouchery. Vouchery získáte při nákupu nebo jako výhry.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {vouchers.map((voucher) => (
                <div 
                  key={voucher.id} 
                  className="neon-ticket ticket-voucher ticket-perforations"
                >
                  {/* Ticket perforations */}
                  <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                    {Array.from({length: 6}).map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-pink/50" />
                    ))}
                  </div>
                  <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                    {Array.from({length: 6}).map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-pink/50" />
                    ))}
                  </div>
                  
                  <div className="relative z-10 p-8">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-2xl font-black text-neon-pink">🎫 VOUCHER #{voucher.code}</h3>
                      <div className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${
                        voucher.redeemed 
                          ? 'bg-gray-400/20 text-gray-400 border border-gray-400/30' 
                          : 'bg-green-400/20 text-green-400 border border-green-400/30'
                      }`}>
                        {React.createElement(getVoucherStatus(voucher).icon, { className: "w-4 h-4" })}
                        {getVoucherStatus(voucher).label}
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-neon-pink/60 font-bold text-sm">💰 HODNOTA</p>
                          <p className="text-4xl font-black text-neon-pink">{voucher.value} KČ</p>
                        </div>
                        <div className="text-right">
                          <p className="text-neon-pink/60 font-bold text-sm">📅 VYTVOŘENO</p>
                          <p className="text-lg font-bold text-neon-pink/80">{formatDate(voucher.created_at)}</p>
                        </div>
                      </div>
                      
                      {voucher.redeemed_at && (
                        <div className="border-t border-neon-pink/30 pt-4">
                          <p className="text-neon-pink/60 font-bold text-sm">✅ UPLATNĚNO</p>
                          <p className="text-lg font-bold text-neon-pink/80">{formatDate(voucher.redeemed_at)}</p>
                        </div>
                      )}
                      
                      {!voucher.redeemed && (
                        <div className="text-center pt-4">
                          <Button 
                            onClick={() => handleRedeem(voucher.id)}
                            className="bg-gradient-to-r from-neon-pink via-pink-400 to-neon-pink text-white font-bold px-8 py-4 rounded-xl hover:scale-110 transition-all duration-300"
                            style={{ 
                              boxShadow: '0 0 30px hsl(var(--neon-pink) / 0.6)',
                              animation: 'neon-pulse 2s ease-in-out infinite'
                            }}
                          >
                            ⚡ UPLATNIT VOUCHER ⚡
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Vouchers;