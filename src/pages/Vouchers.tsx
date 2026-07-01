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
import { Copy, Clock, Loader2 } from 'lucide-react';
import { OneMilVoucherIcon, OneMilHeartIcon, OneMilTicketIcon, OneMilCartIcon } from '@/components/icons/OneMilIcons';
import { VoucherDetailDialog, VoucherShowcaseCard } from '@/components/VoucherShowcase';
import { supabase } from '@/integrations/supabase/client';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

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
  const [redeemModalVoucher, setRedeemModalVoucher] = useState<{ code: string; name: string } | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<{
    id: string;
    name: string;
    image_url: string | null;
    banner_url: string | null;
    max_quantity: number | null;
    redeemed_count: number;
    start_date: string | null;
    end_date: string | null;
  } | null>(null);

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
          : `${diffHours} hodin`,
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

  // Vouchers not in user's collection (available for purchase/favorite)
  const truelyAvailableVouchers = availableVouchers.filter(v => !isInUserVouchers(v.id));

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Premium Header Card */}
        <div
          className="relative overflow-hidden rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
            border: '1px solid rgba(255,138,0,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.1)',
          }}
        >
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
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, #FFB547 0%, #FF8A00 50%, #FFB547 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Vouchery
              </h1>
              <p className="text-sm text-gray-400 mt-1">Sbírejte a uplatňujte exkluzivní vouchery</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto bg-card/60 border border-border/40 backdrop-blur-sm rounded-xl p-1">
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
                {truelyAvailableVouchers.map((voucher) => {
                  const remaining = getRemainingCount(voucher);

                  return (
                    <VoucherShowcaseCard
                      key={voucher.id}
                      voucher={voucher}
                      remainingLabel={typeof remaining === 'number' ? `Zbývá: ${remaining}` : null}
                      onDetail={() => setSelectedVoucher(voucher)}
                      className="w-full"
                    />
                  );
                })}
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
                  <h3 className="text-xl font-bold text-heading-gold">Zatím nemáte žádné oblíbené vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Kliknutím na srdíčko přidáte voucher do oblíbených
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {favoriteVouchers.map((userVoucher) => {
                  const isPurchasing = purchasingId === userVoucher.voucher_id;
                  const isTogglingFavorite = togglingFavoriteId === userVoucher.voucher_id;

                  return (
                    <Card key={userVoucher.id} className="voucher-card-glow relative overflow-hidden rounded-[20px] border-[3px] border-[rgba(255,138,0,0.35)] shadow-[0_4px_20px_hsl(220_50%_3%/0.6)] transition-all duration-300 hover:border-[rgba(255,138,0,0.55)] hover:shadow-[0_0_16px_rgba(255,138,0,0.2)] hover:scale-[1.02]">
                      {/* Dark navy/black gradient background with gold particles */}
                      <div 
                        className="absolute inset-0 z-0"
                        style={{
                          background: `
                            radial-gradient(ellipse at center, transparent 40%, hsl(220 30% 4% / 0.8) 100%),
                            linear-gradient(135deg, hsl(220 35% 10%) 0%, hsl(220 30% 6%) 50%, hsl(220 25% 4%) 100%)
                          `
                        }}
                      />
                      {/* Gold particle effect */}
                      <div 
                        className="absolute inset-0 z-[1] opacity-60"
                        style={{
                          background: `
                            radial-gradient(1.5px 1.5px at 15% 25%, rgba(255,138,0,0.45) 50%, transparent 100%),
                            radial-gradient(1px 1px at 30% 60%, rgba(255,181,71,0.3) 50%, transparent 100%),
                            radial-gradient(1.2px 1.2px at 55% 20%, rgba(255,138,0,0.35) 50%, transparent 100%),
                            radial-gradient(0.8px 0.8px at 70% 45%, rgba(255,181,71,0.25) 50%, transparent 100%),
                            radial-gradient(1px 1px at 85% 75%, rgba(255,138,0,0.3) 50%, transparent 100%),
                            radial-gradient(1.3px 1.3px at 10% 80%, rgba(255,181,71,0.28) 50%, transparent 100%),
                            radial-gradient(0.9px 0.9px at 45% 85%, rgba(255,138,0,0.22) 50%, transparent 100%)
                          `
                        }}
                      />

                      {/* Remove from favorites button */}
                      <button
                        onClick={(e) => handleFavoriteClick(e, userVoucher.voucher_id)}
                        disabled={isTogglingFavorite}
                        className="absolute top-4 left-4 z-20 p-2 rounded-full bg-[hsl(220_30%_8%/0.8)] backdrop-blur-sm border border-[rgba(255,138,0,0.3)] hover:bg-[hsl(220_30%_12%)] transition-all duration-200 disabled:opacity-50"
                        aria-label="Odebrat z oblíbených"
                      >
                        {isTogglingFavorite ? (
                          <Loader2 className="w-5 h-5 text-destructive animate-spin" />
                        ) : (
                          <OneMilHeartIcon size={20} className="w-5 h-5 fill-destructive text-destructive transition-colors" />
                        )}
                      </button>

                      <div className="flex h-48 relative z-10">
                        {/* Left side - Content */}
                        <div className="flex-1 p-5 flex flex-col justify-center">
                          {/* Header */}
                          <div className="mb-2">
                            <h2 className="text-foreground font-extrabold text-lg tracking-wide">ONEMIL VOUCHER</h2>
                            <p className="text-muted-foreground/60 text-xs font-normal tracking-widest uppercase">Hraj o ceny</p>
                          </div>

                          {/* Voucher name */}
                          <div className="mb-3">
                            <h3 className="text-foreground font-semibold text-base leading-snug mb-1">{userVoucher.voucher?.name}</h3>
                            <div className="text-[#FFB547] font-bold text-xl">5 MioCoinů</div>
                          </div>

                          {/* Button */}
                          <div className="space-y-1.5">
                            <Button
                              onClick={() => handleVoucherPurchase(userVoucher.voucher_id)}
                              disabled={isPurchasing || isAdmin}
                              className="w-full h-11 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-[#111] font-bold text-sm shadow-[0_2px_8px_rgba(255,138,0,0.25)] hover:shadow-[0_3px_12px_rgba(255,138,0,0.35)] hover:brightness-105 transition-all duration-200 border-0"
                            >
                              {isPurchasing ? "Kupuji..." : "KOUPIT ZA 5 MC"}
                            </Button>
                            <p className="text-[10px] text-muted-foreground/70">
                              Vybrané kampaně mohou podpořit dobročinný účel. Konkrétní příjemce, účel a výše podpory budou vždy uvedeny u dané kampaně.
                            </p>
                          </div>
                        </div>

                        {/* Right side - Image */}
                        <div className="w-28 relative border-l border-dashed border-[rgba(255,138,0,0.2)]">
                          {userVoucher.voucher?.image_url ? (
                            <img
                              src={userVoucher.voucher.image_url}
                              alt={userVoucher.voucher?.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full bg-[hsl(220_30%_10%)] flex items-center justify-center">
                              <OneMilVoucherIcon size={48} className="w-12 h-12 text-[rgba(255,138,0,0.35)]" />
                            </div>
                          )}
                        </div>

                        {/* Added date indicator */}
                        <div className="absolute top-3 right-3 bg-[hsl(220_30%_8%/0.85)] backdrop-blur-sm text-foreground/80 text-xs px-2 py-1 rounded border border-[rgba(255,138,0,0.2)]">
                          Přidáno: {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                        </div>
                      </div>
                    </Card>
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
                  <h3 className="text-xl font-bold text-heading-gold">Zatím nemáte žádné zakoupené vouchery</h3>
                  <p className="text-sm text-muted-foreground">
                    Zakupte si voucher v sekci "Dostupné" nebo "Oblíbené"
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {purchasedVouchers.map((userVoucher) => {
                  const expiration = getExpirationInfo(userVoucher.created_at);

                  return (
                    <Card 
                      key={userVoucher.id} 
                      className={`voucher-card-glow relative overflow-hidden rounded-[20px] shadow-[0_4px_20px_hsl(220_50%_3%/0.6)] transition-all duration-300 hover:scale-[1.02] border-[3px] ${
                        expiration.isExpired 
                          ? 'border-destructive/40'
                          : 'border-[rgba(255,138,0,0.35)] hover:border-[rgba(255,138,0,0.55)] hover:shadow-[0_0_16px_rgba(255,138,0,0.2)]'
                      }`}
                    >
                      {/* Dark navy/black gradient background with gold particles */}
                      <div 
                        className="absolute inset-0 z-0"
                        style={{
                          background: expiration.isExpired 
                            ? `radial-gradient(ellipse at center, transparent 40%, hsl(0 20% 4% / 0.8) 100%),
                               linear-gradient(135deg, hsl(0 15% 10%) 0%, hsl(0 10% 6%) 50%, hsl(0 8% 4%) 100%)`
                            : `radial-gradient(ellipse at center, transparent 40%, hsl(220 30% 4% / 0.8) 100%),
                               linear-gradient(135deg, hsl(220 35% 10%) 0%, hsl(220 30% 6%) 50%, hsl(220 25% 4%) 100%)`
                        }}
                      />
                      {/* Gold particle effect (only for non-expired) */}
                      {!expiration.isExpired && (
                        <div 
                          className="absolute inset-0 z-[1] opacity-60"
                          style={{
                            background: `
                              radial-gradient(1.5px 1.5px at 15% 25%, rgba(255,181,71,0.6) 50%, transparent 100%),
                              radial-gradient(1px 1px at 30% 60%, rgba(255,138,0,0.4) 50%, transparent 100%),
                              radial-gradient(1.2px 1.2px at 55% 20%, rgba(255,181,71,0.5) 50%, transparent 100%),
                              radial-gradient(0.8px 0.8px at 70% 45%, rgba(255,181,71,0.35) 50%, transparent 100%),
                              radial-gradient(1px 1px at 85% 75%, rgba(255,138,0,0.45) 50%, transparent 100%),
                              radial-gradient(1.3px 1.3px at 10% 80%, rgba(255,138,0,0.4) 50%, transparent 100%),
                              radial-gradient(0.9px 0.9px at 45% 85%, rgba(255,181,71,0.3) 50%, transparent 100%)
                            `
                          }}
                        />
                      )}

                      <div className="flex h-48 relative z-10">
                        {/* Left side - Content */}
                        <div className="flex-1 p-5 flex flex-col justify-center">
                          {/* Header */}
                          <div className="mb-2">
                            <h2 className="text-foreground font-extrabold text-lg tracking-wide">ONEMIL VOUCHER</h2>
                            <p className="text-muted-foreground/60 text-xs font-normal tracking-widest uppercase">Zakoupeno</p>
                          </div>

                          {/* Voucher name and code */}
                          <div className="mb-3">
                            <h3 className="text-foreground font-semibold text-base leading-snug mb-1">{userVoucher.voucher?.name}</h3>
                            {!expiration.isExpired && (
                              <div className="font-mono font-bold text-lg text-[#FFB547]">{userVoucher.code}</div>
                            )}
                          </div>

                          {/* Uplatnit voucher / Expiration */}
                          <div className="space-y-1.5">
                            {!expiration.isExpired ? (
                              <>
                                <Button
                                  className="w-full h-11 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-[#111] font-bold text-sm shadow-[0_2px_8px_rgba(255,138,0,0.25)] border-0"
                                  onClick={() => setRedeemModalVoucher({ code: userVoucher.code, name: userVoucher.voucher?.name ?? 'Voucher' })}
                                >
                                  Uplatnit voucher
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-9 rounded-xl border-[rgba(255,138,0,0.3)] bg-transparent hover:bg-[rgba(255,138,0,0.1)] hover:border-[rgba(255,138,0,0.5)] transition-all duration-200"
                                  onClick={() => handleCopyVoucherCode(userVoucher.code)}
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  Zkopírovat kód
                                </Button>
                              </>
                            ) : (
                              <Badge variant="destructive" className="w-full justify-center py-2 text-sm">
                                Voucher vypršel
                              </Badge>
                            )}
                            <div className={`flex items-center justify-center gap-1 text-[10px] ${expiration.isExpired ? 'text-destructive' : 'text-muted-foreground/70'}`}>
                              <Clock className="w-3 h-3" />
                              <span>{expiration.isExpired ? 'Vypršel' : `Platnost: ${expiration.text}`}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right side - Image */}
                        <div className="w-28 relative border-l border-dashed border-[rgba(255,138,0,0.2)]">
                          {userVoucher.voucher?.image_url ? (
                            <img
                              src={userVoucher.voucher.image_url}
                              alt={userVoucher.voucher?.name}
                              className={`w-full h-full object-cover ${expiration.isExpired ? 'opacity-50 grayscale' : ''}`}
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full bg-[hsl(220_30%_10%)] flex items-center justify-center">
                              <OneMilVoucherIcon size={48} className={`w-12 h-12 ${expiration.isExpired ? 'text-muted-foreground/30' : 'text-[rgba(255,138,0,0.4)]'}`} />
                            </div>
                          )}
                        </div>

                        {/* Purchase date indicator */}
                        <div className="absolute top-3 right-3 bg-[hsl(220_30%_8%/0.85)] backdrop-blur-sm text-foreground/80 text-xs px-2 py-1 rounded border border-[rgba(255,138,0,0.2)]">
                          {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
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

      {/* Redeem voucher modal: show code and instructions */}
      <Dialog open={!!redeemModalVoucher} onOpenChange={(open) => !open && setRedeemModalVoucher(null)}>
        <DialogContent className="sm:max-w-md border-[rgba(255,138,0,0.35)] bg-gradient-to-b from-[hsl(220_30%_8%)] to-[hsl(220_35%_5%)]">
          <DialogHeader>
            <DialogTitle className="text-heading-gold">Uplatnit voucher</DialogTitle>
            <DialogDescription>
              {redeemModalVoucher?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Při platbě u partnera zadejte nebo vložte tento kód:
            </p>
            <div className="rounded-xl bg-[hsl(220_30%_10%)] border border-[rgba(255,138,0,0.3)] p-4 text-center">
              <span className="font-mono text-xl font-bold text-[#FFB547] tracking-wider">
                {redeemModalVoucher?.code}
              </span>
            </div>
            <Button
              className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-[#111] font-bold"
              onClick={() => {
                if (redeemModalVoucher?.code) {
                  handleCopyVoucherCode(redeemModalVoucher.code);
                }
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Zkopírovat kód
            </Button>
          </div>
          <DialogFooter className="text-xs text-muted-foreground">
            Kód uplatněte u partnera v pokladně nebo při online nákupu.
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VoucherDetailDialog
        voucher={selectedVoucher}
        open={!!selectedVoucher}
        onOpenChange={(open) => !open && setSelectedVoucher(null)}
        onPurchase={handleVoucherPurchase}
        purchaseDisabled={isAdmin}
        purchaseLoading={purchasingId !== null}
      />

    </div>
  );
};

export default Vouchers;
