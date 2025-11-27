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
import { Gift, Copy, Heart, Ticket, Clock, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Voucher expiration duration in days (from purchase date)
const VOUCHER_EXPIRATION_DAYS = 30;

const Vouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { vouchers: availableVouchers, loading: availableLoading, getRemainingCount, isVoucherAvailable, refetch: refetchAvailable } = useHomepageVouchers();
  const { vouchers: userVouchers, loading: userVouchersLoading, refetch: refetchUserVouchers } = useUserVouchers();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);

  // Separate user vouchers into favorites (redeemed=false) and purchased (redeemed=true)
  const favoriteVouchers = userVouchers.filter(uv => !uv.redeemed);
  const purchasedVouchers = userVouchers.filter(uv => uv.redeemed);

  // Check if voucher is in user's collection (favorited or purchased)
  const isInUserVouchers = (voucherId: string) => {
    return userVouchers.some(uv => uv.voucher_id === voucherId);
  };

  // Calculate expiration for purchased vouchers
  const getExpirationInfo = (createdAt: string) => {
    const purchaseDate = new Date(createdAt);
    const expirationDate = new Date(purchaseDate);
    expirationDate.setDate(expirationDate.getDate() + VOUCHER_EXPIRATION_DAYS);
    
    const now = new Date();
    const diffMs = expirationDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    const isExpired = diffMs <= 0;
    
    return {
      isExpired,
      diffDays,
      diffHours,
      expirationDate,
      text: isExpired 
        ? 'Vypršel' 
        : diffDays > 0 
          ? `${diffDays} dní ${diffHours} hod` 
          : `${diffHours} hodin`
    };
  };

  const toggleFavorite = async (e: React.MouseEvent, voucherId: string) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error("Pro přidání do oblíbených se musíte přihlásit");
      return;
    }

    setTogglingFavoriteId(voucherId);

    try {
      const existingRecord = userVouchers.find(uv => uv.voucher_id === voucherId);

      if (existingRecord) {
        // If it's a favorite (not purchased), remove it
        if (!existingRecord.redeemed) {
          const { error } = await supabase
            .from('user_vouchers')
            .delete()
            .eq('id', existingRecord.id);

          if (error) throw error;
          toast.success("Voucher odebrán z oblíbených");
        } else {
          toast.info("Zakoupený voucher nelze odebrat z oblíbených");
        }
      } else {
        // Add to favorites (insert record with redeemed=false)
        const { error } = await supabase
          .from('user_vouchers')
          .insert({
            user_id: user.id,
            voucher_id: voucherId,
            redeemed: false
          });

        if (error) throw error;
        toast.success("Voucher přidán do oblíbených");
      }

      refetchUserVouchers();
      refetchAvailable();
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast.error("Nepodařilo se změnit oblíbené");
    } finally {
      setTogglingFavoriteId(null);
    }
  };

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
      const price = 5;

      // Check user's wallet balance
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('balance_coins')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;

      if (!walletData || walletData.balance_coins < price) {
        toast.error(`Nemáte dostatek MioCoinů. Potřebujete alespoň ${price} MioCoinů.`);
        return;
      }

      // Check if already purchased
      const existingPurchased = purchasedVouchers.find(uv => uv.voucher_id === voucherId);
      if (existingPurchased) {
        toast.error("Tento voucher jste již zakoupili");
        return;
      }

      // Check if already in favorites - update to purchased
      const existingFavorite = favoriteVouchers.find(uv => uv.voucher_id === voucherId);

      if (existingFavorite) {
        // Update existing favorite to purchased
        const { error: updateError } = await supabase
          .from('user_vouchers')
          .update({ redeemed: true, updated_at: new Date().toISOString() })
          .eq('id', existingFavorite.id);

        if (updateError) throw updateError;
      } else {
        // Create new purchased record
        const { error: insertError } = await supabase
          .from('user_vouchers')
          .insert({
            user_id: user.id,
            voucher_id: voucherId,
            redeemed: true
          });

        if (insertError) {
          if (insertError.code === '23505') {
            toast.error("Tento voucher jste již zakoupili");
            return;
          }
          throw insertError;
        }
      }

      // Deduct MioCoins from wallet
      const { error: walletUpdateError } = await supabase
        .from('wallets')
        .update({ balance_coins: walletData.balance_coins - price })
        .eq('user_id', user.id);

      if (walletUpdateError) throw walletUpdateError;

      toast.success(`Voucher úspěšně zakoupen za ${price} MioCoinů!`);
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

  // Vouchers not in user's collection (available for purchase/favorite)
  const truelyAvailableVouchers = availableVouchers.filter(v => !isInUserVouchers(v.id));

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Gift className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-primary">Vouchery</h1>
        </div>

        <Tabs defaultValue="available" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="available" className="flex items-center gap-1 text-xs sm:text-sm">
              <Ticket className="w-4 h-4" />
              <span className="hidden sm:inline">Dostupné</span>
              <span className="sm:hidden">Dost.</span>
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-1 text-xs sm:text-sm">
              <Heart className="w-4 h-4" />
              <span className="hidden sm:inline">Oblíbené</span>
              <span className="sm:hidden">Obl.</span>
              {favoriteVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{favoriteVouchers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="purchased" className="flex items-center gap-1 text-xs sm:text-sm">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Zakoupené</span>
              <span className="sm:hidden">Zak.</span>
              {purchasedVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{purchasedVouchers.length}</Badge>
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
            ) : truelyAvailableVouchers.length === 0 ? (
              <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                <CardContent className="p-8 space-y-2 text-center">
                  <Gift className="w-12 h-12 mx-auto text-muted-foreground/50" />
                  <h3 className="text-xl font-bold text-primary">Žádné dostupné vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Momentálně nejsou k dispozici žádné nové vouchery.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {truelyAvailableVouchers.map((voucher) => {
                  const remaining = getRemainingCount(voucher);
                  const isAvailable = isVoucherAvailable(voucher);
                  const isPurchasing = purchasingId === voucher.id;
                  const isTogglingFavorite = togglingFavoriteId === voucher.id;

                  return (
                    <Card key={voucher.id} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30 shadow-md hover:shadow-lg transition-all duration-300">
                      {/* Favorite heart button */}
                      <button
                        onClick={(e) => toggleFavorite(e, voucher.id)}
                        disabled={isTogglingFavorite}
                        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 hover:bg-background transition-colors disabled:opacity-50"
                        aria-label="Přidat do oblíbených"
                      >
                        <Heart 
                          className="w-5 h-5 text-muted-foreground hover:text-red-500 transition-colors" 
                        />
                      </button>

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

                        {/* Purchase button */}
                        <div className="space-y-1">
                          <Button
                            onClick={() => handleVoucherPurchase(voucher.id)}
                            disabled={!isAvailable || isPurchasing || isAdmin}
                            className="w-full h-11 text-base font-semibold"
                          >
                            {isPurchasing ? "Kupuji..." : "Koupit za 5 MioCoinů"}
                          </Button>
                          <p className="text-xs text-center text-muted-foreground">
                            50 % z částky jde na pomoc potřebným.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Oblíbené vouchery Tab */}
          <TabsContent value="favorites" className="space-y-4">
            {userVouchersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                    <CardContent className="p-6 space-y-4">
                      <div className="h-6 bg-muted rounded animate-pulse mb-2" />
                      <div className="h-4 bg-muted/70 rounded animate-pulse w-24" />
                      <div className="h-10 bg-muted/80 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : favoriteVouchers.length === 0 ? (
              <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                <CardContent className="p-8 space-y-2 text-center">
                  <Heart className="w-12 h-12 mx-auto text-muted-foreground/50" />
                  <h3 className="text-xl font-bold text-primary">Zatím nemáte žádné oblíbené vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Kliknutím na srdíčko přidáte voucher do oblíbených
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favoriteVouchers.map((userVoucher) => {
                  const isPurchasing = purchasingId === userVoucher.voucher_id;
                  const isTogglingFavorite = togglingFavoriteId === userVoucher.voucher_id;

                  return (
                    <Card key={userVoucher.id} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30 shadow-md">
                      {/* Remove from favorites button */}
                      <button
                        onClick={(e) => toggleFavorite(e, userVoucher.voucher_id)}
                        disabled={isTogglingFavorite}
                        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 hover:bg-background transition-colors disabled:opacity-50"
                        aria-label="Odebrat z oblíbených"
                      >
                        <Heart 
                          className="w-5 h-5 fill-red-500 text-red-500 transition-colors" 
                        />
                      </button>

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
                            Přidáno: {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                          </div>
                        </div>

                        {/* Purchase button */}
                        <div className="space-y-1">
                          <Button
                            onClick={() => handleVoucherPurchase(userVoucher.voucher_id)}
                            disabled={isPurchasing || isAdmin}
                            className="w-full h-11 text-base font-semibold"
                          >
                            {isPurchasing ? "Kupuji..." : "Koupit za 5 MioCoinů"}
                          </Button>
                          <p className="text-xs text-center text-muted-foreground">
                            50 % z částky jde na pomoc potřebným.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Zakoupené vouchery Tab */}
          <TabsContent value="purchased" className="space-y-4">
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
            ) : purchasedVouchers.length === 0 ? (
              <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                <CardContent className="p-8 space-y-2 text-center">
                  <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50" />
                  <h3 className="text-xl font-bold text-primary">Zatím nemáte žádné zakoupené vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Zakupte si voucher v sekci "Dostupné" nebo "Oblíbené"
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {purchasedVouchers.map((userVoucher) => {
                  const expiration = getExpirationInfo(userVoucher.created_at);

                  return (
                    <Card key={userVoucher.id} className={`relative overflow-hidden rounded-2xl border shadow-md ${expiration.isExpired ? 'border-destructive/30 bg-destructive/5' : 'border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30'}`}>
                      <CardContent className="p-6 space-y-4">
                        {/* Voucher image */}
                        <div className="aspect-video rounded-lg overflow-hidden bg-muted/40">
                          {userVoucher.voucher?.image_url ? (
                            <img
                              src={userVoucher.voucher.image_url}
                              alt={userVoucher.voucher?.name}
                              className={`w-full h-full object-cover ${expiration.isExpired ? 'opacity-50 grayscale' : ''}`}
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
                            Zakoupeno: {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                          </div>
                          
                          {/* Expiration countdown */}
                          <div className={`flex items-center gap-2 text-sm ${expiration.isExpired ? 'text-destructive' : 'text-amber-500'}`}>
                            <Clock className="w-4 h-4" />
                            <span>
                              {expiration.isExpired ? 'Voucher vypršel' : `Platnost: ${expiration.text}`}
                            </span>
                          </div>
                          
                          {/* Voucher code */}
                          {!expiration.isExpired && (
                            <div className="bg-background/80 rounded-lg p-3 space-y-2">
                              <div className="text-xs text-muted-foreground">Váš kód:</div>
                              <div className="font-mono font-bold text-lg text-primary">{userVoucher.code}</div>
                            </div>
                          )}
                        </div>

                        {/* Copy button (only if not expired) */}
                        {!expiration.isExpired && (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleCopyVoucherCode(userVoucher.code)}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Zkopírovat kód
                          </Button>
                        )}

                        {expiration.isExpired && (
                          <Badge variant="destructive" className="w-full justify-center py-2">
                            Voucher vypršel
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
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
