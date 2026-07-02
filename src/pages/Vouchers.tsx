import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { LoggedOutScreen } from '@/components/LoggedOutScreen';
import { useHomepageVouchers } from '@/hooks/useHomepageVouchers';
import { useUserVouchers } from '@/hooks/useUserVouchers';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Copy } from 'lucide-react';
import { OneMilVoucherIcon, OneMilHeartIcon, OneMilTicketIcon, OneMilCartIcon } from '@/components/icons/OneMilIcons';
import { VoucherDetailDialog, VoucherShowcaseCard } from '@/components/VoucherShowcase';
import { supabase } from '@/integrations/supabase/client';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

const Vouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'available';
  const { vouchers: availableVouchers, loading: availableLoading, refetch: refetchAvailable } = useHomepageVouchers();
  const { vouchers: userVouchers, loading: userVouchersLoading, refetch: refetchUserVouchers, optimisticRemoveByVoucherId, optimisticAddFavorite } = useUserVouchers();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [codeModalVoucher, setCodeModalVoucher] = useState<{ code: string | null; name: string } | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<{
    id: string;
    name: string;
    image_url: string | null;
    banner_url: string | null;
    max_quantity: number | null;
    redeemed_count: number;
    start_date: string | null;
    end_date: string | null;
    short_description?: string | null;
    usage_description?: string | null;
    terms_text?: string | null;
    how_to_use_text?: string | null;
  } | null>(null);

  // Separate user vouchers into favorites (redeemed=false) and purchased (redeemed=true)
  const favoriteVouchers = userVouchers.filter(uv => !uv.redeemed);
  const purchasedVouchers = userVouchers.filter(uv => uv.redeemed);

  const toShowcaseVoucher = (userVoucher: (typeof userVouchers)[number]) => ({
    id: userVoucher.voucher_id,
    name: userVoucher.voucher?.name ?? 'Voucher',
    image_url: userVoucher.voucher?.image_url ?? null,
    banner_url: userVoucher.voucher?.banner_url ?? null,
    max_quantity: null,
    redeemed_count: 0,
    start_date: null,
    end_date: null,
    short_description: userVoucher.voucher?.short_description ?? null,
    usage_description: userVoucher.voucher?.usage_description ?? null,
    terms_text: userVoucher.voucher?.terms_text ?? null,
    how_to_use_text: userVoucher.voucher?.how_to_use_text ?? null,
  });

  const isFavoriteVoucher = (voucherId: string) => {
    return userVouchers.some(uv => uv.voucher_id === voucherId && !uv.redeemed);
  };

  const isPurchasedVoucher = (voucherId: string) => {
    return userVouchers.some(uv => uv.voucher_id === voucherId && uv.redeemed);
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
        banner_url: voucherData.banner_url,
        short_description: voucherData.short_description,
        usage_description: voucherData.usage_description,
        terms_text: voucherData.terms_text,
        how_to_use_text: voucherData.how_to_use_text,
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
      await supabase.rpc('ensure_wallet_exists', { p_user_id: user.id });

      const { data, error } = await supabase.rpc('buy_voucher_atomic', {
        p_user_id: user.id,
        p_voucher_id: voucherId,
      });

      if (error) {
        console.error('[buy_voucher_atomic] RPC transport error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          full: error,
        });
        throw error;
      }

      const result = data as { success: boolean; error?: string };

      console.log('[buy_voucher_atomic] RPC result:', result);

      if (!result.success) {
        console.error('[buy_voucher_atomic] Business error:', result.error);
        toast.error(result.error || "Nepodařilo se zakoupit voucher");
        return;
      }

      analytics.voucherRedeem(voucherId, 5);

      // Optimistically remove from favorites list immediately (covers oblíbené tab)
      optimisticRemoveByVoucherId(voucherId);

      toast.success(`Voucher úspěšně zakoupen za 5 MioCoinů!`);
      if (selectedVoucher?.id === voucherId) {
        setSelectedVoucher(null);
      }
      await refetchUserVouchers();
      await refetchAvailable();
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
    return <LoggedOutScreen />;
  }

  // Available tab keeps favorites visible so the heart can add/remove them.
  const truelyAvailableVouchers = availableVouchers.filter(v => !isPurchasedVoucher(v.id));
  const selectedVoucherIsPurchased = selectedVoucher ? isPurchasedVoucher(selectedVoucher.id) : false;

  return (
    <div className="vouchers-light-page min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Premium Header Card */}
        <div className="customer-light-hero-panel relative overflow-hidden rounded-2xl p-6">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,181,71,1) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 4s ease-in-out infinite',
            }}
          />
          <div className="relative flex items-center gap-4">
            <div
              className="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)',
                boxShadow: '0 4px 20px rgba(255,138,0,0.3)',
              }}
            >
              <OneMilVoucherIcon size={36} className="w-7 h-7 md:w-9 md:h-9 text-black" />
            </div>
            <div>
              <h1 className="customer-premium-orange-heading text-2xl md:text-3xl font-bold tracking-tight">
                Vouchery
              </h1>
              <p className="text-sm text-gray-400 mt-1">Sbírejte a uplatňujte exkluzivní vouchery</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="customer-light-tabs grid w-full grid-cols-3 max-w-lg mx-auto bg-card/60 border border-border/40 backdrop-blur-sm rounded-xl p-1">
            <TabsTrigger value="available" className="flex items-center gap-1 text-xs sm:text-sm data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg transition-all">
              <OneMilTicketIcon size={16} className="w-4 h-4" />
              <span className="hidden sm:inline">Dostupné</span>
              <span className="sm:hidden">Dost.</span>
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-1 text-xs sm:text-sm data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg transition-all">
              <OneMilHeartIcon size={16} className="w-4 h-4" />
              <span className="hidden sm:inline">Oblíbené</span>
              <span className="sm:hidden">Obl.</span>
              {favoriteVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{favoriteVouchers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="purchased" className="flex items-center gap-1 text-xs sm:text-sm data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg transition-all">
              <OneMilCartIcon size={16} className="w-4 h-4" />
              <span className="hidden sm:inline">Zakoupené</span>
              <span className="sm:hidden">Zak.</span>
              {purchasedVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{purchasedVouchers.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Dostupné vouchery Tab */}
          <TabsContent value="available" className="space-y-6">
            {availableLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.3)]">
                    <CardContent className="p-5 space-y-4">
                      <div className="h-32 bg-muted/20 rounded-lg animate-pulse" />
                      <div className="h-6 bg-muted/20 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-muted/15 rounded animate-pulse w-1/2" />
                      <div className="h-11 bg-muted/20 rounded-lg animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {truelyAvailableVouchers.map((voucher) => (
                  <VoucherShowcaseCard
                    key={voucher.id}
                    voucher={voucher}
                    onDetail={() => setSelectedVoucher(voucher)}
                    onFavoriteToggle={(event) => handleFavoriteClick(event, voucher.id)}
                    favoriteActive={isFavoriteVoucher(voucher.id)}
                    favoriteDisabled={togglingFavoriteId === voucher.id}
                    favoriteAriaLabel={isFavoriteVoucher(voucher.id) ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                    showInfoBadges={false}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Oblíbené vouchery Tab */}
          <TabsContent value="favorites" className="space-y-6">
            {userVouchersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.3)]">
                    <CardContent className="p-5 space-y-4">
                      <div className="aspect-video bg-muted/20 rounded-lg animate-pulse" />
                      <div className="h-6 bg-muted/20 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-muted/15 rounded animate-pulse w-1/3" />
                      <div className="h-11 bg-muted/20 rounded-lg animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : favoriteVouchers.length === 0 ? (
              <Card className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.3)]">
                <CardContent className="p-8 space-y-3 text-center">
                  <OneMilHeartIcon size={48} className="w-12 h-12 mx-auto text-secondary/50" />
                  <h3 className="customer-premium-orange-heading text-xl font-bold text-heading-gold">Zatím nemáte žádné oblíbené vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Kliknutím na srdíčko přidáte voucher do oblíbených
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {favoriteVouchers.map((userVoucher) => {
                  const voucher = toShowcaseVoucher(userVoucher);

                  return (
                    <VoucherShowcaseCard
                      key={userVoucher.id}
                      voucher={voucher}
                      onDetail={() => setSelectedVoucher(voucher)}
                      onFavoriteToggle={(event) => handleFavoriteClick(event, userVoucher.voucher_id)}
                      favoriteActive
                      favoriteDisabled={togglingFavoriteId === userVoucher.voucher_id}
                      favoriteAriaLabel="Odebrat z oblíbených"
                      showInfoBadges={false}
                      className="w-full"
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Zakoupené vouchery Tab */}
          <TabsContent value="purchased" className="space-y-6">
            {userVouchersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.3)]">
                    <CardContent className="p-5 space-y-4">
                      <div className="aspect-video bg-muted/20 rounded-lg animate-pulse" />
                      <div className="h-6 bg-muted/20 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-muted/15 rounded animate-pulse w-1/3" />
                      <div className="h-16 bg-muted/20 rounded-lg animate-pulse" />
                      <div className="h-11 bg-muted/20 rounded-lg animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : purchasedVouchers.length === 0 ? (
              <Card className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.3)]">
                <CardContent className="p-8 space-y-3 text-center">
                  <OneMilCartIcon size={48} className="w-12 h-12 mx-auto text-secondary/50" />
                  <h3 className="customer-premium-orange-heading text-xl font-bold text-heading-gold">Zatím nemáte žádné zakoupené vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Zakupte si voucher v sekci "Dostupné" nebo "Oblíbené"
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {purchasedVouchers.map((userVoucher) => {
                  const bannerUrl = userVoucher.voucher?.banner_url || userVoucher.voucher?.image_url || null;
                  const voucherName = userVoucher.voucher?.name ?? 'Voucher';
                  const voucher = toShowcaseVoucher(userVoucher);

                  return (
                    <Card 
                      key={userVoucher.id} 
                      className="voucher-card-glow relative aspect-[16/9] min-h-0 overflow-hidden rounded-[20px] border-[3px] border-[rgba(255,138,0,0.35)] shadow-[0_4px_20px_hsl(220_50%_3%/0.6)] transition-all duration-300 hover:scale-[1.02] hover:border-[rgba(255,138,0,0.55)] hover:shadow-[0_0_16px_rgba(255,138,0,0.2)]"
                    >
                      {bannerUrl ? (
                        <img
                          src={bannerUrl}
                          alt={voucherName}
                          className="absolute inset-0 z-[1] h-full w-full object-cover object-center"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[hsl(220_30%_10%)]">
                          <OneMilVoucherIcon size={56} className="h-14 w-14 text-[rgba(255,138,0,0.45)]" />
                        </div>
                      )}

                      <div
                        className="absolute inset-0 z-[2]"
                        style={{
                          background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.24) 42%, rgba(0,0,0,0.82) 100%)',
                        }}
                      />

                      <div className="relative z-[3] flex h-full flex-col p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-2">
                          <Badge className="rounded-full border border-white/15 bg-[rgba(10,12,18,0.72)] px-3 py-1 text-[11px] font-medium text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                            Zakoupeno
                          </Badge>
                        </div>

                        <div className="mt-auto space-y-3">
                          <div className="space-y-1">
                            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-white drop-shadow-md">
                              {voucherName}
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Button
                              className="h-10 rounded-xl border-0 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-sm font-bold text-[#111] shadow-[0_2px_8px_rgba(255,138,0,0.25)] hover:brightness-105"
                              onClick={() => setSelectedVoucher(voucher)}
                            >
                              Detail
                            </Button>
                            <Button
                              className="h-10 rounded-xl border-0 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-sm font-bold text-[#111] shadow-[0_2px_8px_rgba(255,138,0,0.25)] hover:brightness-105"
                              onClick={() => setCodeModalVoucher({ code: userVoucher.code, name: voucherName })}
                            >
                              Zobrazit kód
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>


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

      {/* Voucher code modal: showing the code does not change DB state. */}
      <Dialog open={!!codeModalVoucher} onOpenChange={(open) => !open && setCodeModalVoucher(null)}>
        <DialogContent className="voucher-code-dialog sm:max-w-md border-[rgba(255,138,0,0.35)] bg-gradient-to-b from-[hsl(220_30%_8%)] to-[hsl(220_35%_5%)]">
          <DialogHeader>
            <DialogTitle className="text-heading-gold">Zobrazit kód</DialogTitle>
            <DialogDescription>
              {codeModalVoucher?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Kód můžete zkopírovat, opsat nebo ukázat partnerovi.
            </p>
            <div className="rounded-xl bg-[hsl(220_30%_10%)] border border-[rgba(255,138,0,0.3)] p-4 text-center">
              {codeModalVoucher?.code ? (
                <span className="font-mono text-xl font-bold text-[#FFB547] tracking-wider">
                  {codeModalVoucher.code}
                </span>
              ) : (
                <span className="text-sm font-medium text-white/75">
                  Kód zatím není dostupný
                </span>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full rounded-xl border-[rgba(255,138,0,0.3)] bg-[rgba(10,12,18,0.72)] text-white hover:bg-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.5)]"
              disabled={!codeModalVoucher?.code}
              onClick={() => {
                if (codeModalVoucher?.code) {
                  handleCopyVoucherCode(codeModalVoucher.code);
                }
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Zkopírovat kód
            </Button>
          </div>
          <DialogFooter className="text-xs text-muted-foreground">
            Zavření okna nic nemění. Kód lze zobrazit opakovaně.
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VoucherDetailDialog
        voucher={selectedVoucher}
        open={!!selectedVoucher}
        onOpenChange={(open) => !open && setSelectedVoucher(null)}
        onPurchase={handleVoucherPurchase}
        purchaseDisabled={isAdmin || selectedVoucherIsPurchased}
        purchaseLoading={purchasingId !== null}
        purchaseLabel={selectedVoucherIsPurchased ? 'Zakoupeno' : 'Koupit za 5 MioCoinů'}
      />

    </div>
  );
};

export default Vouchers;
