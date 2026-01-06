import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useHomepageVouchers } from "@/hooks/useHomepageVouchers";

import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { usePartners } from "@/hooks/usePartners";
import { useHomepageVideoSimple } from "@/hooks/useHomepageVideoSimple";
import { useLatestWinners } from "@/hooks/useLatestWinners";
import { useComingSoonBanners } from "@/hooks/useComingSoonBanners";
import { usePlacementBanners, PlacementKey } from "@/hooks/usePlacementBanners";
import { WinnerCard } from "@/components/WinnerCard";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { ContestCard } from "@/components/ContestCard";
import { Gift, Trophy, ChevronRight, Ticket, Star, ChevronLeft, Handshake, ExternalLink, Facebook, Twitter, Instagram } from "lucide-react";
import { toast } from "sonner";

interface Contest {
  id: string;
  title: string;
  main_prize: string;
  main_image: string | null;
  banner_image?: string | null;
  main_prize_secondary_image?: string | null;
  status: string;
  ticket_count: number;
  ticket_price: number;
  created_at: string;
}

const Homepage = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const { vouchers: homepageVouchers, loading: vouchersLoading, getRemainingCount } = useHomepageVouchers();
  
  const { banners: megajackpotBanners, loading: bannersLoading } = useMegajackpotBanners();
  const { voucherBanner, gamesBanner, loading: homepageBannersLoading } = useHomepageBanners();
  const { partners, loading: partnersLoading } = usePartners();
  const { videoUrl, isActive: isVideoActive, loading: videoLoading } = useHomepageVideoSimple();
  const { data: latestWinners, isLoading: winnersLoading } = useLatestWinners(50);
  const { banners: comingSoonBanners, loading: comingSoonLoading } = useComingSoonBanners();
  
  // Placement banners for MioCoin packages and action boxes
  const placementKeys: PlacementKey[] = ['miocoin_50', 'miocoin_310', 'miocoin_525', 'miocoin_1280', 'probihajici_souteze', 'koupit_voucher', 'vzhled_karta_vyher'];
  const { banners: placementBanners } = usePlacementBanners(placementKeys);
  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);
  const megajackpotCarouselRef = useRef<HTMLDivElement>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Fetch contests from database
  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from("contests")
        .select("id, title, main_prize, main_image, banner_image, main_prize_secondary_image, status, ticket_count, ticket_price, created_at")
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      setContests(data || []);
    } catch (error) {
      console.error("Error fetching contests:", error);
      toast.error("Nepodařilo se načíst soutěže");
    } finally {
      setLoading(false);
    }
  };

  // Fetch favorites from database
  const fetchFavorites = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_contest_favorites')
        .select('contest_id')
        .eq('user_id', user.id);

      if (error) throw error;
      
      setFavorites(new Set(data.map(f => f.contest_id)));
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const toggleFavorite = async (contestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Pro uložení oblíbených se musíte přihlásit');
      return;
    }

    const isFavorite = favorites.has(contestId);

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('user_contest_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('contest_id', contestId);

        if (error) throw error;

        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(contestId);
          return newSet;
        });
        toast.success('Odebráno z oblíbených');
      } else {
        const { error } = await supabase
          .from('user_contest_favorites')
          .insert({ user_id: user.id, contest_id: contestId });

        if (error) throw error;

        setFavorites(prev => new Set(prev).add(contestId));
        toast.success('Přidáno do oblíbených');
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error('Chyba při ukládání oblíbené');
    }
  };

  // Load contests on component mount
  useEffect(() => {
    fetchContests();
    if (user) {
      fetchFavorites();
    }
  }, [user]);

  // Subscribe to contest changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("contest-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contests" }, () => {
        fetchContests(); // Refresh contests when any contest changes
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Continuous auto-scroll for contests and vouchers (infinite loop)
  useEffect(() => {
    const startAutoScroll = (ref: React.RefObject<HTMLDivElement>, speed: number) => {
      const el = ref.current;
      if (!el) return;
      // Only start if there is something to scroll
      if (el.scrollWidth <= el.clientWidth + 8) return;

      let rafId = 0;
      let isPaused = false;

      const step = () => {
        if (!isPaused) {
          el.scrollLeft += speed;
          const half = el.scrollWidth / 2;
          
          // Handle wrapping for both directions
          if (speed > 0 && half > 0 && el.scrollLeft >= half) {
            // Scrolling right - wrap back to start
            el.scrollLeft -= half;
          } else if (speed < 0 && el.scrollLeft <= 0) {
            // Scrolling left - wrap to middle
            el.scrollLeft += half;
          }
        }
        
        rafId = requestAnimationFrame(step);
      };

      const handleMouseEnter = () => {
        isPaused = true;
      };

      const handleMouseLeave = () => {
        isPaused = false;
      };

      el.addEventListener('mouseenter', handleMouseEnter);
      el.addEventListener('mouseleave', handleMouseLeave);

      rafId = requestAnimationFrame(step);
      
      return () => {
        cancelAnimationFrame(rafId);
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
      };
    };

    const stopContests = startAutoScroll(contestsCarouselRef, 0.8);
    const stopVouchers = startAutoScroll(vouchersCarouselRef, -0.8);

    return () => {
      stopContests && stopContests();
      stopVouchers && stopVouchers();
    };
  }, [contests.length, homepageVouchers.length]);

  const handleContestClick = (contestId: string) => {
    if (!user) {
      toast.error("Pro hraní her se musíte přihlásit");
      navigate("/login");
      return;
    }

    if (isAdmin) {
      return; // Read-only for admin
    }

    // Navigate to main games page
    navigate("/games");
  };

  const handleVoucherPurchase = async (voucherId: string) => {
    if (!user) {
      toast.error("Pro koupi voucheru se musíte přihlásit");
      navigate("/login");
      return;
    }

    if (isAdmin) {
      return; // Read-only for admin
    }

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

      // Purchase voucher: create user_vouchers record and deduct 1 MC
      const { error: purchaseError } = await supabase
        .from('user_vouchers')
        .insert({
          user_id: user.id,
          voucher_id: voucherId,
          redeemed: false
        });

      if (purchaseError) {
        // Check if already purchased
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
    } catch (error) {
      console.error("Error purchasing voucher:", error);
      toast.error("Nepodařilo se zakoupit voucher");
    }
  };

  const [topUpLoading, setTopUpLoading] = useState(false);

  const handleCoinPurchase = async (priceInCzk: number, totalCoins: number) => {
    if (!user) {
      toast.error("Pro nákup MioCoinů se musíte přihlásit");
      navigate("/login");
      return;
    }

    if (topUpLoading) return; // Prevent double-clicks

    // Ensure clean numbers
    const cleanPrice = Number(priceInCzk);
    const cleanCoins = Number(totalCoins);

    if (isNaN(cleanPrice) || cleanPrice < 50) {
      toast.error("Neplatná částka");
      return;
    }

    setTopUpLoading(true);

    try {
      toast.loading("Otevírám platební bránu...", { id: "topup-loading" });
      
      // Wait for session to be ready
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user?.id) {
        toast.dismiss("topup-loading");
        toast.error("Nepodařilo se ověřit uživatele. Zkuste se znovu přihlásit.");
        setTopUpLoading(false);
        return;
      }
      
      console.log("Sending to Stripe:", { priceInCzk: cleanPrice, totalCoins: cleanCoins });
      
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
        body: { 
          priceInCzk: cleanPrice,
          totalCoins: cleanCoins
        },
      });

      if (error) throw error;
      
      if (data?.checkout_url) {
        // Redirect to Stripe - page will unload
        window.location.href = data.checkout_url;
        // Don't reset loading state as page is redirecting
      } else {
        throw new Error("Nepodařilo se získat platební odkaz");
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast.dismiss("topup-loading");
      toast.error("Nepodařilo se otevřít platební bránu");
      setTopUpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Megajackpot Banner Section */}
        <section className="w-full">
          {bannersLoading ? (
            // Loading placeholder
            <div className="h-48 md:h-56 bg-muted/30 animate-pulse rounded-lg" />
          ) : megajackpotBanners.length > 0 ? (
            // Banner display with carousel for multiple banners
            <>
              {/* Top golden line separator - thin, premium */}
              <div className="relative w-full overflow-hidden">
                <div 
                  className="h-[2px] max-w-[1300px] mx-auto"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 55%, 0.7) 5%, hsla(48, 85%, 60%, 0.9) 20%, hsla(50, 90%, 65%, 1) 50%, hsla(48, 85%, 60%, 0.9) 80%, hsla(45, 80%, 55%, 0.7) 95%, transparent 100%)'
                  }}
                />
              </div>
              
              <div className="relative">
                <div className="w-full max-w-[1920px] mx-auto h-[240px] md:h-[360px] lg:h-[480px] relative overflow-hidden rounded-lg bg-[hsl(220_30%_6%)]">
                  {/* Banner image - designed for 1920x480px (4:1 ratio) */}
                  <img
                    src={megajackpotBanners[currentBannerIndex]?.image_url}
                    alt={megajackpotBanners[currentBannerIndex]?.title || "Banner"}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Horizontal golden light gradient - centered, fading up and down */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(to bottom, transparent 0%, transparent 30%, hsla(45, 65%, 60%, 0.25) 42%, hsla(45, 70%, 65%, 0.4) 50%, hsla(45, 65%, 60%, 0.25) 58%, transparent 70%, transparent 100%)'
                    }}
                  />

                {/* Navigation arrows for multiple banners */}
                {megajackpotBanners.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 bg-background/20 backdrop-blur-sm hover:bg-background/40"
                      onClick={() =>
                        setCurrentBannerIndex((prev) => (prev === 0 ? megajackpotBanners.length - 1 : prev - 1))
                      }
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 bg-background/20 backdrop-blur-sm hover:bg-background/40"
                      onClick={() =>
                        setCurrentBannerIndex((prev) => (prev === megajackpotBanners.length - 1 ? 0 : prev + 1))
                      }
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}
                </div>

                {/* Dot indicators for multiple banners */}
                {megajackpotBanners.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {megajackpotBanners.map((_, index) => (
                      <button
                        key={index}
                        className={`w-3 h-3 rounded-full transition-all duration-200 ${
                          index === currentBannerIndex
                            ? "bg-primary shadow-lg"
                            : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                        }`}
                        onClick={() => setCurrentBannerIndex(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Bottom golden line separator - premium, animated */}
              <div className="relative w-full overflow-hidden py-3 mt-2">
                {/* Animated outer glow */}
                <div 
                  className="absolute inset-0 max-w-[1300px] mx-auto left-0 right-0 animate-golden-pulse"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 50%, 0.15) 10%, hsla(48, 85%, 55%, 0.25) 30%, hsla(50, 90%, 60%, 0.3) 50%, hsla(48, 85%, 55%, 0.25) 70%, hsla(45, 80%, 50%, 0.15) 90%, transparent 100%)',
                    filter: 'blur(8px)'
                  }}
                />
                {/* Sharp line layer with shimmer */}
                <div 
                  className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, hsla(45, 75%, 50%, 0.6) 3%, hsla(48, 85%, 60%, 0.9) 15%, hsla(50, 95%, 70%, 1) 50%, hsla(48, 85%, 60%, 0.9) 85%, hsla(45, 75%, 50%, 0.6) 97%, transparent 100%)'
                  }}
                >
                  {/* Shimmer overlay */}
                  <div 
                    className="absolute inset-0 animate-golden-shimmer"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, transparent 40%, hsla(50, 100%, 90%, 0.4) 50%, transparent 60%, transparent 100%)',
                      backgroundSize: '200% 100%'
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}
        </section>

        {/* Coin Top-up Section */}
        <section className="w-full overflow-x-hidden grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column - Dobijte si MioCoiny */}
          <Card className="rounded-xl overflow-hidden bg-[hsl(220_45%_6%)] border border-amber-300/20 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full">
            <CardContent className="p-5 h-full flex flex-col">
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-heading-gold flex items-center gap-2">
                    <Gift className="w-6 h-6 md:w-7 md:h-7" />
                    Dobijte si MioCoiny
                  </h2>
                  <p className="text-sm text-text-silver">Dobíjejte si MioCoiny pro otevření voucherů nebo účasti ve hře.</p>
                </div>

                {/* Coin Packages Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                  {/* Package 50 Kč → 50 MC */}
                  <div className="rounded-xl py-3 px-3 w-full min-h-[140px] bg-[hsl(220_45%_6%)] border-2 border-package-blue/30 flex flex-col items-center justify-between shadow-[inset_0_1px_12px_hsl(var(--package-blue)/0.08)] relative overflow-hidden">
                    {/* BannerLayer */}
                    <div className="absolute inset-0 z-0 pointer-events-none">
                      {placementBanners.miocoin_50?.image_url && (
                        <img
                          src={placementBanners.miocoin_50.image_url}
                          alt="MioCoin 50"
                          className="w-full h-full object-contain object-center"
                        />
                      )}
                    </div>

                    {/* ContentLayer */}
                    <div className="relative z-10 flex flex-col items-center justify-between w-full h-full">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-package-blue drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">50</div>
                        <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                        <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">50 Kč</div>
                      </div>
                      <Button 
                        size="sm" 
                        className="w-full mt-2 bg-package-blue text-black font-bold shadow-[0_0_10px_hsl(var(--package-blue)/0.3)] hover:brightness-110 transition-all duration-200"
                        onClick={() => handleCoinPurchase(50, 50)}
                        disabled={topUpLoading}
                      >
                        {topUpLoading ? "..." : "Dobít"}
                      </Button>
                    </div>
                  </div>

                  {/* Package 300 Kč → 310 MC (+10 Bonus) */}
                  <div className="relative z-20 overflow-visible h-full">
                    <Badge className="absolute -top-2 -right-2 bg-package-gold/90 text-black text-xs font-medium z-50 pointer-events-none">+10 Bonus</Badge>
                    <div className="rounded-xl py-3 px-3 w-full h-full min-h-[140px] bg-[hsl(220_45%_6%)] border-2 border-package-gold/30 flex flex-col items-center justify-between relative shadow-[inset_0_1px_12px_hsl(var(--package-gold)/0.08)] overflow-hidden">
                      {/* BannerLayer */}
                      <div className="absolute inset-0 z-0 pointer-events-none">
                        {placementBanners.miocoin_310?.image_url && (
                          <img
                            src={placementBanners.miocoin_310.image_url}
                            alt="MioCoin 310"
                            className="w-full h-full object-contain object-center"
                          />
                        )}
                      </div>

                      {/* ContentLayer */}
                      <div className="relative z-10 flex flex-col items-center justify-between w-full h-full">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-package-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">310</div>
                          <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                          <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">300 Kč</div>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full mt-2 bg-package-gold text-black font-bold shadow-[0_0_10px_hsl(var(--package-gold)/0.3)] hover:brightness-110 transition-all duration-200"
                          onClick={() => handleCoinPurchase(300, 310)}
                          disabled={topUpLoading}
                        >
                          {topUpLoading ? "..." : "Dobít"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Package 500 Kč → 525 MC (+25 Bonus) */}
                  <div className="relative z-20 overflow-visible h-full">
                    <Badge className="absolute -top-2 -right-2 bg-package-purple/90 text-white text-xs font-medium z-50 pointer-events-none">+25 Bonus</Badge>
                    <div className="rounded-xl py-3 px-3 w-full h-full min-h-[140px] bg-[hsl(220_45%_6%)] border-2 border-package-purple/30 flex flex-col items-center justify-between relative shadow-[inset_0_1px_12px_hsl(var(--package-purple)/0.08)] overflow-hidden">
                      {/* BannerLayer */}
                      <div className="absolute inset-0 z-0 pointer-events-none">
                        {placementBanners.miocoin_525?.image_url && (
                          <img
                            src={placementBanners.miocoin_525.image_url}
                            alt="MioCoin 525"
                            className="w-full h-full object-contain object-center"
                          />
                        )}
                      </div>

                      {/* ContentLayer */}
                      <div className="relative z-10 flex flex-col items-center justify-between w-full h-full">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-package-purple drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">525</div>
                          <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                          <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">500 Kč</div>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full mt-2 bg-package-purple text-white font-bold shadow-[0_0_10px_hsl(var(--package-purple)/0.3)] hover:brightness-110 transition-all duration-200"
                          onClick={() => handleCoinPurchase(500, 525)}
                          disabled={topUpLoading}
                        >
                          {topUpLoading ? "..." : "Dobít"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Package 1200 Kč → 1280 MC (+80 Bonus) */}
                  <div className="relative z-20 overflow-visible h-full">
                    <Badge className="absolute -top-2 -right-2 bg-package-green/90 text-white text-xs font-medium z-50 pointer-events-none">+80 Bonus</Badge>
                    <div className="rounded-xl py-3 px-3 w-full h-full min-h-[140px] bg-[hsl(220_45%_6%)] border-2 border-package-green/30 flex flex-col items-center justify-between relative shadow-[inset_0_1px_12px_hsl(var(--package-green)/0.08)] overflow-hidden">
                      {/* BannerLayer */}
                      <div className="absolute inset-0 z-0 pointer-events-none">
                        {placementBanners.miocoin_1280?.image_url && (
                          <img
                            src={placementBanners.miocoin_1280.image_url}
                            alt="MioCoin 1280"
                            className="w-full h-full object-contain object-center"
                          />
                        )}
                      </div>

                      {/* ContentLayer */}
                      <div className="relative z-10 flex flex-col items-center justify-between w-full h-full">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-package-green drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">1280</div>
                          <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                          <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">1200 Kč</div>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full mt-2 bg-package-green text-white font-bold shadow-[0_0_10px_hsl(var(--package-green)/0.3)] hover:brightness-110 transition-all duration-200"
                          onClick={() => handleCoinPurchase(1200, 1280)}
                          disabled={topUpLoading}
                        >
                          {topUpLoading ? "..." : "Dobít"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Two Boxes Below */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  {/* Box 1: Probíhající soutěže */}
                  <div 
                    className="rounded-xl p-4 bg-[hsl(220_45%_6%)] border-2 border-amber-400/30 cursor-pointer hover:border-amber-400/50 transition-all duration-200 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_12px_hsl(40_60%_50%/0.06)] relative overflow-hidden"
                    onClick={() => navigate("/games")}
                  >
                    {placementBanners.probihajici_souteze?.image_url && (
                      <img 
                        src={placementBanners.probihajici_souteze.image_url} 
                        alt="Probíhající soutěže" 
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    <Trophy className="w-8 h-8 text-amber-400 mb-2 relative z-10" />
                    <div className="text-sm font-semibold text-foreground relative z-10">Probíhající soutěže</div>
                  </div>

                  {/* Box 2: Koupit voucher se slevou */}
                  <div 
                    className="rounded-xl p-4 bg-[hsl(220_45%_6%)] border-2 border-rose-400/30 cursor-pointer hover:border-rose-400/50 transition-all duration-200 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_12px_hsl(350_60%_50%/0.06)] relative overflow-hidden"
                    onClick={() => navigate("/vouchers")}
                  >
                    {placementBanners.koupit_voucher?.image_url && (
                      <img 
                        src={placementBanners.koupit_voucher.image_url} 
                        alt="Koupit voucher se slevou" 
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    <Gift className="w-8 h-8 text-rose-400 mb-2 relative z-10" />
                    <div className="text-sm font-semibold text-foreground relative z-10">Koupit voucher se slevou</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Poslední výherci */}
          <Card className="rounded-xl overflow-hidden bg-[hsl(220_45%_6%)] border border-amber-300/20 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full">
            <CardContent className="p-5 h-full flex flex-col">
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-heading-gold flex items-center gap-2">
                    <Trophy className="w-6 h-6 md:w-7 md:h-7" />
                    Poslední výherci
                  </h2>
                  <p className="text-sm text-text-silver">Nejnovější výhry z našich soutěží</p>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto">
                  {winnersLoading ? (
                    // Loading placeholders
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="rounded-xl overflow-hidden bg-card/60 border border-border/50 p-4">
                        <div className="flex gap-4">
                          <div className="w-16 h-16 bg-muted/40 animate-pulse rounded-full flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-muted/60 rounded animate-pulse" />
                            <div className="h-4 bg-muted/40 rounded animate-pulse w-3/4" />
                            <div className="h-3 bg-muted/30 rounded animate-pulse w-1/2" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : !latestWinners || latestWinners.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <Trophy className="w-12 h-12 mx-auto text-muted-foreground/50" />
                      <h3 className="text-lg font-bold text-foreground">Zatím žádní výherci</h3>
                      <p className="text-sm text-muted-foreground">Momentálně nejsou k dispozici žádné výhry</p>
                    </div>
                  ) : (
                    latestWinners
                      .slice(0, 3)
                      .map((winner) => (
                        <WinnerCard
                          key={winner.id}
                          userName={winner.user_name}
                          userNickname={winner.user_nickname}
                          prizeName={winner.prize_name}
                          contestTitle={winner.contest_title}
                          createdAt={winner.created_at}
                          type={winner.type}
                          prizeImageUrl={winner.prize_image_url}
                          cardStyleImageUrl={placementBanners.vzhled_karta_vyher?.image_url || null}
                        />
                      ))
                  )}
                </div>

                <Button variant="ghost" size="lg" className="w-full gap-2 mt-2 text-muted-foreground hover:text-foreground hover:bg-muted/30" onClick={() => navigate("/winners")}>
                  Zobrazit všechny
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
        
        {/* Golden separator line - premium, animated */}
        <div className="relative w-full overflow-hidden py-3">
          {/* Animated outer glow */}
          <div 
            className="absolute inset-0 max-w-[1300px] mx-auto left-0 right-0 animate-golden-pulse"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 50%, 0.15) 10%, hsla(48, 85%, 55%, 0.25) 30%, hsla(50, 90%, 60%, 0.3) 50%, hsla(48, 85%, 55%, 0.25) 70%, hsla(45, 80%, 50%, 0.15) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 75%, 50%, 0.6) 3%, hsla(48, 85%, 60%, 0.9) 15%, hsla(50, 95%, 70%, 1) 50%, hsla(48, 85%, 60%, 0.9) 85%, hsla(45, 75%, 50%, 0.6) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, hsla(50, 100%, 90%, 0.4) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '200% 100%'
              }}
            />
          </div>
        </div>

        {/* Dynamic Banners */}
        {(voucherBanner || gamesBanner) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Voucher Banner */}
            {voucherBanner && (
              <div
                className={`relative rounded-lg overflow-hidden transition-all duration-200 ${
                  user && !isAdmin ? "cursor-pointer hover:scale-105" : ""
                }`}
                onClick={() => !isAdmin && navigate("/vouchers")}
              >
                <img
                  src={voucherBanner.image_url}
                  alt={voucherBanner.title}
                  className="w-full h-64 md:h-80 object-cover"
                />
                {isAdmin && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                    Pouze čtení
                  </div>
                )}
              </div>
            )}

            {/* Games Banner */}
            {gamesBanner && (
              <div
                className={`relative rounded-lg overflow-hidden transition-all duration-200 ${
                  user && !isAdmin ? "cursor-pointer hover:scale-105" : ""
                }`}
                onClick={() => !isAdmin && navigate("/games")}
              >
                <img src={gamesBanner.image_url} alt={gamesBanner.title} className="w-full h-64 md:h-80 object-cover" />
                {isAdmin && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                    Pouze čtení
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        
        {/* Golden separator line - premium, animated */}
        <div className="relative w-full overflow-hidden py-3">
          {/* Animated outer glow */}
          <div 
            className="absolute inset-0 max-w-[1300px] mx-auto left-0 right-0 animate-golden-pulse"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 50%, 0.15) 10%, hsla(48, 85%, 55%, 0.25) 30%, hsla(50, 90%, 60%, 0.3) 50%, hsla(48, 85%, 55%, 0.25) 70%, hsla(45, 80%, 50%, 0.15) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 75%, 50%, 0.6) 3%, hsla(48, 85%, 60%, 0.9) 15%, hsla(50, 95%, 70%, 1) 50%, hsla(48, 85%, 60%, 0.9) 85%, hsla(45, 75%, 50%, 0.6) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, hsla(50, 100%, 90%, 0.4) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '200% 100%'
              }}
            />
          </div>
        </div>

        {/* Ongoing Contests Carousel */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-heading-gold flex items-center gap-2">
              <Ticket className="w-6 h-6" />
              Probíhající Soutěže
            </h3>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
              {/* Role indicator */}
              {isAdmin && (
                <div className="px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                  Pouze čtení
                </div>
              )}
              {!user && (
                <div className="px-2 py-1 bg-blue-100/10 border border-blue-400/30 rounded text-xs text-blue-400">
                  Přihlásit pro interakci
                </div>
              )}
            </div>
          </div>

          <div
            ref={contestsCarouselRef}
            data-carousel-content
            className={`flex overflow-x-auto scroll-smooth gap-4 pb-4 ${isAdmin ? "carousel-disabled" : ""}`}
            style={{
              scrollBehavior: "smooth",
              scrollSnapType: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {loading ? (
              // Skeleton placeholders matching ContestCard design
              Array(3).fill(0).map((_, index) => (
                <div key={`skeleton-${index}`} className="flex-shrink-0 w-[280px] md:w-[320px]">
                  <div className="contest-card rounded-2xl overflow-hidden relative">
                    {/* Skeleton image area - matches h-64 from ContestCard */}
                    <div className="w-full h-64 bg-muted/40 animate-pulse" />
                    
                    {/* Dark gradient overlay - same as ContestCard */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                    
                    {/* Skeleton badge - top right position */}
                    <div className="absolute top-3 right-3">
                      <div className="h-6 w-16 bg-muted/60 rounded-full animate-pulse" />
                    </div>
                    
                    {/* Skeleton content - bottom area matching ContestCard layout */}
                    <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
                      {/* Title skeleton */}
                      <div className="h-5 bg-white/20 rounded animate-pulse w-3/4" />
                      {/* Prize skeleton */}
                      <div className="h-4 bg-white/15 rounded animate-pulse w-1/2" />
                      {/* Buttons skeleton */}
                      <div className="flex gap-2 mt-2">
                        <div className="flex-1 h-10 bg-primary/30 rounded-lg animate-pulse" />
                        <div className="h-10 w-16 bg-white/10 rounded-lg animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : contests.length === 0 ? (
              // No contests message
              <div className="flex-none w-72">
                <Card className="coupon-card border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-amber-800 dark:text-amber-400">
                      Žádné aktivní soutěže
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-amber-600 dark:text-amber-500">
                      Momentálně nejsou k dispozici žádné aktivní soutěže
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              contests.map((contest) => (
                <ContestCard
                  key={contest.id}
                  contest={contest}
                  user={user}
                  isAdmin={isAdmin}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onPlay={handleContestClick}
                  fromPage="homepage"
                  className="flex-shrink-0 w-[280px] md:w-[320px]"
                />
              ))
            )}
          </div>
        </section>
        
        {/* Golden separator line - premium, animated */}
        <div className="relative w-full overflow-hidden py-3">
          {/* Animated outer glow */}
          <div 
            className="absolute inset-0 max-w-[1300px] mx-auto left-0 right-0 animate-golden-pulse"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 50%, 0.15) 10%, hsla(48, 85%, 55%, 0.25) 30%, hsla(50, 90%, 60%, 0.3) 50%, hsla(48, 85%, 55%, 0.25) 70%, hsla(45, 80%, 50%, 0.15) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 75%, 50%, 0.6) 3%, hsla(48, 85%, 60%, 0.9) 15%, hsla(50, 95%, 70%, 1) 50%, hsla(48, 85%, 60%, 0.9) 85%, hsla(45, 75%, 50%, 0.6) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, hsla(50, 100%, 90%, 0.4) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '200% 100%'
              }}
            />
          </div>
        </div>

        {/* Available Vouchers Section - Visible to everyone */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-heading-gold flex items-center gap-2">
              <Gift className="w-6 h-6" />
              Dostupné vouchery
            </h3>
            <div className="flex items-center gap-2">
              {user && !isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/vouchers")}
                  className="text-xs"
                >
                  Moje vouchery
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
              {isAdmin && (
                <div className="px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                  Pouze čtení
                </div>
              )}
            </div>
          </div>

          <div
            ref={vouchersCarouselRef}
            className="flex overflow-x-scroll no-scrollbar snap-x snap-mandatory gap-4 pb-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {vouchersLoading ? (
              // Loading placeholder
              <div className="flex-none w-80">
                <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40 h-full">
                  <CardContent className="p-6 space-y-4">
                    <div className="h-6 bg-muted rounded animate-pulse mb-2" />
                    <div className="h-4 bg-muted/70 rounded animate-pulse w-24" />
                    <div className="h-12 bg-muted rounded animate-pulse mb-4" />
                    <div className="h-10 bg-muted/80 rounded animate-pulse" />
                  </CardContent>
                </Card>
              </div>
            ) : homepageVouchers.length === 0 ? (
              // No vouchers message
              <div className="flex-none w-80">
                <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40 h-full">
                  <CardContent className="p-6 space-y-2 text-center">
                    <h3 className="text-xl font-bold text-primary">Žádné dostupné vouchery</h3>
                    <div className="text-sm text-muted-foreground">
                      Momentálně nejsou k dispozici žádné veřejné vouchery.
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              homepageVouchers.map((voucher) => (
                  <div key={voucher.id} className="flex-none w-80">
                  <Card className="relative overflow-hidden rounded-xl bg-[hsl(220_45%_6%)] border-2 border-border/40 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-all duration-200 hover:border-border/60">
                    <div className="flex h-48 relative">
                      {/* Left side - Content */}
                      <div className="flex-1 p-5 flex flex-col justify-between">
                        {/* Header */}
                        <div>
                          <h2 className="text-foreground font-bold text-xl tracking-wide mb-1">ONEMIL VOUCHER</h2>
                          <p className="text-muted-foreground text-sm font-medium">HRAJ O CENY</p>
                        </div>

                        {/* Voucher name */}
                        <div className="my-3">
                          <h3 className="text-foreground font-bold text-lg mb-2">{voucher.name}</h3>
                          <div className="text-primary font-bold text-2xl">1 MioCoin</div>
                        </div>

                        {/* Button */}
                        <div className="space-y-2">
                          <Button
                            className="w-full bg-primary text-primary-foreground font-bold shadow-[0_0_12px_hsl(var(--primary)/0.35)] hover:brightness-110 transition-all duration-200"
                            disabled={isAdmin}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user) {
                                navigate("/login");
                              } else if (!isAdmin) {
                                handleVoucherPurchase(voucher.id);
                              }
                            }}
                          >
                            {!user ? "PŘIHLÁSIT SE" : "KOUPIT ZA 1 MC"}
                          </Button>

                          {/* Status indicator */}
                          <div className="text-xs text-muted-foreground">
                            {user && !isAdmin
                              ? "Klikněte pro nákup"
                              : !user
                                ? "Přihlaste se pro nákup"
                                : "Admin zobrazení - pouze pro čtení"}
                          </div>
                        </div>
                      </div>

                      {/* Right side - Image */}
                      <div className="w-32 relative border-l border-dashed border-border/50">
                        {voucher.image_url ? (
                          <img
                            src={voucher.image_url}
                            alt={voucher.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted/40 flex items-center justify-center">
                            <span className="text-muted-foreground text-sm text-center px-2">VOUCHER</span>
                          </div>
                        )}
                      </div>

                      {/* Remaining count indicator */}
                      <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm text-foreground text-xs px-2 py-1 rounded border border-border">
                        Zbývá: {getRemainingCount(voucher)}
                      </div>
                    </div>
                  </Card>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Golden separator line - premium, animated */}
        <div className="relative w-full overflow-hidden py-3">
          {/* Animated outer glow */}
          <div 
            className="absolute inset-0 max-w-[1300px] mx-auto left-0 right-0 animate-golden-pulse"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 50%, 0.15) 10%, hsla(48, 85%, 55%, 0.25) 30%, hsla(50, 90%, 60%, 0.3) 50%, hsla(48, 85%, 55%, 0.25) 70%, hsla(45, 80%, 50%, 0.15) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 75%, 50%, 0.6) 3%, hsla(48, 85%, 60%, 0.9) 15%, hsla(50, 95%, 70%, 1) 50%, hsla(48, 85%, 60%, 0.9) 85%, hsla(45, 75%, 50%, 0.6) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, hsla(50, 100%, 90%, 0.4) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '200% 100%'
              }}
            />
          </div>
        </div>

        {/* Partners Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-heading-gold flex items-center gap-2">
              <Handshake className="w-6 h-6" />
              Naši partneři, kde můžete získat MioCoiny za nákup
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {partnersLoading ? (
              // Loading placeholder
              Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-square bg-muted rounded-lg animate-pulse" />
              ))
            ) : partners.length === 0 ? (
              // No partners message
              <div className="col-span-full text-center py-12">
                <div className="text-muted-foreground">Momentálně nejsou k dispozici žádní partneři</div>
              </div>
            ) : (
              partners.map((partner) => (
                <div
                  key={partner.id}
                  className="aspect-square bg-[hsl(220_45%_6%)] border-2 border-border/40 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:border-primary/50 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] group"
                  onClick={() => window.open(partner.website_url, "_blank")}
                >
                  <div className="w-full h-full p-5 flex items-center justify-center relative">
                    <img
                      src={partner.logo_url}
                      alt={partner.name}
                      className="max-w-full max-h-full object-contain transition-all duration-300 group-hover:scale-110"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = "flex";
                        }
                      }}
                    />
                    <div className="hidden w-full h-full flex-col items-center justify-center text-muted-foreground">
                      <span className="text-xs text-center">{partner.name}</span>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <ExternalLink className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        
        {/* Golden separator line - premium, animated */}
        <div className="relative w-full overflow-hidden py-3">
          {/* Animated outer glow */}
          <div 
            className="absolute inset-0 max-w-[1300px] mx-auto left-0 right-0 animate-golden-pulse"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 80%, 50%, 0.15) 10%, hsla(48, 85%, 55%, 0.25) 30%, hsla(50, 90%, 60%, 0.3) 50%, hsla(48, 85%, 55%, 0.25) 70%, hsla(45, 80%, 50%, 0.15) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsla(45, 75%, 50%, 0.6) 3%, hsla(48, 85%, 60%, 0.9) 15%, hsla(50, 95%, 70%, 1) 50%, hsla(48, 85%, 60%, 0.9) 85%, hsla(45, 75%, 50%, 0.6) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, hsla(50, 100%, 90%, 0.4) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '200% 100%'
              }}
            />
          </div>
        </div>

        {/* Coming Soon Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-heading-gold flex items-center gap-2">
              Připravujeme
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {comingSoonLoading ? (
              // Loading placeholder
              Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="relative overflow-hidden rounded-xl bg-[hsl(220_45%_6%)] border-2 border-border/40 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)]">
                  <CardContent className="p-0">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted/20 animate-pulse" />
                  </CardContent>
                </Card>
              ))
            ) : comingSoonBanners.length === 0 ? (
              // Placeholder cards when empty
              Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="relative overflow-hidden rounded-xl bg-[hsl(220_45%_6%)] border-2 border-border/40 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)]">
                  <CardContent className="p-0">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted/20 flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <span className="text-sm">Připravujeme</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              comingSoonBanners.map((banner) => (
                <Card key={banner.id} className="relative overflow-hidden rounded-xl bg-[hsl(220_45%_6%)] border-2 border-border/40 shadow-[0_4px_16px_hsl(222_50%_3%/0.5)]">
                  <CardContent className="p-0">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted/40">
                      <img
                        src={banner.image_url}
                        alt={banner.title || 'Coming soon'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {banner.title && (
                      <div className="p-5">
                        <h4 className="font-bold text-lg text-foreground text-center">{banner.title}</h4>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Instructional Video Section */}
        {!videoLoading && videoUrl && isVideoActive && (
          <section className="space-y-6 mt-16">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-heading-gold flex items-center gap-2">
                🎬 Jak to funguje
              </h3>
            </div>

            <div className="max-w-4xl mx-auto space-y-8">
              <YouTubeEmbed url={videoUrl} className="rounded-xl" />

              <div className="text-center space-y-6">
                <h4 className="text-xl sm:text-2xl font-semibold text-foreground leading-snug">
                  Jak hra funguje, co se vyhrává a jak probíhá nákup voucherů
                </h4>
                <div className="space-y-3 max-w-2xl mx-auto text-left">
                  <p className="text-base text-muted-foreground leading-relaxed">
                    🎯 <strong className="text-foreground">Kupte tikety</strong> do soutěží o luxusní ceny za pouhý 1 MioCoin
                  </p>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    🏆 <strong className="text-foreground">Vyhrajte hlavní ceny</strong> jako jsou auta, dovolené nebo elektronika
                  </p>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    🎁 <strong className="text-foreground">Získejte bonusové výhry</strong> na každé 100. pozici tiketu
                  </p>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    💳 <strong className="text-foreground">Nakupte vouchery</strong> u našich partnerů a získejte MioCoiny za každý nákup
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Enhanced Footer */}
        <footer className="mt-20 pt-10 bg-[hsl(220_50%_5%)]">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-10">
              {/* Company Info */}
              <div className="space-y-4">
                <h4 className="font-bold text-lg text-foreground">OneMil</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Vaše platforma pro soutěže a výhry. Získejte šanci vyhrát luxusní ceny a vouchery.
                </p>
                <div className="flex space-x-3 pt-2">
                  <a href="#" className="w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors">
                    <Facebook className="w-4 h-4 text-neon-gold" />
                  </a>
                  <a href="#" className="w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors">
                    <Twitter className="w-4 h-4 text-neon-gold" />
                  </a>
                  <a href="#" className="w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors">
                    <Instagram className="w-4 h-4 text-neon-gold" />
                  </a>
                </div>
              </div>

              {/* Information Links */}
              <div className="space-y-4">
                <h4 className="font-semibold text-base text-foreground">Informace</h4>
                <ul className="space-y-2.5 text-sm">
                  <li>
                    <Link to="/info/o-spolecnosti" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      O společnosti
                    </Link>
                  </li>
                  <li>
                    <Link to="/info/jak-to-funguje" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Jak to funguje
                    </Link>
                  </li>
                  <li>
                    <Link to="/info/nase-mise" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Naše mise
                    </Link>
                  </li>
                </ul>
              </div>

              {/* FAQ & Support */}
              <div className="space-y-4">
                <h4 className="font-semibold text-base text-foreground">Podpora</h4>
                <ul className="space-y-2.5 text-sm">
                  <li>
                    <Link to="/support/faq" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Často kladené otázky
                    </Link>
                  </li>
                  <li>
                    <Link to="/support/napoveda" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Centrum nápovědy
                    </Link>
                  </li>
                  <li>
                    <Link to="/support/kontakt" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Kontaktujte nás
                    </Link>
                  </li>
                  <li>
                    <Link to="/support/nahlasit-problem" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Nahlásit problém
                    </Link>
                  </li>
                  <li>
                    <Link to="/support/zivy-chat" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Živý chat
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Legal Terms */}
              <div className="space-y-4">
                <h4 className="font-semibold text-base text-foreground">Právní podmínky</h4>
                <ul className="space-y-2.5 text-sm">
                  <li>
                    <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Obchodní podmínky
                    </Link>
                  </li>
                  <li>
                    <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Zásady ochrany osobních údajů
                    </Link>
                  </li>
                  <li>
                    <Link to="/legal/pravidla-soutezi" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Pravidla soutěží
                    </Link>
                  </li>
                  <li>
                    <Link to="/legal/cookies" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Zásady použití cookies
                    </Link>
                  </li>
                  <li>
                    <Link to="/legal/autorska-prava" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Autorská práva
                    </Link>
                  </li>
                  <li>
                    <Link to="/delete-account" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                      Smazání účtu
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Company Info - Provozovatel */}
          <div className="border-t border-border/40 py-6 px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-1.5 text-sm text-muted-foreground">
              <p className="font-semibold text-heading-gold">Provozovatel: iCONIC POINT s.r.o.</p>
              <p>IČO: 177 95 851 | Sídlo: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2</p>
              <p>Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856</p>
              <p>
                <span className="font-medium text-foreground">Jednatel:</span> Pavel Diviš | 
                <span className="font-medium text-foreground"> E-mail:</span> <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a> | 
                <span className="font-medium text-foreground"> Tel:</span> <a href="tel:+420776532562" className="text-primary hover:underline">+420 776 532 562</a>
              </p>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-border/40 py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="text-sm text-muted-foreground">© 2024 iCONIC POINT s.r.o. Všechna práva vyhrazena.</div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link to="/kontakt" className="hover:text-primary transition-colors">Kontakt</Link>
                <span className="text-border">•</span>
                <span>Česká republika</span>
                <span className="text-border">•</span>
                <span>
                  {isAdmin && "Admin režim"}
                  {!isAdmin && user && "Přihlášený uživatel"}
                  {!user && "Návštěvník"}
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Show admin menu or regular bottom navigation */}
      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Homepage;
