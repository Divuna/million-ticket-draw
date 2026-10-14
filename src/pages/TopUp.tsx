import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { MioCoinTopUpSection } from "@/components/MioCoinTopUpSection";
import { usePlacementBanners, PlacementKey } from "@/hooks/usePlacementBanners";
import { isNativeApp } from "@/lib/nativeApp";

/**
 * Samostatná stránka dobíjení MioCoinů (`/top-up`) — druhý krok části A issue #289.
 *
 * Vykresluje sdílenou komponentu `MioCoinTopUpSection` ve stejném obalu, jaký má
 * panel na Homepage, aby vzhled zůstal shodný: světlý zákaznický motiv
 * `public-customer-theme` (nastavuje `src/App.tsx` na layout wrapperu pro všechny
 * zákaznické routy) + `homepage-light-page` / `homepage-light-content` /
 * `homepage-light-panel homepage-miocoin-panel`.
 *
 * Pravidla (neměnit):
 * - Nativní aplikace (Apple/Google pravidla): přímé otevření `/top-up` se okamžitě
 *   přesměruje na `/profile` a stránka nevykreslí nic. Detekce výhradně přes
 *   `isNativeApp()` ze `src/lib/nativeApp.ts` — stejný vzor jako `PaymentSuccess`.
 * - Stránka nevolá Stripe ani Supabase přímo; veškerý checkout zůstává uvnitř
 *   `MioCoinTopUpSection`.
 */

/** Jen bannery balíčků — navigační boxy Homepage sem nepatří. */
const TOP_UP_PLACEMENT_KEYS: PlacementKey[] = [
  "miocoin_50",
  "miocoin_310",
  "miocoin_525",
  "miocoin_1280",
];

const TopUp = () => {
  const navigate = useNavigate();
  const nativeApp = isNativeApp();

  useEffect(() => {
    if (nativeApp) navigate("/profile", { replace: true });
  }, [nativeApp, navigate]);

  const { banners: placementBanners } = usePlacementBanners(TOP_UP_PLACEMENT_KEYS);

  if (nativeApp) return null;

  return (
    <div className="homepage-light-page min-h-screen bg-background pb-20">
      <Header />

      <div className="homepage-light-content container mx-auto px-4 py-8 space-y-8">
        <section className="w-full overflow-x-hidden">
          <Card className="homepage-light-panel homepage-miocoin-panel rounded-xl overflow-hidden bg-[hsl(220_45%_6%)] border border-[rgba(255,138,0,0.2)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full">
            <CardContent className="p-5 md:p-6 h-full flex flex-col">
              <div className="space-y-4 flex-1 flex flex-col">
                <MioCoinTopUpSection placementBanners={placementBanners} />
              </div>
            </CardContent>
          </Card>
        </section>

        <Footer />
      </div>
    </div>
  );
};

export default TopUp;
