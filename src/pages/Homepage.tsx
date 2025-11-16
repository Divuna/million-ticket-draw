console.log("🔥 HOMEPAGE RENDERED - NEW FULL VERSION");

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { supabase } from "@/integrations/supabase/client";

import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useHomepageVouchers } from "@/hooks/useHomepageVouchers";
import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { useHomepageVideoSimple } from "@/hooks/useHomepageVideoSimple";
import { usePartners } from "@/hooks/usePartners";

import YouTubeEmbed from "@/components/YouTubeEmbed";
import { Gift, Trophy, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// Contest interface
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  // Hooks
  const { vouchers: homepageVouchers } = useHomepageVouchers();
  const { banners: megajackpotBanners } = useMegajackpotBanners();
  const { voucherBanner, gamesBanner } = useHomepageBanners();
  const { partners } = usePartners();
  const { videoUrl, isActive: videoActive } = useHomepageVideoSimple();

  // Local state
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loadingContests, setLoadingContests] = useState(true);

  // Refs for carousels
  const partnersCarouselRef = useRef<HTMLDivElement>(null);

  // Fetch contests
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
    } catch (err) {
      toast.error("Nepodařilo se načíst soutěže");
    } finally {
      setLoadingContests(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, []);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("contest-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "contests" }, fetchContests)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Click handlers
  const goToGames = () => {
    if (!user) {
      toast.error("Pro pokračování se musíte přihlásit");
      return navigate("/login");
    }
    if (!isAdmin) navigate("/games");
  };

  const goToVouchers = () => {
    if (!user) {
      toast.error("Pro pokračování se musíte přihlásit");
      return navigate("/login");
    }
    if (!isAdmin) navigate("/vouchers");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-14">
        {/* --------------------- */}
        {/* 1) MEGAJACKPOT BANNER */}
        {/* --------------------- */}

        {megajackpotBanners.length > 0 && (
          <section className="w-full">
            <div className="relative overflow-hidden rounded-xl shadow-xl">
              <img
                src={megajackpotBanners[currentBannerIndex]?.image_url}
                alt="Mj Banner"
                className="w-full h-80 md:h-96 object-cover"
              />

              {/* Arrows */}
              {megajackpotBanners.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 backdrop-blur-sm"
                    onClick={() =>
                      setCurrentBannerIndex((prev) => (prev === 0 ? megajackpotBanners.length - 1 : prev - 1))
                    }
                  >
                    <ChevronLeft className="w-7 h-7 text-white" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 backdrop-blur-sm"
                    onClick={() =>
                      setCurrentBannerIndex((prev) => (prev === megajackpotBanners.length - 1 ? 0 : prev + 1))
                    }
                  >
                    <ChevronRight className="w-7 h-7 text-white" />
                  </Button>
                </>
              )}
            </div>

            {/* Dots */}
            {megajackpotBanners.length > 1 && (
              <div className="flex justify-center mt-3 gap-2">
                {megajackpotBanners.map((_, idx) => (
                  <div
                    key={idx}
                    onClick={() => setCurrentBannerIndex(idx)}
                    className={`w-3 h-3 rounded-full cursor-pointer transition ${
                      idx === currentBannerIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------------------------- */}
        {/* 2) VOUCHERY + HRACÍ SEKCE   */}
        {/* ---------------------------- */}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* LEFT – VOUCHERS */}
          <Card className="rounded-2xl border shadow-lg bg-card/70 backdrop-blur-sm">
            <CardContent className="p-7 flex flex-col gap-6 h-full">
              <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
                <Gift className="w-8 h-8" /> Kupte si vouchery
              </h2>

              <p className="text-muted-foreground">
                Získejte MioCoiny za každý nákup u partnerů. Výměnou můžete hrát o milionové ceny.
              </p>

              {/* Voucher Banner */}
              {voucherBanner?.image_url && (
                <div className="h-48 rounded-xl overflow-hidden shadow-md">
                  <img src={voucherBanner.image_url} alt="Voucher banner" className="w-full h-full object-cover" />
                </div>
              )}

              <Button size="lg" className="w-full" onClick={goToVouchers} disabled={isAdmin}>
                Přehled voucherů
              </Button>

              {isAdmin && <p className="text-xs text-center text-amber-400">Admin zobrazení – pouze pro čtení</p>}
            </CardContent>
          </Card>

          {/* RIGHT – GAMES */}
          <Card className="rounded-2xl border shadow-lg bg-card/70 backdrop-blur-sm">
            <CardContent className="p-7 flex flex-col gap-6 h-full">
              <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
                <Trophy className="w-8 h-8" /> Probíhající hry
              </h2>

              {/* Contest list */}
              <div className="space-y-4 overflow-y-auto max-h-96 pr-1">
                {loadingContests ? (
                  <div className="text-center text-muted-foreground">Načítání…</div>
                ) : contests.length === 0 ? (
                  <div className="text-center text-muted-foreground">Žádné aktivní soutěže</div>
                ) : (
                  contests.slice(0, 3).map((contest) => (
                    <div
                      key={contest.id}
                      onClick={goToGames}
                      className="flex gap-4 p-4 rounded-xl border bg-card/60 hover:shadow-md transition cursor-pointer"
                    >
                      {/* Image */}
                      <div className="w-24 h-24 rounded-xl overflow-hidden">
                        <img
                          src={
                            contest.main_image?.startsWith("http")
                              ? contest.main_image
                              : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`
                          }
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-2">
                        <h3 className="text-lg font-semibold line-clamp-1">{contest.title}</h3>

                        <div className="flex items-center gap-2">
                          <Star className="w-5 h-5 text-primary" />
                          <span className="text-sm font-semibold text-primary">{contest.main_prize}</span>
                        </div>

                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{contest.ticket_count.toLocaleString("cs-CZ")} tiketů</span>
                          <span className="font-semibold text-foreground">{contest.ticket_price} Kč</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button variant="outline" size="lg" className="w-full" onClick={goToGames} disabled={isAdmin}>
                Zobrazit všechny
              </Button>

              {isAdmin && <p className="text-xs text-center text-amber-400">Admin zobrazení – pouze pro čtení</p>}
            </CardContent>
          </Card>
        </section>

        {/* ------------------------ */}
        {/* 3) SIMPLE VIDEO SECTION  */}
        {/* ------------------------ */}

        {videoActive && videoUrl && (
          <section className="space-y-6">
            <h2 className="text-3xl font-bold text-center text-primary">Jak to funguje?</h2>
            <YouTubeEmbed url={videoUrl} className="rounded-xl shadow-xl" />
          </section>
        )}

        {/* ----------------------- */}
        {/* 4) PARTNER CAROUSEL    */}
        {/* ----------------------- */}

        {partners.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4 text-primary">Naši partneři</h2>

            <div ref={partnersCarouselRef} className="flex gap-6 overflow-x-auto pb-4 scrollbar-none">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className="min-w-[160px] h-24 rounded-xl overflow-hidden shadow bg-card/60 flex items-center justify-center"
                >
                  <img src={partner.logo_url} alt={partner.name} className="max-h-16 object-contain" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* FOOTER NAV */}
      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Homepage;
