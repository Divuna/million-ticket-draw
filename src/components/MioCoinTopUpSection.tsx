import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/nativeApp";
import { useMioCoinCheckout } from "@/hooks/useMioCoinCheckout";
import { OneMilMioCoinIcon } from "@/components/icons/OneMilIcons";

/**
 * Dobíjecí panel MioCoinů (nadpis + čtyři balíčky + Stripe checkout).
 *
 * Přesunuto 1:1 z `src/pages/Homepage.tsx` — jediný zdroj pravdy pro dobíjecí
 * blok. Markup, třídy, texty, částky i chování zůstávají beze změny, aby šel
 * panel později přesunout na samostatnou stránku bez vizuální regrese.
 *
 * Pravidla (neměnit):
 * - Nativní aplikace (Apple/Google pravidla) panel nerenderuje ani nespouští
 *   checkout — detekce výhradně přes `isNativeApp()` z `src/lib/nativeApp.ts`.
 * - Samotné spuštění platby je ve sdíleném `useMioCoinCheckout`, který sdílí
 *   i rychlé dobíjení v hlavičce. Nezakládat tady druhou platební cestu.
 */

type MioCoinPlacementKey = "miocoin_50" | "miocoin_310" | "miocoin_525" | "miocoin_1280";

interface MioCoinTopUpSectionProps {
  placementBanners: Partial<Record<MioCoinPlacementKey, { image_url: string } | null>>;
}

export const MioCoinTopUpSection = ({ placementBanners }: MioCoinTopUpSectionProps) => {
  // Jediný společný Stripe postup — sdílený s rychlým dobíjením v hlavičce.
  const { startCheckout, loading: topUpLoading } = useMioCoinCheckout();
  const handleCoinPurchase = startCheckout;

  // Dobíjecí sekce se v nativní aplikaci nerenderuje (Apple/Google pravidla).
  if (isNativeApp()) return null;

  return (
    <>
                <div className="space-y-2 homepage-miocoin-header">
                  <h2 className="homepage-premium-orange-heading text-xl md:text-2xl font-bold text-heading-gold flex items-center gap-2">
                    <OneMilMioCoinIcon size={24} className="w-6 h-6 md:w-7 md:h-7" />
                    Dobijte si MioCoiny
                  </h2>
                  <p className="text-sm text-text-silver">Dobíjejte si MioCoiny pro otevření voucherů nebo účasti ve hře.</p>
                </div>

                {/* Coin Packages Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 flex-1">
                  {/* Package 50 Kč → 50 MC */}
                  <div className="homepage-light-tile homepage-miocoin-package rounded-xl w-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-blue/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-blue)/0.08)] overflow-hidden">
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
                        className="homepage-miocoin-button w-full bg-package-blue text-black font-bold shadow-[0_0_10px_hsl(var(--package-blue)/0.3)] hover:brightness-110 transition-all duration-200"
                        onClick={() => handleCoinPurchase(50, 50)}
                        disabled={topUpLoading}
                      >
                        {topUpLoading ? "..." : "Dobít"}
                      </Button>
                    </div>
                  </div>

                  {/* Package 300 Kč → 310 MC (+10 Bonus) */}
                  <div className="relative z-20 overflow-visible h-full">
                    <Badge className="homepage-miocoin-bonus absolute -top-2 -right-2 bg-package-gold/90 text-black text-xs font-medium z-50 pointer-events-none">+10 Bonus</Badge>
                    <div className="homepage-light-tile homepage-miocoin-package rounded-xl w-full h-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-gold/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-gold)/0.08)] overflow-hidden">
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
                          className="homepage-miocoin-button w-full bg-package-gold text-black font-bold shadow-[0_0_10px_hsl(var(--package-gold)/0.3)] hover:brightness-110 transition-all duration-200"
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
                    <Badge className="homepage-miocoin-bonus absolute -top-2 -right-2 bg-package-purple/90 text-white text-xs font-medium z-50 pointer-events-none">+25 Bonus</Badge>
                    <div className="homepage-light-tile homepage-miocoin-package rounded-xl w-full h-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-purple/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-purple)/0.08)] overflow-hidden">
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
                          className="homepage-miocoin-button w-full bg-package-purple text-white font-bold shadow-[0_0_10px_hsl(var(--package-purple)/0.3)] hover:brightness-110 transition-all duration-200"
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
                    <Badge className="homepage-miocoin-bonus absolute -top-2 -right-2 bg-package-green/90 text-white text-xs font-medium z-50 pointer-events-none">+80 Bonus</Badge>
                    <div className="homepage-light-tile homepage-miocoin-package rounded-xl w-full h-full min-h-[160px] bg-[hsl(220_45%_6%)] border-2 border-package-green/30 flex flex-col shadow-[inset_0_1px_12px_hsl(var(--package-green)/0.08)] overflow-hidden">
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
                          className="homepage-miocoin-button w-full bg-package-green text-white font-bold shadow-[0_0_10px_hsl(var(--package-green)/0.3)] hover:brightness-110 transition-all duration-200"
                          onClick={() => handleCoinPurchase(1200, 1280)}
                          disabled={topUpLoading}
                        >
                          {topUpLoading ? "..." : "Dobít"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
    </>
  );
};

export default MioCoinTopUpSection;
