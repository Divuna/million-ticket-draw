import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { buildLoginRedirectUrl } from "@/lib/loginRedirect";
import { setPendingPaymentSuccessContext } from "@/lib/paymentSuccessContext";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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
import { Trophy, ChevronRight, Ticket, Star, ChevronLeft, Handshake, ExternalLink, X } from "lucide-react";
import { OneMilMioCoinIcon, OneMilVoucherIcon, OneMilInfoIcon, OneMilTrophyIcon } from "@/components/icons/OneMilIcons";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import { logMonitoringEvent, logStripeCheckoutClientFailure } from "@/lib/monitoring";
import { analytics } from "@/lib/analytics";

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
  fast_game?: boolean;
}

const Homepage = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [infoPopup, setInfoPopup] = useState<{ title: string | null; description: string } | null>(null);

  // Fetch contests from database
  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from("contests")
        .select("id, title, main_prize, main_image, banner_image, main_prize_secondary_image, status, ticket_count, ticket_price, created_at, fast_game")
        .in("status", ["active", "pending", "paused"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      const contestRows = data || [];
      setContests(contestRows);
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
      navigate(buildLoginRedirectUrl(location.pathname + location.search));
      return;
    }


    // Navigate to main games page
    navigate("/games");
  };

  const handleVoucherPurchase = async (voucherId: string) => {
    if (!user) {
      toast.error("Pro koupi voucheru se musíte přihlásit");
      navigate(buildLoginRedirectUrl(location.pathname + location.search));
      return;
    }


    try {
      await supabase.rpc('ensure_wallet_exists', { p_user_id: user.id });

      const { data, error } = await supabase.rpc('buy_voucher_atomic', {
        p_user_id: user.id,
        p_voucher_id: voucherId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        toast.error(result.error || "Nepodařilo se zakoupit voucher");
        return;
      }

      analytics.voucherRedeem(voucherId, 5);
      toast.success("Voucher úspěšně zakoupen za 5 MioCoinů!");
    } catch (error) {
      console.error("Error purchasing voucher:", error);
      toast.error("Nepodařilo se zakoupit voucher");
    }
  };

  const [topUpLoading, setTopUpLoading] = useState(false);

  const handleCoinPurchase = async (priceInCzk: number, totalCoins: number) => {
    if (!user) {
      toast.error("Pro nákup MioCoinů se musíte přihlásit");
      navigate(buildLoginRedirectUrl(location.pathname + location.search));
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
        logMonitoringEvent("warn", "stripe_checkout_no_session", {
          user_id: user?.id ?? null,
          action: "create_stripe_checkout",
          price_czk: cleanPrice,
        });
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
        setPendingPaymentSuccessContext({ kind: "miocoin" });
        // Redirect to Stripe - page will unload
        window.location.href = data.checkout_url;
        // Don't reset loading state as page is redirecting
      } else {
        throw new Error("Nepodařilo se získat platební odkaz");
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      if (user) {
        const phase =
          error instanceof Error && error.message.includes("platební odkaz")
            ? "response"
            : "invoke";
        logStripeCheckoutClientFailure({
          userId: user.id,
          priceInCzk: cleanPrice,
          error,
          phase,
        });
      }
      toast.dismiss("topup-loading");
      toast.error("Nepodařilo se otevřít platební bránu");
      setTopUpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      {/* Hero banner — full viewport width, outside container */}
      <section className="w-full">
        {bannersLoading ? (
          <div className="w-full h-[120px] sm:aspect-[16/5] sm:max-h-[600px] sm:min-h-[160px] sm:h-auto bg-muted/30 animate-pulse" />
        ) : megajackpotBanners.length > 0 ? (
          <>
            {/* Top golden line separator */}
            <div className="relative w-full overflow-hidden">
              <div
                className="h-[2px]"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.5) 5%, rgba(255,138,0,0.8) 20%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.8) 80%, rgba(255,138,0,0.5) 95%, transparent 100%)'
                }}
              />
            </div>

            <div className="relative">
              <div className="w-full sm:aspect-[16/5] sm:max-h-[600px] sm:min-h-[160px] relative overflow-hidden bg-[hsl(220_30%_6%)]">
                {/* Banner image — mobile: natural height (no bars); sm+: object-cover fills 16:5 frame */}
                <img
                  src={megajackpotBanners[currentBannerIndex]?.image_url}
                  alt={megajackpotBanners[currentBannerIndex]?.title || "Banner"}
                  className="w-full h-auto block sm:h-full sm:object-cover sm:object-center"
                />
                  
                  {/* Horizontal golden light gradient - centered, fading up and down */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(255,138,0,0.1) 42%, rgba(255,181,71,0.18) 50%, rgba(255,138,0,0.1) 58%, transparent 70%, transparent 100%)'
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
                className="absolute inset-0 animate-golden-pulse"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.1) 10%, rgba(255,138,0,0.18) 30%, rgba(255,181,71,0.22) 50%, rgba(255,138,0,0.18) 70%, rgba(255,138,0,0.1) 90%, transparent 100%)',
                  filter: 'blur(8px)'
                }}
              />
              {/* Sharp line layer with shimmer */}
              <div
                className="relative h-[5px] overflow-hidden"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.45) 3%, rgba(255,138,0,0.75) 15%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.75) 85%, rgba(255,138,0,0.45) 97%, transparent 100%)'
                }}
              >
                {/* Shimmer overlay */}
                <div
                  className="absolute inset-0 animate-golden-shimmer"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255,220,150,0.3) 50%, transparent 60%, transparent 100%)',
                    backgroundSize: '200% 100%'
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* Page content — constrained container */}
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Coin Top-up Section */}
        <section className="w-full overflow-x-hidden grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column - Dobijte si MioCoiny */}
          <Card className="rounded-xl overflow-hidden bg-[hsl(220_45%_6%)] border border-[rgba(255,138,0,0.2)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full">
            <CardContent className="p-5 h-full flex flex-col">
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-heading-gold flex items-center gap-2">
                    <OneMilMioCoinIcon size={24} className="w-6 h-6 md:w-7 md:h-7" />
                    Dobijte si MioCoiny
                  </h2>
                  <p className="text-sm text-text-silver">Dobíjejte si MioCoiny pro otevření voucherů nebo účasti ve hře.</p>
                </div>

                {/* Coin Packages Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                  {/* Package 50 Kč → 50 MC */}
                  <div className="rounded-xl w-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-blue/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-blue)/0.08)] overflow-hidden">
                    {/* Top area: image or fallback text */}
                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">
                      {placementBanners.miocoin_50?.image_url ? (
                        <img
                          src={placementBanners.miocoin_50.image_url}
                          alt="MioCoin 50"
                          className="w-full h-full object-cover object-center"
                        />
                      ) : (
                        <div className="text-center py-3">
                          <div className="text-3xl font-bold text-package-blue drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">50</div>
                          <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                          <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">50 Kč</div>
                        </div>
                      )}
                    </div>
                    {/* Button — always at bottom */}
                    <div className="flex-shrink-0 px-3 pb-3 pt-2">
                      <Button
                        size="sm"
                        className="w-full bg-package-blue text-black font-bold shadow-[0_0_10px_hsl(var(--package-blue)/0.3)] hover:brightness-110 transition-all duration-200"
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
                    <div className="rounded-xl w-full h-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-gold/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-gold)/0.08)] overflow-hidden">
                      {/* Top area: image or fallback text */}
                      <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">
                        {placementBanners.miocoin_310?.image_url ? (
                          <img
                            src={placementBanners.miocoin_310.image_url}
                            alt="MioCoin 310"
                            className="w-full h-full object-cover object-center"
                          />
                        ) : (
                          <div className="text-center py-3">
                            <div className="text-3xl font-bold text-package-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">310</div>
                            <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                            <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">300 Kč</div>
                          </div>
                        )}
                      </div>
                      {/* Button — always at bottom */}
                      <div className="flex-shrink-0 px-3 pb-3 pt-2">
                        <Button
                          size="sm"
                          className="w-full bg-package-gold text-black font-bold shadow-[0_0_10px_hsl(var(--package-gold)/0.3)] hover:brightness-110 transition-all duration-200"
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
                    <div className="rounded-xl w-full h-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-purple/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-purple)/0.08)] overflow-hidden">
                      {/* Top area: image or fallback text */}
                      <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">
                        {placementBanners.miocoin_525?.image_url ? (
                          <img
                            src={placementBanners.miocoin_525.image_url}
                            alt="MioCoin 525"
                            className="w-full h-full object-cover object-center"
                          />
                        ) : (
                          <div className="text-center py-3">
                            <div className="text-3xl font-bold text-package-purple drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">525</div>
                            <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                            <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">500 Kč</div>
                          </div>
                        )}
                      </div>
                      {/* Button — always at bottom */}
                      <div className="flex-shrink-0 px-3 pb-3 pt-2">
                        <Button
                          size="sm"
                          className="w-full bg-package-purple text-white font-bold shadow-[0_0_10px_hsl(var(--package-purple)/0.3)] hover:brightness-110 transition-all duration-200"
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
                    <div className="rounded-xl w-full h-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-green/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-green)/0.08)] overflow-hidden">
                      {/* Top area: image or fallback text */}
                      <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">
                        {placementBanners.miocoin_1280?.image_url ? (
                          <img
                            src={placementBanners.miocoin_1280.image_url}
                            alt="MioCoin 1280"
                            className="w-full h-full object-cover object-center"
                          />
                        ) : (
                          <div className="text-center py-3">
                            <div className="text-3xl font-bold text-package-green drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">1280</div>
                            <div className="text-sm text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">MioCoinů</div>
                            <div className="text-xs text-muted-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">1200 Kč</div>
                          </div>
                        )}
                      </div>
                      {/* Button — always at bottom */}
                      <div className="flex-shrink-0 px-3 pb-3 pt-2">
                        <Button
                          size="sm"
                          className="w-full bg-package-green text-white font-bold shadow-[0_0_10px_hsl(var(--package-green)/0.3)] hover:brightness-110 transition-all duration-200"
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
                    className="rounded-xl p-4 min-h-[88px] md:min-h-[96px] bg-[hsl(220_45%_6%)] border-2 border-[rgba(255,138,0,0.3)] cursor-pointer hover:border-[rgba(255,138,0,0.5)] transition-all duration-200 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_12px_rgba(255,138,0,0.05)] relative overflow-hidden"
                    onClick={() => navigate("/games")}
                  >
                    {placementBanners.probihajici_souteze?.image_url && (
                      <img
                        src={placementBanners.probihajici_souteze.image_url}
                        alt="Probíhající soutěže"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {!placementBanners.probihajici_souteze?.image_url && (
                      <>
                        <OneMilTrophyIcon size={32} className="w-8 h-8 mb-2 relative z-10 text-[#FF8A00]" />
                        <div className="text-sm font-semibold text-foreground relative z-10">Probíhající soutěže</div>
                      </>
                    )}
                  </div>

                  {/* Box 2: Koupit voucher se slevou */}
                  <div
                    className="rounded-xl p-4 min-h-[88px] md:min-h-[96px] bg-[hsl(220_45%_6%)] border-2 border-rose-400/30 cursor-pointer hover:border-rose-400/50 transition-all duration-200 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_12px_hsl(350_60%_50%/0.06)] relative overflow-hidden"
                    onClick={() => navigate("/vouchers")}
                  >
                    {placementBanners.koupit_voucher?.image_url && (
                      <img
                        src={placementBanners.koupit_voucher.image_url}
                        alt="Koupit voucher se slevou"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {!placementBanners.koupit_voucher?.image_url && (
                      <>
                        <OneMilVoucherIcon size={32} className="w-8 h-8 text-rose-400 mb-2 relative z-10" />
                        <div className="text-sm font-semibold text-foreground relative z-10">Koupit voucher se slevou</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Poslední výherci */}
          <Card className="rounded-xl overflow-hidden bg-[hsl(220_45%_6%)] border border-[rgba(255,138,0,0.2)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full relative">
            <CardContent className="p-5 h-full flex flex-col relative z-10">
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-heading-gold flex items-center gap-2">
                    <OneMilTrophyIcon size={24} className="w-6 h-6 md:w-7 md:h-7" />
                    Poslední výherci
                  </h2>
                  <p className="text-sm text-text-silver">Nejnovější výhry z našich soutěží</p>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto">
                  {winnersLoading ? (
                    // Loading placeholders
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="rounded-xl h-[112px] animate-pulse" style={{ background: 'hsl(220 45% 6%)', border: '1px solid rgba(255,138,0,0.15)' }} />
                    ))
                  ) : !latestWinners || latestWinners.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <OneMilTrophyIcon size={48} className="w-12 h-12 mx-auto text-muted-foreground/50" />
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
                          userAvatarUrl={winner.user_avatar_url}
                          ticketNumber={winner.ticket_number}
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
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.1) 10%, rgba(255,138,0,0.18) 30%, rgba(255,181,71,0.22) 50%, rgba(255,138,0,0.18) 70%, rgba(255,138,0,0.1) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.45) 3%, rgba(255,138,0,0.75) 15%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.75) 85%, rgba(255,138,0,0.45) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255,220,150,0.3) 50%, transparent 60%, transparent 100%)',
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
                className="relative rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:scale-105"
                onClick={() => navigate("/vouchers")}
              >
                <img
                  src={voucherBanner.image_url}
                  alt={voucherBanner.title}
                  className="w-full h-64 md:h-80 object-cover"
                />
              </div>
            )}

            {/* Games Banner */}
            {gamesBanner && (
              <div
                className="relative rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:scale-105"
                onClick={() => navigate("/games")}
              >
                <img src={gamesBanner.image_url} alt={gamesBanner.title} className="w-full h-64 md:h-80 object-cover" />
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
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.1) 10%, rgba(255,138,0,0.18) 30%, rgba(255,181,71,0.22) 50%, rgba(255,138,0,0.18) 70%, rgba(255,138,0,0.1) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.45) 3%, rgba(255,138,0,0.75) 15%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.75) 85%, rgba(255,138,0,0.45) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255,220,150,0.3) 50%, transparent 60%, transparent 100%)',
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
                <div className="px-2 py-1 bg-[rgba(255,138,0,0.08)] border border-[rgba(255,138,0,0.3)] rounded text-xs text-[#FF8A00]">
                  Pouze čtení
                </div>
              )}
              {!user && (
                <div className="px-2 py-1 bg-[rgba(255,138,0,0.1)] border border-[rgba(255,138,0,0.3)] rounded text-xs text-[#FFB547]">
                  Přihlásit pro interakci
                </div>
              )}
            </div>
          </div>

          <div
            ref={contestsCarouselRef}
            data-carousel-content
            className="flex overflow-x-auto scroll-smooth gap-4 pb-4"
            style={{
              scrollBehavior: "smooth",
              scrollSnapType: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {loading ? (
              // Skeleton placeholders matching ContestCard design
              Array(3).fill(0).map((_, index) => (
                <div key={`skeleton-${index}`} className="flex-shrink-0 w-80">
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
                <Card className="coupon-card border-[rgba(255,138,0,0.4)] bg-gradient-to-b from-[hsl(220_35%_8%)] to-[hsl(220_30%_5%)] relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-[#FFB547]">
                      Žádné aktivní soutěže
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
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
                  className="flex-shrink-0 w-80"
                  hideTitleAndCount
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
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.1) 10%, rgba(255,138,0,0.18) 30%, rgba(255,181,71,0.22) 50%, rgba(255,138,0,0.18) 70%, rgba(255,138,0,0.1) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.45) 3%, rgba(255,138,0,0.75) 15%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.75) 85%, rgba(255,138,0,0.45) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255,220,150,0.3) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '200% 100%'
              }}
            />
          </div>
        </div>

        {/* Available Vouchers Section - Visible to everyone */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-heading-gold flex items-center gap-2">
              <OneMilVoucherIcon size={24} className="w-6 h-6" />
              Dostupné vouchery
            </h3>
            <div className="flex items-center gap-2">
              {user && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/vouchers?tab=available")}
                  className="text-xs"
                >
                  Moje vouchery
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
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
                  <div key={voucher.id} className="flex-none w-80 cursor-pointer" onClick={() => navigate("/vouchers?tab=available")}>
                  <Card className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.35)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-all duration-300 hover:border-[rgba(255,138,0,0.55)] hover:shadow-[0_0_12px_rgba(255,138,0,0.2)] hover:scale-[1.02]">
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
                          <div className="text-primary font-bold text-2xl">5 MioCoinů</div>
                        </div>

                        {/* Button */}
                        <div className="space-y-2">
                          <Button
                            className="w-full bg-primary text-primary-foreground font-bold shadow-[0_0_12px_hsl(var(--primary)/0.35)] hover:brightness-110 transition-all duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user) {
                                navigate(buildLoginRedirectUrl(location.pathname + location.search));
                              } else {
                                handleVoucherPurchase(voucher.id);
                              }
                            }}
                          >
                            {!user ? "PŘIHLÁSIT SE" : "KOUPIT ZA 5 MC"}
                          </Button>

                          {/* Status indicator */}
                          <div className="text-xs text-muted-foreground">
                            {user ? "Klikněte pro nákup" : "Přihlaste se pro nákup"}
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
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.1) 10%, rgba(255,138,0,0.18) 30%, rgba(255,181,71,0.22) 50%, rgba(255,138,0,0.18) 70%, rgba(255,138,0,0.1) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.45) 3%, rgba(255,138,0,0.75) 15%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.75) 85%, rgba(255,138,0,0.45) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255,220,150,0.3) 50%, transparent 60%, transparent 100%)',
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
                  className="voucher-card-glow aspect-square bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[3px] border-[rgba(255,138,0,0.35)] rounded-[20px] overflow-hidden cursor-pointer transition-all duration-300 hover:border-[rgba(255,138,0,0.55)] hover:shadow-[0_0_12px_rgba(255,138,0,0.2)] hover:scale-[1.02] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] group"
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
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.1) 10%, rgba(255,138,0,0.18) 30%, rgba(255,181,71,0.22) 50%, rgba(255,138,0,0.18) 70%, rgba(255,138,0,0.1) 90%, transparent 100%)',
              filter: 'blur(8px)'
            }}
          />
          {/* Sharp line layer with shimmer */}
          <div 
            className="relative h-[5px] max-w-[1300px] mx-auto overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,138,0,0.45) 3%, rgba(255,138,0,0.75) 15%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.75) 85%, rgba(255,138,0,0.45) 97%, transparent 100%)'
            }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 animate-golden-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255,220,150,0.3) 50%, transparent 60%, transparent 100%)',
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
                <Card key={index} className="coming-soon-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[2px] border-[rgba(255,138,0,0.4)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-transform duration-300 hover:scale-[1.02]">
                  <CardContent className="p-0">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted/20 animate-pulse" />
                  </CardContent>
                </Card>
              ))
            ) : comingSoonBanners.length === 0 ? (
              // Placeholder cards when empty
              Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="coming-soon-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[2px] border-[rgba(255,138,0,0.4)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-transform duration-300 hover:scale-[1.02]">
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
                <Card key={banner.id} className="coming-soon-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(220_35%_8%)] via-[hsl(220_30%_6%)] to-[hsl(220_25%_4%)] border-[2px] border-[rgba(255,138,0,0.4)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-transform duration-300 hover:scale-[1.02]">
                  <CardContent className="p-0">
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-muted/40">
                      <img
                        src={banner.image_url}
                        alt={banner.title || 'Coming soon'}
                        className="w-full h-full object-cover"
                      />
                      {/* Pulsing info icon — only when description exists */}
                      {banner.description && (
                        <button
                          onClick={() => setInfoPopup({ title: banner.title, description: banner.description! })}
                          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, rgba(255,138,0,0.9) 0%, rgba(255,181,71,0.9) 100%)',
                            boxShadow: '0 0 0 0 rgba(255,138,0,0.7)',
                            animation: 'info-pulse 2s ease-in-out infinite',
                          }}
                          aria-label="Zobrazit info"
                        >
                          <OneMilInfoIcon size={16} className="w-4 h-4 text-white" />
                        </button>
                      )}
                    </div>
                    {banner.title && (
                      <div className="px-5 py-4">
                        <h4
                          className="font-bold text-center tracking-wide truncate"
                          style={{
                            fontFamily: "'Poppins', system-ui, sans-serif",
                            fontSize: '1rem',
                            background: 'linear-gradient(90deg, #E7EBF0 0%, #FFB547 60%, #FF8A00 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          }}
                        >
                          {banner.title}
                        </h4>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Coming Soon Info Modal */}
        {infoPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,11,15,0.85)', backdropFilter: 'blur(6px)' }}
            onClick={() => setInfoPopup(null)}
          >
            <div
              className="relative w-full max-w-md rounded-2xl p-6 space-y-4"
              style={{
                background: 'linear-gradient(160deg, hsl(220 35% 9%) 0%, hsl(220 25% 5%) 100%)',
                border: '1.5px solid rgba(255,138,0,0.35)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,181,71,0.08)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setInfoPopup(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Title */}
              {infoPopup.title && (
                <h3
                  className="font-bold tracking-wide pr-8"
                  style={{
                    fontFamily: "'Poppins', system-ui, sans-serif",
                    fontSize: '1.15rem',
                    background: 'linear-gradient(90deg, #E7EBF0 0%, #FFB547 55%, #FF8A00 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {infoPopup.title}
                </h3>
              )}

              {/* Divider */}
              <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,138,0,0.4), transparent)' }} />

              {/* Description */}
              <p className="text-sm leading-relaxed" style={{ color: '#BFC6CF' }}>
                {infoPopup.description}
              </p>
            </div>
          </div>
        )}

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
                <div className="space-y-4 max-w-2xl mx-auto text-left">
                  <div className="text-base leading-relaxed">
                    <p className="text-foreground font-medium">🛒 Nakupujete u partnerských e-shopů</p>
                    <p className="text-muted-foreground mt-1">Za nákup u zapojených e-shopů můžete získat digitální kredity MioCoiny jako marketingovou odměnu.</p>
                  </div>
                  <div className="text-base leading-relaxed">
                    <p className="text-foreground font-medium">💎 Získáváte MioCoiny za nákup</p>
                    <p className="text-muted-foreground mt-1">Počet MioCoinů se odvíjí od hodnoty nákupu nebo konkrétních produktů – vždy podle pravidel daného e-shopu.</p>
                  </div>
                  <div className="text-base leading-relaxed">
                    <p className="text-foreground font-medium">🎟 MioCoiny využijete k účasti v soutěžích</p>
                    <p className="text-muted-foreground mt-1">MioCoiny slouží výhradně k účasti ve spotřebitelských soutěžích o věcné ceny v aplikaci OneMil.</p>
                  </div>
                  <div className="text-base leading-relaxed">
                    <p className="text-foreground font-medium">🏆 Hrajete o luxusní věcné ceny</p>
                    <p className="text-muted-foreground mt-1">Soutěže probíhají o ceny jako auta, dovolené, elektroniku nebo jiné hodnotné věcné výhry.</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground/70 max-w-2xl mx-auto pt-2 space-y-0.5">
                  <p>MioCoiny nejsou peníze a nelze je vybrat.</p>
                  <p>Soutěže mají předem určené výherní pozice.</p>
                  <p>Výhry jsou výhradně věcné.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <Footer />
      </div>

    </div>
  );
};

export default Homepage;
