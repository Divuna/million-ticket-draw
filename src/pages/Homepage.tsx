import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useUserVouchers } from "@/hooks/useUserVouchers";
import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { usePartners } from "@/hooks/usePartners";
import { useHomepageVideoSimple } from "@/hooks/useHomepageVideoSimple";
import { useLatestWinners } from "@/hooks/useLatestWinners";
import { useComingSoonBanners } from "@/hooks/useComingSoonBanners";
import { WinnerCard } from "@/components/WinnerCard";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { Gift, Trophy, ChevronRight, Ticket, Star, ChevronLeft, Handshake, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

interface Contest {
  id: string;
  title: string;
  main_prize: string;
  main_image: string | null;
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
  const { vouchers: userVouchers, loading: userVouchersLoading, refetch: refetchUserVouchers } = useUserVouchers();
  const { banners: megajackpotBanners, loading: bannersLoading } = useMegajackpotBanners();
  const { voucherBanner, gamesBanner, loading: homepageBannersLoading } = useHomepageBanners();
  const { partners, loading: partnersLoading } = usePartners();
  const { videoUrl, isActive: isVideoActive, loading: videoLoading } = useHomepageVideoSimple();
  const { data: latestWinners, isLoading: winnersLoading } = useLatestWinners(50);
  const { banners: comingSoonBanners, loading: comingSoonLoading } = useComingSoonBanners();
  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);
  const megajackpotCarouselRef = useRef<HTMLDivElement>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // Fetch contests from database
  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from("contests")
        .select("id, title, main_prize, main_image, status, ticket_count, ticket_price, created_at")
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

  // Load contests on component mount
  useEffect(() => {
    fetchContests();
  }, []);

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
      const step = () => {
        el.scrollLeft += speed;
        const half = el.scrollWidth / 2;
        if (half > 0 && el.scrollLeft >= half) {
          // Seamlessly wrap without visible jump
          el.scrollLeft -= half;
        }
        rafId = requestAnimationFrame(step);
      };

      rafId = requestAnimationFrame(step);
      return () => cancelAnimationFrame(rafId);
    };

    const stopContests = startAutoScroll(contestsCarouselRef, 0.8);
    const stopVouchers = startAutoScroll(vouchersCarouselRef, 0.8);

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
      refetchUserVouchers();
    } catch (error) {
      console.error("Error purchasing voucher:", error);
      toast.error("Nepodařilo se zakoupit voucher");
    }
  };

  const handleCopyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Kód voucheru zkopírován do schránky!");
  };

  const handleCoinPurchase = async (amount: number, bonusAmount: number = 0) => {
    if (!user) {
      toast.error("Pro nákup MioCoinů se musíte přihlásit");
      navigate("/login");
      return;
    }

    try {
      const totalCoins = amount + bonusAmount;
      toast.loading("Otevírám platební bránu...");
      
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
        body: { amount: totalCoins },
      });

      if (error) throw error;
      
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error("Nepodařilo se získat platební odkaz");
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast.dismiss();
      toast.error("Nepodařilo se otevřít platební bránu");
    }
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-12">
        {/* Megajackpot Banner Section */}
        <section className="w-full">
          {bannersLoading ? (
            // Loading placeholder
            <div className="h-80 md:h-96 bg-muted/30 animate-pulse rounded-lg" />
          ) : megajackpotBanners.length > 0 ? (
            // Banner display with carousel for multiple banners
            <div className="relative">
              <div className="h-80 md:h-96 relative overflow-hidden rounded-lg">
                {/* Banner image */}
                <img
                  src={megajackpotBanners[currentBannerIndex]?.image_url}
                  alt={megajackpotBanners[currentBannerIndex]?.title || "Banner"}
                  className="w-full h-full object-cover"
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
          ) : null}
        </section>

        {/* Coin Top-up Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Dobijte si MioCoiny */}
          <Card className="rounded-2xl overflow-hidden bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm border-primary/20 shadow-lg hover:shadow-primary/10 transition-all duration-300 h-full">
            <CardContent className="p-8 h-full flex flex-col">
              <div className="space-y-6 flex-1 flex flex-col">
                <div className="space-y-3">
                  <h2 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-3">
                    <Gift className="w-8 h-8" />
                    Dobijte si MioCoiny
                  </h2>
                  <p className="text-lg text-muted-foreground">Dobíjejte si MioCoiny pro otevření voucherů nebo účasti ve hře.</p>
                </div>

                {/* Coin Packages Grid */}
                <div className="grid grid-cols-4 gap-4 flex-1">
                  {/* Package 50 */}
                  <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 flex flex-col items-center justify-between">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-blue-500">50</div>
                      <div className="text-sm text-muted-foreground mt-1">MioCoinů</div>
                    </div>
                    <Button 
                      size="sm" 
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleCoinPurchase(50, 0)}
                    >
                      Dobít
                    </Button>
                  </div>

                  {/* Package 300 +10 Bonus */}
                  <div className="rounded-xl p-4 bg-gradient-to-br from-yellow-500/10 to-cyan-500/10 border border-yellow-500/20 flex flex-col items-center justify-between relative">
                    <Badge className="absolute -top-2 -right-2 bg-yellow-500 text-black text-xs">+10 Bonus</Badge>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-yellow-500">300</div>
                      <div className="text-sm text-muted-foreground mt-1">MioCoinů</div>
                      <div className="text-xs text-muted-foreground mt-1">299 Kč</div>
                    </div>
                    <Button 
                      size="sm" 
                      className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700"
                      onClick={() => handleCoinPurchase(300, 10)}
                    >
                      Dobít
                    </Button>
                  </div>

                  {/* Package 500 +25 Bonus */}
                  <div className="rounded-xl p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 flex flex-col items-center justify-between relative">
                    <Badge className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs">+25 Bonus</Badge>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-purple-500">500</div>
                      <div className="text-sm text-muted-foreground mt-1">MioCoinů</div>
                      <div className="text-xs text-muted-foreground mt-1">499 Kč</div>
                    </div>
                    <Button 
                      size="sm" 
                      className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
                      onClick={() => handleCoinPurchase(500, 25)}
                    >
                      Dobít
                    </Button>
                  </div>

                  {/* Package 1200 +80 Bonus */}
                  <div className="rounded-xl p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 flex flex-col items-center justify-between relative">
                    <Badge className="absolute -top-2 -right-2 bg-green-500 text-white text-xs">+80 Bonus</Badge>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-green-500">1200</div>
                      <div className="text-sm text-muted-foreground mt-1">MioCoinů</div>
                      <div className="text-xs text-muted-foreground mt-1">999 Kč</div>
                    </div>
                    <Button 
                      size="sm" 
                      className="w-full mt-4 bg-green-600 hover:bg-green-700"
                      onClick={() => handleCoinPurchase(1200, 80)}
                    >
                      Dobít
                    </Button>
                  </div>
                </div>

                {/* Two Boxes Below */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                  {/* Box 1: Probíhající soutěže */}
                  <div 
                    className="rounded-xl p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 cursor-pointer hover:scale-105 transition-transform duration-200 flex flex-col items-center justify-center text-center"
                    onClick={() => navigate("/games")}
                  >
                    <Trophy className="w-8 h-8 text-amber-500 mb-2" />
                    <div className="text-sm font-semibold text-foreground">Probíhající soutěže</div>
                  </div>

                  {/* Box 2: Koupit voucher se slevou */}
                  <div 
                    className="rounded-xl p-4 bg-gradient-to-br from-pink-500/10 to-rose-500/10 border border-pink-500/20 cursor-pointer hover:scale-105 transition-transform duration-200 flex flex-col items-center justify-center text-center"
                    onClick={() => navigate("/vouchers")}
                  >
                    <Gift className="w-8 h-8 text-pink-500 mb-2" />
                    <div className="text-sm font-semibold text-foreground">Koupit voucher se slevou</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Poslední výherci */}
          <Card className="rounded-2xl overflow-hidden bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm border-primary/20 shadow-lg hover:shadow-primary/10 transition-all duration-300 h-full">
            <CardContent className="p-8 h-full flex flex-col">
              <div className="space-y-6 flex-1 flex flex-col">
                <div className="space-y-3">
                  <h2 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-3">
                    <Trophy className="w-8 h-8" />
                    Poslední výherci
                  </h2>
                  <p className="text-lg text-muted-foreground">Nejnovější výhry z našich soutěží</p>
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
                        />
                      ))
                  )}
                </div>

                <Button variant="outline" size="lg" className="w-full gap-2" onClick={() => navigate("/winners")}>
                  Zobrazit všechny
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

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

        {/* Ongoing Contests Carousel */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-primary flex items-center gap-2">
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
              // Loading placeholder
              <div className="flex-none w-72">
                <Card className="coupon-card border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <div className="h-4 bg-amber-200 dark:bg-amber-800 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-amber-100 dark:bg-amber-900 rounded animate-pulse w-20" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-16 bg-amber-100 dark:bg-amber-900 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-amber-200 dark:bg-amber-800 rounded animate-pulse" />
                  </CardContent>
                </Card>
              </div>
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
              // Duplicate content for infinite loop
              [...contests, ...contests].map((contest, index) => (
                <Card
                  key={`${contest.id}-${index}`}
                  className={`flex-shrink-0 w-[280px] md:w-[320px] rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm transition-all duration-300 shadow-lg ${
                    user && !isAdmin
                      ? "cursor-pointer hover:scale-105 hover:border-primary/40 hover:shadow-primary/20"
                      : !user
                        ? "cursor-pointer hover:opacity-80 hover:scale-[1.02]"
                        : isAdmin
                          ? "opacity-90"
                          : ""
                  }`}
                  onClick={() => !isAdmin && handleContestClick(contest.id)}
                >
                  <CardContent className="p-0">
                    <div className="relative">
                      {contest.main_image ? (
                        <img
                          src={
                            contest.main_image.startsWith("http")
                              ? contest.main_image
                              : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`
                          }
                          alt={contest.title}
                          className="w-full h-48 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-48 bg-muted/40 flex items-center justify-center">
                          <div className="text-center text-muted-foreground">
                            <Trophy className="w-12 h-12 mx-auto mb-2" />
                            <span className="text-sm">Bez obrázku</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="bg-primary/90 text-primary-foreground border-0">
                          {contest.status === "active" ? "Aktivní" : "Připravuje se"}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <h3 className="font-bold text-lg line-clamp-2 group-hover:text-primary transition-colors">
                        {contest.title}
                      </h3>

                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-primary line-clamp-1">{contest.main_prize}</span>
                      </div>

                      <div className="pt-2 border-t border-border/50 space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Celkem tiketů</span>
                          <span className="font-bold text-foreground">
                            {contest.ticket_count?.toLocaleString("cs-CZ")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Cena tiketu</span>
                          <span className="font-bold text-foreground">{contest.ticket_price} Kč</span>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground pt-2 border-t border-border/30">
                        {user && !isAdmin
                          ? "Klikněte pro hraní her"
                          : !user
                            ? "Přihlaste se pro hraní"
                            : "Admin zobrazení - pouze pro čtení"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Available Vouchers Section - Visible to everyone */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-primary flex items-center gap-2">
              <Gift className="w-6 h-6" />
              Dostupné vouchery
            </h3>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
              {isAdmin && (
                <div className="px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                  Pouze čtení
                </div>
              )}
            </div>
          </div>

          <div className="flex overflow-x-auto scroll-smooth gap-4 pb-4">
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
                  <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30 transition-all duration-300 hover:opacity-90 hover:scale-[1.01]">
                    <div className="flex h-48 relative">
                      {/* Left side - Content */}
                      <div className="flex-1 p-6 flex flex-col justify-between">
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
                            className="w-full"
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
                            {!user ? "PŘIHLÁSIT SE PRO NÁKUP" : "KOUPIT ZA 1 MioCoin"}
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

        {/* My Vouchers Section - Only for logged in users */}
        {user && !isAdmin && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-primary flex items-center gap-2">
                <Gift className="w-6 h-6" />
                Moje vouchery
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userVouchersLoading ? (
                // Loading placeholder
                Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                    <CardContent className="p-6 space-y-4">
                      <div className="h-6 bg-muted rounded animate-pulse mb-2" />
                      <div className="h-4 bg-muted/70 rounded animate-pulse w-24" />
                      <div className="h-12 bg-muted rounded animate-pulse mb-4" />
                      <div className="h-10 bg-muted/80 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))
              ) : userVouchers.length === 0 ? (
                // No user vouchers message
                <div className="col-span-full">
                  <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card/40">
                    <CardContent className="p-8 space-y-2 text-center">
                      <Gift className="w-12 h-12 mx-auto text-muted-foreground/50" />
                      <h3 className="text-xl font-bold text-primary">Zatím nemáte žádné vouchery</h3>
                      <div className="text-sm text-muted-foreground">
                        Zakupte si voucher výše, abyste mohli získat bonusové MioCoiny
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                userVouchers.map((userVoucher) => (
                  <Card key={userVoucher.id} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30">
                    <CardContent className="p-6 space-y-4">
                      {/* Voucher image */}
                      <div className="aspect-video rounded-lg overflow-hidden bg-muted/40">
                        {userVoucher.voucher.image_url ? (
                          <img
                            src={userVoucher.voucher.image_url}
                            alt={userVoucher.voucher.name}
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
                        <h4 className="font-bold text-lg text-foreground">{userVoucher.voucher.name}</h4>
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
                          Zkopírovat kód
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>
        )}

        {/* Partners Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-primary flex items-center gap-2">
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
                  className="aspect-square bg-card border border-border rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-primary group"
                  onClick={() => window.open(partner.website_url, "_blank")}
                >
                  <div className="w-full h-full p-4 flex items-center justify-center relative">
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

        {/* Coming Soon Section */}
        {!comingSoonLoading && comingSoonBanners.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-primary flex items-center gap-2">
                Připravujeme
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {comingSoonBanners.map((banner) => (
                <Card key={banner.id} className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30">
                  <CardContent className="p-0">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted/40">
                      <img
                        src={banner.image_url}
                        alt={banner.title || 'Coming soon'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {banner.title && (
                      <div className="p-4">
                        <h4 className="font-bold text-lg text-foreground text-center">{banner.title}</h4>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Instructional Video Section */}
        {!videoLoading && videoUrl && isVideoActive && (
          <section className="space-y-6 mt-16">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-primary flex items-center gap-2">
                <span className="w-6 h-6 text-primary">🎬</span>
                Jak to funguje
              </h3>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
              <YouTubeEmbed url={videoUrl} className="rounded-lg shadow-lg" />

              <div className="text-center space-y-4 px-4">
                <h4 className="text-xl font-semibold text-foreground">
                  Jak hra funguje, co se vyhrává a jak probíhá nákup voucherů
                </h4>
                <div className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  <p className="mb-3">
                    🎯 <strong>Kupte tikety</strong> do soutěží o luxusní ceny za pouhý 1 MioCoin
                  </p>
                  <p className="mb-3">
                    🏆 <strong>Vyhrajte hlavní ceny</strong> jako jsou auta, dovolené nebo elektronika
                  </p>
                  <p className="mb-3">
                    🎁 <strong>Získejte bonusové výhry</strong> na každé 100. pozici tiketu
                  </p>
                  <p>
                    💳 <strong>Nakupte vouchery</strong> u našich partnerů a získejte MioCoiny za každý nákup
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Enhanced Footer */}
        <footer className="border-t border-border pt-12 mt-20 bg-gradient-to-br from-background to-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Company Info */}
            <div className="space-y-4">
              <h4 className="font-bold text-xl text-primary mb-6">OneMil</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Vaše platforma pro soutěže a výhry. Získejte šanci vyhrát luxusní ceny a vouchery.
              </p>
              <div className="flex space-x-4 pt-4">
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-primary">FB</span>
                </div>
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-primary">TW</span>
                </div>
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-primary">IG</span>
                </div>
              </div>
            </div>

            {/* Information Links */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg text-primary mb-6">Informace</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    O společnosti
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Jak to funguje
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Naše mise
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Kariéra
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Tiskové zprávy
                  </a>
                </li>
              </ul>
            </div>

            {/* FAQ & Support */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg text-primary mb-6">Podpora</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Často kladené otázky
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Centrum nápovědy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Kontaktujte nás
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Nahlásit problém
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Živý chat
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal Terms */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg text-primary mb-6">Právní podmínky</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Všeobecné obchodní podmínky
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Ochrana osobních údajů
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Pravidla soutěží
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Zásady použití cookies
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors duration-200 story-link">
                    Autorská práva
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-border pt-8 pb-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="text-sm text-muted-foreground">© 2024 OneMil s.r.o. Všechna práva vyhrazena.</div>
              <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                <span>Verze 1.0.0</span>
                <span>•</span>
                <span>Česká republika</span>
                <span>•</span>
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
