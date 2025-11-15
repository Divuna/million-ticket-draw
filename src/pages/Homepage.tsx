console.log("🔥🔥🔥 HOMEPAGE DEBUG - PAGE RENDERED");

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
import { useAuth } from "@/components/AuthProvider";
import { useHomepageVouchers } from "@/hooks/useHomepageVouchers";
import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { usePartners } from "@/hooks/usePartners";
import { useHomepageVideoSimple } from "@/hooks/useHomepageVideoSimple";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { Gift, Trophy, ChevronRight, Ticket, Star, ChevronLeft, Handshake, ExternalLink } from "lucide-react";
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
  const { banners: megajackpotBanners, loading: bannersLoading } = useMegajackpotBanners();
  const { voucherBanner, gamesBanner, loading: homepageBannersLoading } = useHomepageBanners();
  const { partners, loading: partnersLoading } = usePartners();
  const { videoUrl, isActive: isVideoActive, loading: videoLoading } = useHomepageVideoSimple();
  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);
  const megajackpotCarouselRef = useRef<HTMLDivElement>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

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

  useEffect(() => {
    fetchContests();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("contest-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contests" }, () => {
        fetchContests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const startAutoScroll = (ref: React.RefObject<HTMLDivElement>, speed: number) => {
      const el = ref.current;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth + 8) return;

      let rafId = 0;
      const step = () => {
        el.scrollLeft += speed;
        const half = el.scrollWidth / 2;
        if (half > 0 && el.scrollLeft >= half) {
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
      return;
    }

    navigate("/games");
  };

  const handleVoucherRedeem = (voucherId: string) => {
    if (!user) {
      toast.error("Pro uplatnění voucheru se musíte přihlásit");
      navigate("/login");
      return;
    }

    if (isAdmin) {
      return;
    }

    navigate("/vouchers");
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-12">
        {/* Megajackpot Banner Section */}
        <section className="w-full">
          {bannersLoading ? (
            <div className="h-80 md:h-96 bg-muted/30 animate-pulse rounded-lg" />
          ) : megajackpotBanners.length > 0 ? (
            <div className="relative">
              <div className="h-80 md:h-96 relative overflow-hidden rounded-lg">
                <img
                  src={megajackpotBanners[currentBannerIndex]?.image_url}
                  alt={megajackpotBanners[currentBannerIndex]?.title || "Banner"}
                  className="w-full h-full object-cover"
                />
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

        {/* Two-Column Banner Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Vouchery */}
          <Card className="rounded-2xl overflow-hidden bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm border-primary/20 shadow-lg hover:shadow-primary/10 transition-all duration-300 h-full">
            <CardContent className="p-8 h-full flex flex-col">
              <div className="space-y-6 flex-1 flex flex-col">
                <div className="space-y-3">
                  <h2 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-3">
                    <Gift className="w-8 h-8" />
                    Kupte si vouchery
                  </h2>
                  <p className="text-lg text-muted-foreground">Získejte MioCoiny za každý nákup</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  Nakupujte u našich partnerů a získejte MioCoiny, které můžete použít pro nákup tiketů do soutěží o
                  luxusní ceny. Každý nákup vám přinese bonusové body!
                </p>
                <div className="relative h-48 rounded-xl overflow-hidden mb-4">
                  <img
                    src="/src/assets/luxury-brands-banner.jpg"
                    alt="Luxury brands vouchers"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "/placeholder.svg";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => !isAdmin && navigate("/vouchers")}
                  disabled={isAdmin}
                >
                  <Gift className="w-5 h-5 mr-2" />
                  Přehled voucherů
                </Button>
                {isAdmin && <div className="text-xs text-amber-400 text-center">Admin zobrazení - pouze pro čtení</div>}
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Games */}
          <Card className="rounded-2xl overflow-hidden bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm border-primary/20 shadow-lg hover:shadow-primary/10 transition-all duration-300 h-full">
            <CardContent className="p-8 h-full flex flex-col">
              <div className="space-y-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-3">
                    <Trophy className="w-8 h-8" />
                    Probíhající hry
                  </h2>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="rounded-xl overflow-hidden bg-card/60 border border-border/50">
                        <div className="flex gap-4 p-4">
                          <div className="w-24 h-24 bg-muted/40 animate-pulse rounded-lg flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-5 bg-muted/60 rounded animate-pulse" />
                            <div className="h-4 bg-muted/40 rounded animate-pulse w-3/4" />
                            <div className="h-3 bg-muted/30 rounded animate-pulse w-1/2" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : contests.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <Trophy className="w-12 h-12 mx-auto text-muted-foreground/50" />
                      <h3 className="text-lg font-bold text-foreground">Žádné aktivní soutěže</h3>
                      <p className="text-sm text-muted-foreground">
                        Momentálně nejsou k dispozici žádné aktivní soutěže
                      </p>
                    </div>
                  ) : (
                    contests.slice(0, 3).map((contest) => (
                      <div
                        key={contest.id}
                        className={`rounded-xl overflow-hidden bg-card/60 border border-border/50 transition-all duration-300 ${
                          user && !isAdmin
                            ? "cursor-pointer hover:bg-card hover:border-primary/40 hover:shadow-md"
                            : !user
                              ? "cursor-pointer hover:opacity-80"
                              : "opacity-90"
                        }`}
                        onClick={() => !isAdmin && handleContestClick(contest.id)}
                      >
                        <div className="flex gap-4 p-4">
                          <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                            {contest.main_image ? (
                              <img
                                src={
                                  contest.main_image.startsWith("http")
                                    ? contest.main_image
                                    : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`
                                }
                                alt={contest.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full bg-muted/40 flex items-center justify-center">
                                <Trophy className="w-8 h-8 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <h3 className="font-bold text-base text-foreground line-clamp-1">{contest.title}</h3>
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4 text-primary flex-shrink-0" />
                              <span className="text-xs font-semibold text-primary line-clamp-1">
                                {contest.main_prize}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{contest.ticket_count?.toLocaleString("cs-CZ")} tiketů</span>
                              <span className="font-bold text-foreground">{contest.ticket_price} Kč</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  className="w-full gap-2"
                  onClick={() => !isAdmin && navigate("/games")}
                  disabled={isAdmin}
                >
                  Zobrazit všechny
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {isAdmin && <div className="text-xs text-amber-400 text-center">Admin zobrazení - pouze pro čtení</div>}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Zbytek souboru */}
        {/* ... */}
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Homepage;
