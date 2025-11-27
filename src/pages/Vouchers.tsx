import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useHomepageVouchers } from '@/hooks/useHomepageVouchers';
import { useUserVouchers } from '@/hooks/useUserVouchers';
import { AdminMenu } from '@/components/AdminMenu';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Header } from '@/components/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Gift, Copy, Heart, Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Vouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { vouchers: availableVouchers, loading: availableLoading, getRemainingCount, isVoucherAvailable, refetch: refetchAvailable } = useHomepageVouchers();
  const { vouchers: userVouchers, loading: userVouchersLoading, refetch: refetchUserVouchers } = useUserVouchers();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const handleVoucherPurchase = async (voucherId: string) => {
    if (!user) {
      toast.error("Pro koupi voucheru se musíte přihlásit");
      return;
    }

    if (isAdmin) {
      return;
    }

    setPurchasingId(voucherId);

    try {
      // Check user's wallet balance
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('balance_coins')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;

      if (!walletData || walletData.balance_coins < 1) {
        toast.error("Nemáte dostatek MioCoinů. Potřebujete alespoň 1 MioCoin.");
        return;
      }

      // Check if already purchased
      const { data: existingPurchase } = await supabase
        .from('user_vouchers')
        .select('id')
        .eq('user_id', user.id)
        .eq('voucher_id', voucherId)
        .maybeSingle();

      if (existingPurchase) {
        toast.error("Tento voucher jste již zakoupili");
        return;
      }

      // Purchase voucher: create user_vouchers record and deduct 1 MC
      const { error: purchaseError } = await supabase
        .from('user_vouchers')
        .insert({
          user_id: user.id,
          voucher_id: voucherId,
          redeemed: false
        });

      if (purchaseError) {
        if (purchaseError.code === '23505') {
          toast.error("Tento voucher jste již zakoupili");
          return;
        }
        throw purchaseError;
      }

      // Deduct 1 MioCoin from wallet
      const { error: updateError } = await supabase
        .from('wallets')
        .update({ balance_coins: walletData.balance_coins - 1 })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      toast.success("Voucher úspěšně zakoupen za 1 MioCoin!");
      refetchUserVouchers();
      refetchAvailable();
    } catch (error) {
      console.error("Error purchasing voucher:", error);
      toast.error("Nepodařilo se zakoupit voucher");
    } finally {
      setPurchasingId(null);
    }
  };

  const handleCopyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Kód voucheru zkopírován do schránky!");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <Gift className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-2xl font-bold mb-4">Přihlaste se</h2>
          <p className="text-muted-foreground mb-4">Pro zobrazení voucherů se musíte přihlásit</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Přihlásit se
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Gift className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-primary">Vouchery</h1>
        </div>

        <Tabs defaultValue="available" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="available" className="flex items-center gap-2">
              <Ticket className="w-4 h-4" />
              Dostupné vouchery
            </TabsTrigger>
            <TabsTrigger value="my" className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Moje vouchery
              {userVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1">{userVouchers.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Dostupné vouchery Tab */}
          <TabsContent value="available" className="space-y-4">
            {availableLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                    <CardContent className="p-6 space-y-4">
                      <div className="h-32 bg-muted rounded animate-pulse" />
                      <div className="h-6 bg-muted rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-muted/70 rounded animate-pulse w-1/2" />
                      <div className="h-10 bg-muted/80 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : availableVouchers.length === 0 ? (
              <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                <CardContent className="p-8 space-y-2 text-center">
                  <Gift className="w-12 h-12 mx-auto text-muted-foreground/50" />
                  <h3 className="text-xl font-bold text-primary">Žádné dostupné vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Momentálně nejsou k dispozici žádné veřejné vouchery.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableVouchers.map((voucher) => {
                  const remaining = getRemainingCount(voucher);
                  const isAvailable = isVoucherAvailable(voucher);
                  const isPurchasing = purchasingId === voucher.id;

                  return (
                    <Card key={voucher.id} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30 shadow-md hover:shadow-lg transition-all duration-300">
                      {voucher.banner_url && (
                        <img
                          src={voucher.banner_url}
                          alt={`${voucher.name} banner`}
                          className="w-full h-32 object-cover"
                          loading="lazy"
                        />
                      )}
                      
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-4">
                          {voucher.image_url && (
                            <div className="flex-shrink-0">
                              <img
                                src={voucher.image_url}
                                alt={voucher.name}
                                className="w-14 h-14 object-cover rounded-lg border border-border"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-foreground">{voucher.name}</h3>
                            {!isAvailable && (
                              <Badge variant="destructive" className="mt-1">Nedostupný</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                          <span className="text-sm text-muted-foreground">Zbývá:</span>
                          <span className="font-bold text-primary">{remaining}</span>
                        </div>

                        <div className="flex items-center justify-between py-2 px-3 bg-primary/10 rounded-lg">
                          <span className="text-sm text-muted-foreground">Cena:</span>
                          <span className="font-bold text-primary">1 MioCoin</span>
                        </div>

                        <Button
                          onClick={() => handleVoucherPurchase(voucher.id)}
                          disabled={!isAvailable || isPurchasing || isAdmin}
                          className="w-full h-11 text-base font-semibold"
                        >
                          {isPurchasing ? "Kupuji..." : "KOUPIT VOUCHER"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Moje vouchery Tab */}
          <TabsContent value="my" className="space-y-4">
            {userVouchersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                    <CardContent className="p-6 space-y-4">
                      <div className="h-6 bg-muted rounded animate-pulse mb-2" />
                      <div className="h-4 bg-muted/70 rounded animate-pulse w-24" />
                      <div className="h-12 bg-muted rounded animate-pulse mb-4" />
                      <div className="h-10 bg-muted/80 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : userVouchers.length === 0 ? (
              <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                <CardContent className="p-8 space-y-2 text-center">
                  <Gift className="w-12 h-12 mx-auto text-muted-foreground/50" />
                  <h3 className="text-xl font-bold text-primary">Zatím nemáte žádné vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Zakupte si voucher v sekci "Dostupné vouchery"
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userVouchers.map((userVoucher) => (
                  <Card key={userVoucher.id} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30 shadow-md">
                    <CardContent className="p-6 space-y-4">
                      {/* Voucher image */}
                      <div className="aspect-video rounded-lg overflow-hidden bg-muted/40">
                        {userVoucher.voucher?.image_url ? (
                          <img
                            src={userVoucher.voucher.image_url}
                            alt={userVoucher.voucher?.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Gift className="w-12 h-12 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>

                      {/* Voucher info */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-lg text-foreground">{userVoucher.voucher?.name}</h4>
                        <div className="text-sm text-muted-foreground">
                          Aktivován: {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                        </div>
                        
                        {/* Voucher code */}
                        <div className="bg-background/80 rounded-lg p-3 space-y-2">
                          <div className="text-xs text-muted-foreground">Váš kód:</div>
                          <div className="font-mono font-bold text-lg text-primary">{userVoucher.code}</div>
                        </div>

                        {/* Copy button */}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleCopyVoucherCode(userVoucher.code)}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Zkopírovat kód
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Vouchers;