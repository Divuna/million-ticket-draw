import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Gift, Copy, Heart, Ticket, Clock, ShoppingCart, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import '@/components/ContestCard.css';

// Voucher expiration duration in days (from purchase date)
const VOUCHER_EXPIRATION_DAYS = 30;

const Vouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'available';
  const { vouchers: availableVouchers, loading: availableLoading, getRemainingCount, isVoucherAvailable, refetch: refetchAvailable } = useHomepageVouchers();
  const { vouchers: userVouchers, loading: userVouchersLoading, refetch: refetchUserVouchers, optimisticRemoveByVoucherId, optimisticAddFavorite } = useUserVouchers();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

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

  const handleFavoriteClick = (e: React.MouseEvent, voucherId: string) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error("Pro přidání do oblíbených se musíte přihlásit");
      return;
    }

    // Explicitly find favorite (redeemed=false) vs purchased (redeemed=true)
    const existingFavorite = userVouchers.find(uv => uv.voucher_id === voucherId && !uv.redeemed);
    const existingPurchased = userVouchers.find(uv => uv.voucher_id === voucherId && uv.redeemed);
    
    if (existingFavorite) {
      // Show confirmation dialog for removal - only for favorites
      setRemoveConfirmId(voucherId);
    } else if (existingPurchased) {
      toast.info("Zakoupený voucher nelze odebrat z oblíbených");
    } else {
      // Add to favorites directly
      addToFavorites(voucherId);
    }
  };

  const addToFavorites = async (voucherId: string) => {
    if (!user) return;
    
    setTogglingFavoriteId(voucherId);

    // Find voucher data for optimistic update
    const voucherData = availableVouchers.find(v => v.id === voucherId);
    
    // Optimistically add to favorites immediately
    if (voucherData) {
      optimisticAddFavorite(voucherId, {
        id: voucherData.id,
        name: voucherData.name,
        image_url: voucherData.image_url || '',
        banner_url: voucherData.banner_url
      });
    }

    try {
      const { error } = await supabase
        .from('user_vouchers')
        .insert({
          user_id: user.id,
          voucher_id: voucherId,
          redeemed: false
        });

      if (error) throw error;
      toast.success("Voucher přidán do oblíbených");
      await refetchUserVouchers();
      await refetchAvailable();
    } catch (error) {
      console.error("Error adding favorite:", error);
      toast.error("Nepodařilo se přidat do oblíbených");
      // Revert optimistic update on error
      optimisticRemoveByVoucherId(voucherId);
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const confirmRemoveFavorite = async () => {
    if (!user || !removeConfirmId) return;
    
    const voucherIdToRemove = removeConfirmId;
    setRemoveConfirmId(null);
    setTogglingFavoriteId(voucherIdToRemove);

    // Find the specific favorite record to ensure we have the correct voucher_id
    const favoriteToRemove = userVouchers.find(
      uv => uv.voucher_id === voucherIdToRemove && !uv.redeemed
    );
    
    if (!favoriteToRemove) {
      toast.error("Oblíbený voucher nenalezen");
      setTogglingFavoriteId(null);
      return;
    }

    console.log("Removing favorite:", {
      user_voucher_id: favoriteToRemove.id,
      voucher_id: favoriteToRemove.voucher_id,
      redeemed: favoriteToRemove.redeemed
    });

    // Optimistically update local state immediately
    optimisticRemoveByVoucherId(voucherIdToRemove);

    try {
      const { data, error } = await supabase
        .from('user_vouchers')
        .delete()
        .eq('voucher_id', favoriteToRemove.voucher_id)
        .eq('user_id', user.id)
        .eq('redeemed', false)
        .select();

      console.log("Delete response:", { data, error });

      if (error) throw error;
      
      // Check if any row was actually deleted
      if (!data || data.length === 0) {
        throw new Error('Voucher nebyl nalezen nebo nemáte oprávnění k jeho odebrání');
      }
      
      toast.success("Voucher odebrán z oblíbených");
      await refetchUserVouchers();
      await refetchAvailable();
    } catch (error: any) {
      console.error("Error removing favorite:", error);
      toast.error(error.message || "Nepodařilo se odebrat z oblíbených");
      // Refetch to restore state on error
      await refetchUserVouchers();
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
      
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Premium Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-3">
            <Gift className="w-8 h-8 text-secondary" />
            <h1 className="text-3xl font-bold text-heading-gold">Vouchery</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Sbírejte a uplatňujte exkluzivní vouchery
          </p>
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto bg-card/60 border border-border/40 backdrop-blur-sm rounded-xl p-1">
            <TabsTrigger value="available" className="flex items-center gap-1 text-xs sm:text-sm data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg transition-all">
              <Ticket className="w-4 h-4" />
              <span className="hidden sm:inline">Dostupné</span>
              <span className="sm:hidden">Dost.</span>
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-1 text-xs sm:text-sm data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg transition-all">
              <Heart className="w-4 h-4" />
              <span className="hidden sm:inline">Oblíbené</span>
              <span className="sm:hidden">Obl.</span>
              {favoriteVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{favoriteVouchers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="purchased" className="flex items-center gap-1 text-xs sm:text-sm data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg transition-all">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Zakoupené</span>
              <span className="sm:hidden">Zak.</span>
              {purchasedVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{purchasedVouchers.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Dostupné vouchery Tab */}
          <TabsContent value="available" className="space-y-8">
            {availableLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="voucher-card-premium h-[340px] p-6">
                    <div className="voucher-inner-glow" />
                    <div className="relative z-10 h-full flex flex-col">
                      <div className="h-24 bg-muted/20 rounded-xl animate-pulse mb-4" />
                      <div className="h-8 bg-muted/15 rounded animate-pulse w-2/3 mb-3" />
                      <div className="h-16 bg-muted/20 rounded animate-pulse w-1/2 mb-4" />
                      <div className="mt-auto h-14 bg-muted/20 rounded-xl animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : truelyAvailableVouchers.length === 0 ? (
              <div className="voucher-card-premium p-10 text-center">
                <div className="voucher-inner-glow" />
                <div className="relative z-10 space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-secondary/10 flex items-center justify-center">
                    <Gift className="w-10 h-10 text-secondary/60" />
                  </div>
                  <h3 className="text-2xl font-bold text-heading-gold">Žádné dostupné vouchery</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Momentálně nejsou k dispozici žádné nové vouchery.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {truelyAvailableVouchers.map((voucher) => {
                  const remaining = getRemainingCount(voucher);
                  const isAvailable = isVoucherAvailable(voucher);
                  const isPurchasing = purchasingId === voucher.id;
                  const isTogglingFavorite = togglingFavoriteId === voucher.id;

                  return (
                    <div 
                      key={voucher.id} 
                      className="voucher-card-premium h-[340px] transition-all duration-300"
                    >
                      <div className="voucher-inner-glow" />
                      
                      {/* Favorite heart button */}
                      <button
                        onClick={(e) => handleFavoriteClick(e, voucher.id)}
                        disabled={isTogglingFavorite}
                        className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-background/60 backdrop-blur-md border border-border/40 hover:bg-background/80 hover:border-secondary/40 transition-all duration-200 disabled:opacity-50"
                        aria-label="Přidat do oblíbených"
                      >
                        {isTogglingFavorite ? (
                          <Loader2 className="w-5 h-5 text-secondary animate-spin" />
                        ) : (
                          <Heart className="w-5 h-5 text-muted-foreground hover:text-destructive transition-colors" />
                        )}
                      </button>

                      {/* Remaining count badge */}
                      <div className="absolute top-5 left-5 z-20">
                        <Badge className="bg-background/70 backdrop-blur-md border border-border/50 text-foreground text-xs px-3 py-1.5">
                          Zbývá: {remaining}
                        </Badge>
                      </div>

                      <div className="relative z-10 h-full p-6 flex flex-col">
                        {/* Header with icon */}
                        <div className="flex items-center gap-3 mb-3 pt-8">
                          <div className="w-11 h-11 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-secondary" />
                          </div>
                          <div>
                            <h2 className="text-foreground font-bold text-sm tracking-widest uppercase">ONEMIL VOUCHER</h2>
                            <p className="text-muted-foreground text-xs font-medium">HRAJ O CENY</p>
                          </div>
                        </div>

                        {/* Voucher name */}
                        <h3 className="text-foreground font-bold text-xl mb-2 line-clamp-2">{voucher.name}</h3>

                        {/* Separator */}
                        <div className="voucher-separator" />

                        {/* PRICE - Dominant element */}
                        <div className="flex-1 flex flex-col justify-center items-center py-2">
                          <span className="text-muted-foreground text-sm font-medium uppercase tracking-wide mb-1">Cena</span>
                          <div className="voucher-price-hero">5 MioCoinů</div>
                        </div>

                        {/* Separator */}
                        <div className="voucher-separator" />

                        {/* CTA Button */}
                        <div className="space-y-2.5 mt-auto">
                          <button
                            onClick={() => handleVoucherPurchase(voucher.id)}
                            disabled={!isAvailable || isPurchasing || isAdmin}
                            className="voucher-cta-premium w-full flex items-center justify-center gap-2"
                          >
                            {isPurchasing ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Kupuji...
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-5 h-5" />
                                KOUPIT ZA 5 MC
                              </>
                            )}
                          </button>
                          <p className="text-xs text-center text-muted-foreground">
                            50 % z částky jde na pomoc potřebným.
                          </p>
                        </div>

                        {/* Unavailable badge */}
                        {!isAvailable && (
                          <div className="absolute bottom-6 right-6">
                            <Badge variant="destructive">Nedostupný</Badge>
                          </div>
                        )}
                      </div>

                      {/* Image overlay in corner */}
                      {voucher.image_url && (
                        <div className="absolute bottom-0 right-0 w-28 h-28 z-0 opacity-20">
                          <img
                            src={voucher.image_url}
                            alt=""
                            className="w-full h-full object-cover rounded-tl-3xl"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-tl from-transparent via-transparent to-[hsl(30_25%_8%)]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Oblíbené vouchery Tab */}
          <TabsContent value="favorites" className="space-y-8">
            {userVouchersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="voucher-card-premium h-[340px] p-6">
                    <div className="voucher-inner-glow" />
                    <div className="relative z-10 h-full flex flex-col">
                      <div className="h-24 bg-muted/20 rounded-xl animate-pulse mb-4" />
                      <div className="h-8 bg-muted/15 rounded animate-pulse w-2/3 mb-3" />
                      <div className="h-16 bg-muted/20 rounded animate-pulse w-1/2 mb-4" />
                      <div className="mt-auto h-14 bg-muted/20 rounded-xl animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : favoriteVouchers.length === 0 ? (
              <div className="voucher-card-premium p-10 text-center">
                <div className="voucher-inner-glow" />
                <div className="relative z-10 space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
                    <Heart className="w-10 h-10 text-destructive/60" />
                  </div>
                  <h3 className="text-2xl font-bold text-heading-gold">Zatím nemáte žádné oblíbené vouchery</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Kliknutím na srdíčko přidáte voucher do oblíbených
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {favoriteVouchers.map((userVoucher) => {
                  const isPurchasing = purchasingId === userVoucher.voucher_id;
                  const isTogglingFavorite = togglingFavoriteId === userVoucher.voucher_id;

                  return (
                    <div 
                      key={userVoucher.id} 
                      className="voucher-card-premium h-[340px] transition-all duration-300"
                    >
                      <div className="voucher-inner-glow" />
                      
                      {/* Remove from favorites button */}
                      <button
                        onClick={(e) => handleFavoriteClick(e, userVoucher.voucher_id)}
                        disabled={isTogglingFavorite}
                        className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-background/60 backdrop-blur-md border border-destructive/30 hover:bg-background/80 hover:border-destructive/50 transition-all duration-200 disabled:opacity-50"
                        aria-label="Odebrat z oblíbených"
                      >
                        {isTogglingFavorite ? (
                          <Loader2 className="w-5 h-5 text-destructive animate-spin" />
                        ) : (
                          <Heart className="w-5 h-5 fill-destructive text-destructive transition-colors" />
                        )}
                      </button>

                      {/* Added date badge */}
                      <div className="absolute top-5 left-5 z-20">
                        <Badge className="bg-background/70 backdrop-blur-md border border-border/50 text-foreground text-xs px-3 py-1.5">
                          Přidáno: {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                        </Badge>
                      </div>

                      <div className="relative z-10 h-full p-6 flex flex-col">
                        {/* Header with icon */}
                        <div className="flex items-center gap-3 mb-3 pt-8">
                          <div className="w-11 h-11 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                            <Heart className="w-5 h-5 text-secondary" />
                          </div>
                          <div>
                            <h2 className="text-foreground font-bold text-sm tracking-widest uppercase">ONEMIL VOUCHER</h2>
                            <p className="text-muted-foreground text-xs font-medium">OBLÍBENÉ</p>
                          </div>
                        </div>

                        {/* Voucher name */}
                        <h3 className="text-foreground font-bold text-xl mb-2 line-clamp-2">{userVoucher.voucher?.name}</h3>

                        {/* Separator */}
                        <div className="voucher-separator" />

                        {/* PRICE - Dominant element */}
                        <div className="flex-1 flex flex-col justify-center items-center py-2">
                          <span className="text-muted-foreground text-sm font-medium uppercase tracking-wide mb-1">Cena</span>
                          <div className="voucher-price-hero">5 MioCoinů</div>
                        </div>

                        {/* Separator */}
                        <div className="voucher-separator" />

                        {/* CTA Button */}
                        <div className="space-y-2.5 mt-auto">
                          <button
                            onClick={() => handleVoucherPurchase(userVoucher.voucher_id)}
                            disabled={isPurchasing || isAdmin}
                            className="voucher-cta-premium w-full flex items-center justify-center gap-2"
                          >
                            {isPurchasing ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Kupuji...
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-5 h-5" />
                                KOUPIT ZA 5 MC
                              </>
                            )}
                          </button>
                          <p className="text-xs text-center text-muted-foreground">
                            50 % z částky jde na pomoc potřebným.
                          </p>
                        </div>
                      </div>

                      {/* Image overlay in corner */}
                      {userVoucher.voucher?.image_url && (
                        <div className="absolute bottom-0 right-0 w-28 h-28 z-0 opacity-20">
                          <img
                            src={userVoucher.voucher.image_url}
                            alt=""
                            className="w-full h-full object-cover rounded-tl-3xl"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-tl from-transparent via-transparent to-[hsl(30_25%_8%)]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Zakoupené vouchery Tab */}
          <TabsContent value="purchased" className="space-y-8">
            {userVouchersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="voucher-card-premium h-[340px] p-6">
                    <div className="voucher-inner-glow" />
                    <div className="relative z-10 h-full flex flex-col">
                      <div className="h-24 bg-muted/20 rounded-xl animate-pulse mb-4" />
                      <div className="h-8 bg-muted/15 rounded animate-pulse w-2/3 mb-3" />
                      <div className="h-12 bg-muted/20 rounded animate-pulse w-3/4 mb-4" />
                      <div className="mt-auto h-14 bg-muted/20 rounded-xl animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : purchasedVouchers.length === 0 ? (
              <div className="voucher-card-premium p-10 text-center">
                <div className="voucher-inner-glow" />
                <div className="relative z-10 space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-secondary/10 flex items-center justify-center">
                    <ShoppingCart className="w-10 h-10 text-secondary/60" />
                  </div>
                  <h3 className="text-2xl font-bold text-heading-gold">Zatím nemáte žádné zakoupené vouchery</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Zakupte si voucher v sekci "Dostupné" nebo "Oblíbené"
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {purchasedVouchers.map((userVoucher) => {
                  const expiration = getExpirationInfo(userVoucher.created_at);

                  return (
                    <div 
                      key={userVoucher.id} 
                      className={`h-[340px] transition-all duration-300 ${
                        expiration.isExpired 
                          ? 'voucher-card-premium voucher-card-expired' 
                          : 'voucher-card-premium'
                      }`}
                    >
                      <div className="voucher-inner-glow" />

                      {/* Purchase date badge */}
                      <div className="absolute top-5 left-5 z-20">
                        <Badge className="bg-background/70 backdrop-blur-md border border-border/50 text-foreground text-xs px-3 py-1.5">
                          {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                        </Badge>
                      </div>

                      {/* Expiration indicator */}
                      <div className="absolute top-5 right-5 z-20">
                        <Badge 
                          className={`backdrop-blur-md text-xs px-3 py-1.5 flex items-center gap-1.5 ${
                            expiration.isExpired 
                              ? 'bg-destructive/20 border border-destructive/40 text-destructive' 
                              : 'bg-background/70 border border-secondary/30 text-secondary'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {expiration.isExpired ? 'Vypršel' : expiration.text}
                        </Badge>
                      </div>

                      <div className="relative z-10 h-full p-6 flex flex-col">
                        {/* Header with icon */}
                        <div className="flex items-center gap-3 mb-3 pt-8">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                            expiration.isExpired 
                              ? 'bg-destructive/15 border border-destructive/30' 
                              : 'bg-neon-green/15 border border-neon-green/30'
                          }`}>
                            <Gift className={`w-5 h-5 ${expiration.isExpired ? 'text-destructive' : 'text-neon-green'}`} />
                          </div>
                          <div>
                            <h2 className="text-foreground font-bold text-sm tracking-widest uppercase">ONEMIL VOUCHER</h2>
                            <p className={`text-xs font-medium ${expiration.isExpired ? 'text-destructive' : 'text-neon-green'}`}>
                              {expiration.isExpired ? 'VYPRŠENO' : 'ZAKOUPENO'}
                            </p>
                          </div>
                        </div>

                        {/* Voucher name */}
                        <h3 className={`font-bold text-xl mb-2 line-clamp-2 ${expiration.isExpired ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {userVoucher.voucher?.name}
                        </h3>

                        {/* Separator */}
                        <div className="voucher-separator" />

                        {/* Voucher code - Dominant element for purchased */}
                        <div className="flex-1 flex flex-col justify-center items-center py-2">
                          {!expiration.isExpired ? (
                            <>
                              <span className="text-muted-foreground text-sm font-medium uppercase tracking-wide mb-2">Váš kód</span>
                              <div className="font-mono text-3xl font-bold text-secondary tracking-wider">
                                {userVoucher.code}
                              </div>
                            </>
                          ) : (
                            <div className="text-center">
                              <span className="text-destructive text-lg font-bold">Voucher vypršel</span>
                              <p className="text-muted-foreground text-sm mt-1">Platnost {VOUCHER_EXPIRATION_DAYS} dní od nákupu</p>
                            </div>
                          )}
                        </div>

                        {/* Separator */}
                        <div className="voucher-separator" />

                        {/* Copy button or expired message */}
                        <div className="mt-auto">
                          {!expiration.isExpired ? (
                            <button
                              onClick={() => handleCopyVoucherCode(userVoucher.code)}
                              className="voucher-cta-premium w-full flex items-center justify-center gap-2"
                            >
                              <Copy className="w-5 h-5" />
                              ZKOPÍROVAT KÓD
                            </button>
                          ) : (
                            <div className="w-full py-4 px-6 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
                              <span className="text-destructive font-medium text-sm">Platnost voucheru vypršela</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Image overlay in corner */}
                      {userVoucher.voucher?.image_url && (
                        <div className={`absolute bottom-0 right-0 w-28 h-28 z-0 ${expiration.isExpired ? 'opacity-10 grayscale' : 'opacity-20'}`}>
                          <img
                            src={userVoucher.voucher.image_url}
                            alt=""
                            className="w-full h-full object-cover rounded-tl-3xl"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-tl from-transparent via-transparent to-[hsl(30_25%_8%)]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}

      {/* Confirmation dialog for removing favorite */}
      <AlertDialog open={!!removeConfirmId} onOpenChange={(open) => !open && setRemoveConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odebrat z oblíbených?</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete odebrat tento voucher z oblíbených?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveFavorite}>
              Odebrat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Vouchers;
