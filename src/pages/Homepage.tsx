import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { usePartners } from "@/hooks/usePartners";

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
  const [loadingContests, setLoadingContests] = useState(true);

  // 🔥 PŮVODNÍ VIDEO — VRÁCENO ZPĚT
  const videoUrl = "https://onemil-video-storage.s3.eu-central-1.amazonaws.com/how-it-works.mp4";

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoadingContests(true);
      const { data, error } = await supabase
        .from("contests")
        .select("id, title, name, description, main_image, main_prize, ticket_price, ticket_count, status, created_at")
        .order("created_at", { ascending: false })
        .limit(3);

      if (!mounted) return;
      if (error || !data) {
        setContests([]);
      } else {
        setContests(data);
      }
      setLoadingContests(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />

      <div className="container mx-auto px-4 mt-4 flex flex-col gap-8">
        {/* ⭐ Megajackpot banner */}
        {megajackpotBanners?.length > 0 && (
          <div className="w-full">
            <img src={megajackpotBanners[0].image_url} alt="Megajackpot" className="w-full rounded-xl shadow-xl" />
          </div>
        )}

        {/* ⭐ VOUCHERY + GAMES BOX */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* VOUCHERS */}
          <div className="p-6 bg-card rounded-xl shadow-lg">
            <h2 className="text-xl font-semibold mb-2">Kupte si vouchery</h2>
            <p className="text-muted-foreground mb-4">Získejte MioCoiny za každý nákup u partnerů.</p>

            {voucherBanner && <img src={voucherBanner.image_url} className="rounded-lg mb-4 w-full" />}

            <a href="/vouchers">
              <button className="w-full bg-primary text-white py-3 rounded-lg">Přehled voucherů</button>
            </a>
          </div>

          {/* ACTIVE CONTESTS */}
          <div className="p-6 bg-card rounded-xl shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Probíhající hry</h2>

            {gamesBanner && <img src={gamesBanner.image_url} className="rounded-lg mb-4 w-full" />}

            {loadingContests ? (
              <p className="text-muted-foreground">Načítám probíhající hry…</p>
            ) : contests.length === 0 ? (
              <p className="text-muted-foreground">Zatím žádné soutěže.</p>
            ) : (
              contests.map((c) => {
                const title = c.title || c.name || "Soutěž";
                return (
                  <div key={c.id} className="flex items-center gap-4 bg-card-foreground p-4 rounded-lg mb-3">
                    {c.main_image && (
                      <div className="w-16 h-16 rounded-md overflow-hidden">
                        <img src={c.main_image} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold">{title}</h3>
                      {c.main_prize && <p className="text-sm text-muted-foreground">{c.main_prize}</p>}
                      <p className="text-xs text-muted-foreground">Cena ticketu: {c.ticket_price} Kč</p>
                      <p className="text-xs text-muted-foreground">Stav: {c.status}</p>
                    </div>
                  </div>
                );
              })
            )}

            <a href="/contests">
              <button className="w-full mt-3 border rounded-lg py-2">Zobrazit všechny</button>
            </a>
          </div>
        </div>

        {/* ⭐ HOW IT WORKS — VIDEO */}
        {videoUrl && (
          <div className="w-full bg-card p-6 rounded-xl shadow-lg">
            <h2 className="text-xl font-semibold mb-3">Jak to funguje</h2>
            <video src={videoUrl} controls className="rounded-lg w-full" preload="none" />
          </div>
        )}

        {/* ⭐ PARTNERS */}
        <div className="p-6 bg-card rounded-xl shadow-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Naši partneři</h2>
          {partners?.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {partners.map((p) => (
                <div key={p.id} className="flex justify-center items-center">
                  <img src={p.logo_url} className="w-24 opacity-90 object-contain" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Partneři budou doplněni.</p>
          )}
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
}
