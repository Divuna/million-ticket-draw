console.log("🔥 HOMEPAGE RENDERED – OK");

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// FIX 🔥 – správná verze Auth hooku
import { useAuth } from "@/components/AuthProvider";

import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Gift, Trophy, ChevronRight, Star, ChevronLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useHomepageVouchers } from "@/hooks/useHomepageVouchers";
import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";

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
  // 🔥 super důležité – správný useAuth
  const { user } = useAuth();

  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  const { vouchers: homepageVouchers } = useHomepageVouchers();
  const { banners: megajackpotBanners } = useMegajackpotBanners();
  const { voucherBanner, gamesBanner } = useHomepageBanners();

  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);

  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // LOAD CONTESTS ---------------------------------------------------
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
      console.error(err);
      toast.error("Nepodařilo se načíst soutěže");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, []);

  // Realtime update
  useEffect(() => {
    const channel = supabase
      .channel("contest-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contests" }, () => fetchContests())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // NAVIGACE ---------------------------------------------------------
  const handleContestClick = (id: string) => {
    if (!user) {
      toast.error("Pro hraní her se musíte přihlásit");
      navigate("/login");
      return;
    }
    if (!isAdmin) navigate("/games");
  };

  const handleVoucherClick = () => {
    if (!user) {
      toast.error("Pro uplatnění voucheru se musíte přihlásit");
      navigate("/login");
      return;
    }
    if (!isAdmin) navigate("/vouchers");
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8 space-y-12">
        {/* MEGAJACKPOT BANNER */}
        {megajackpotBanners.length > 0 && (
          <section className="w-full relative">
            <div className="h-80 md:h-96 relative overflow-hidden rounded-lg">
              <img src={megajackpotBanners[currentBannerIndex]?.image_url} className="w-full h-full object-cover" />

              {/* šipky */}
              {megajackpotBanners.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30"
                    onClick={() =>
                      setCurrentBannerIndex((prev) => (prev === 0 ? megajackpotBanners.length - 1 : prev - 1))
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30"
                    onClick={() =>
                      setCurrentBannerIndex((prev) => (prev === megajackpotBanners.length - 1 ? 0 : prev + 1))
                    }
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
          </section>
        )}

        {/* VOUCHERY + HRY */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* VOUCHERY */}
          <Card className="rounded-2xl overflow-hidden bg-background/80 backdrop-blur">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Gift className="w-7 h-7" />
                Kupte si vouchery
              </h2>

              <p className="text-muted-foreground mt-2">Získejte MioCoiny za každý nákup u partnerů.</p>

              <Button className="w-full mt-6" onClick={handleVoucherClick} disabled={isAdmin}>
                <Gift className="mr-2" /> Přehled voucherů
              </Button>

              {isAdmin && (
                <div className="text-xs text-amber-400 text-center mt-2">Admin zobrazení – pouze pro čtení</div>
              )}
            </CardContent>
          </Card>

          {/* HRY */}
          <Card className="rounded-2xl overflow-hidden bg-background/80 backdrop-blur">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Trophy className="w-7 h-7" />
                Probíhající hry
              </h2>

              {/* LOADING */}
              {loading && <div className="text-muted-foreground mt-8">Načítání…</div>}

              {/* ŽÁDNÉ HRY */}
              {!loading && contests.length === 0 && <div className="text-muted-foreground mt-6">Žádné soutěže</div>}

              {/* HRY */}
              {!loading &&
                contests.slice(0, 3).map((contest) => (
                  <div
                    key={contest.id}
                    className="mt-6 cursor-pointer p-4 rounded-lg border bg-card hover:bg-card/70"
                    onClick={() => handleContestClick(contest.id)}
                  >
                    <div className="flex gap-4">
                      <div className="w-20 h-20 bg-muted rounded overflow-hidden">
                        {contest.main_image ? (
                          <img
                            src={
                              contest.main_image.startsWith("http")
                                ? contest.main_image
                                : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Trophy className="w-full h-full p-5 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1">
                        <h3 className="font-semibold line-clamp-1">{contest.title}</h3>
                        <div className="flex items-center gap-2 text-primary text-xs mt-1">
                          <Star className="w-3 h-3" />
                          {contest.main_prize}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {contest.ticket_count} tiketů • {contest.ticket_price} Kč
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

              <Button
                variant="outline"
                className="w-full mt-6"
                onClick={() => !isAdmin && navigate("/games")}
                disabled={isAdmin}
              >
                Zobrazit všechny <ChevronRight className="ml-1 w-4 h-4" />
              </Button>

              {isAdmin && (
                <div className="text-xs text-amber-400 text-center mt-2">Admin zobrazení – pouze pro čtení</div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Homepage;
