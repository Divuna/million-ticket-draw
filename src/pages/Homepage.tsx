import { useHomepageBanners } from "@/hooks/useHomepageBanners";
import { useHomepageVouchers } from "@/hooks/useHomepageVouchers";
import { useMegajackpotBanners } from "@/hooks/useMegajackpotBanners";
import { usePartners } from "@/hooks/usePartners";
import YouTubeEmbed from "@/components/YouTubeEmbed";

export default function Homepage() {
  const { vouchers } = useHomepageVouchers();
  const { megajackpotBanners } = useMegajackpotBanners();
  const { banners } = useHomepageBanners();
  const { partners } = usePartners();

  // Najdeme případné video info – když není, zobrazíme fallback
  const videoBanner = banners?.find((b) => b.homepage_video_active);
  const videoUrl = videoBanner?.homepage_youtube_url || null;

  return (
    <div className="flex flex-col mt-4 gap-6">
      {/* 🎰 Megajackpot Banner */}
      {megajackpotBanners?.length > 0 && (
        <div className="w-full">
          <img src={megajackpotBanners[0].image_url} alt="Megajackpot banner" className="w-full rounded-xl" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 🧧 Vouchery */}
        <div className="p-6 rounded-xl bg-card">
          <h2 className="text-xl font-semibold mb-2">Kupte si vouchery</h2>
          <p className="text-muted-foreground mb-4">Získejte MioCoiny za každý nákup u partnerů.</p>
          <a href="/vouchers">
            <button className="w-full bg-primary text-white py-3 rounded-lg">Přehled voucherů</button>
          </a>
        </div>

        {/* 🏆 Probíhající hry */}
        <div className="p-6 rounded-xl bg-card">
          <h2 className="text-xl font-semibold mb-4">Probíhající hry</h2>

          {vouchers?.length > 0 ? (
            vouchers.map((v) => (
              <div key={v.id} className="p-4 mb-3 rounded-lg bg-card-foreground">
                <h3 className="font-bold">{v.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {v.ticket_count} tiketů · {v.price} Kč
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Žádné aktivní hry.</p>
          )}

          <a href="/contests" className="block mt-4">
            <button className="w-full border rounded-lg py-2">Zobrazit všechny</button>
          </a>
        </div>
      </div>

      {/* 🎥 Jak to funguje – VŽDY VIDITELNÉ */}
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

      {/* 🤝 Partneři – VŽDY VIDITELNÉ */}
      <div className="p-6 rounded-xl bg-card mt-2">
        <h2 className="text-xl font-semibold mb-4">Naši partneři</h2>

        {partners?.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {partners.map((p) => (
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
  );
}
