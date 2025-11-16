import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { usePartners } from "@/hooks/usePartners";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";

type Contest = {
  id: string;
  title: string | null;
  name: string | null;
  description: string | null;
  main_image: string | null;
  main_prize: string | null;
  ticket_price: number | null;
  ticket_count: number | null;
  status: string | null;
};

export default function Homepage() {
  const { banners: megajackpotBanners } = useMegajackpotBanners();
  const { voucherBanner, gamesBanner } = useHomepageBanners();
  const { partners } = usePartners();
  const { isAdmin } = useUserRole();

  const [contests, setContests] = useState<Contest[]>([]);
  const [loadingContests, setLoadingContests] = useState<boolean>(true);

  // 🎥 video URL - placeholder for now since we removed video banner functionality
  const videoUrl = null;

  useEffect(() => {
    let isMounted = true;

    const loadContests = async () => {
      try {
        setLoadingContests(true);
        console.log("🔥 Načítám soutěže pro homepage…");

        const { data, error } = await supabase
          .from("contests")
          .select(
            "id, title, name, description, main_image, main_prize, ticket_price, ticket_count, status, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(3);

        if (error) {
          console.error("❌ Chyba při načítání contests:", error);
          if (isMounted) {
            setContests([]);
          }
          return;
        }

        if (isMounted && data) {
          setContests(data as Contest[]);
          console.log("✅ Soutěže načteny:", data);
        }
      } catch (err) {
        console.error("❌ Neošetřená chyba při načítání contests:", err);
        if (isMounted) {
          setContests([]);
        }
      } finally {
        if (isMounted) {
          setLoadingContests(false);
        }
      }
    };

    loadContests();

    return () => {
      isMounted = false;
    };
  }, []);

  console.log("🔥 HOMEPAGE RENDERED – OK");

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <div className="container mx-auto px-4">
        <div className="flex flex-col mt-4 gap-6">
          {/* 🎰 Megajackpot banner */}
          {megajackpotBanners?.length > 0 && (
            <div className="w-full">
              <img src={megajackpotBanners[0].image_url} alt="Megajackpot banner" className="w-full rounded-xl" />
            </div>
          )}

          {/* Horní dvojblok – vouchery + probíhající hry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 🧧 Vouchery */}
            <div className="p-6 rounded-xl bg-card">
              <h2 className="text-xl font-semibold mb-2">Kupte si vouchery</h2>
              <p className="text-muted-foreground mb-4">Získejte MioCoiny za každý nákup u partnerů.</p>
              <a href="/vouchers">
                <button className="w-full bg-primary text-white py-3 rounded-lg">Přehled voucherů</button>
              </a>
            </div>

            {/* 🏆 Probíhající hry (skutečné soutěže) */}
            <div className="p-6 rounded-xl bg-card">
              <h2 className="text-xl font-semibold mb-4">Probíhající hry</h2>

              {loadingContests ? (
                <p className="text-muted-foreground">Načítám probíhající hry…</p>
              ) : contests.length > 0 ? (
                <>
                  {contests.map((contest) => {
                    const title = contest.title || contest.name || "Soutěž";
                    return (
                      <div key={contest.id} className="flex items-center gap-4 p-4 mb-3 rounded-lg bg-card-foreground">
                        {contest.main_image && (
                          <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                            <img src={contest.main_image} alt={title} className="w-full h-full object-cover" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate">{title}</h3>
                          {contest.main_prize && (
                            <p className="text-sm text-muted-foreground truncate">{contest.main_prize}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {contest.ticket_price != null ? `Cena ticketu: ${contest.ticket_price} Kč` : null}
                          </p>
                          {contest.status && (
                            <p className="text-xs text-muted-foreground mt-1">Stav: {contest.status}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <a href="/contests" className="block mt-4">
                    <button className="w-full border rounded-lg py-2">Zobrazit všechny</button>
                  </a>
                </>
              ) : (
                <p className="text-muted-foreground">Žádné probíhající hry.</p>
              )}
            </div>
          </div>

          {/* 🎥 Jak to funguje – vždy viditelné */}
          <div className="p-6 rounded-xl bg-card mt-2">
            <h2 className="text-xl font-semibold mb-4">Jak to funguje?</h2>

            {videoUrl ? (
              <YouTubeEmbed url={videoUrl} />
            ) : (
              <div className="w-full h-48 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                Video bude brzy doplněno.
              </div>
            )}
          </div>

          {/* 🤝 Partneři – vždy viditelné */}
          <div className="p-6 rounded-xl bg-card mt-2 mb-4">
            <h2 className="text-xl font-semibold mb-4">Naši partneři</h2>

            {partners?.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {partners.map((p: any) => (
                  <div key={p.id} className="flex justify-center items-center">
                    <img src={p.logo_url} className="w-24 h-auto object-contain opacity-90" alt={p.name} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Partneři budou brzy doplněni.</p>
            )}
          </div>
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
}
