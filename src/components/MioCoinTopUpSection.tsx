import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/nativeApp";
import { useMioCoinCheckout } from "@/hooks/useMioCoinCheckout";
import { ImmediateUseConsentDialog } from "@/components/ImmediateUseConsentDialog";
import { MioPurchaseInfo } from "@/components/MioPurchaseInfo";
import { MioBadge } from "@/components/brand/MioBadge";
import avatarHoldsMio from "@/assets/redesign/avatar/avatar-drzi-mio.png";

/**
 * Dobíjecí panel MIO (nadpis + čtyři balíčky + Stripe checkout).
 *
 * Jediný zdroj pravdy pro dobíjecí blok. Nový vzhled (deska Dobít): tmavé dlaždice,
 * korunovaná karta MIO podle úrovně balíčku a pečeť s bonusem. Částky, bonusy,
 * pořadí balíčků i chování zůstávají beze změny.
 *
 * Pravidla (neměnit):
 * - Nativní aplikace (Apple/Google pravidla) panel nerenderuje ani nespouští
 *   checkout — detekce výhradně přes `isNativeApp()` z `src/lib/nativeApp.ts`.
 * - Samotné spuštění platby je ve sdíleném `useMioCoinCheckout`, který sdílí
 *   i rychlé dobíjení v hlavičce. Nezakládat tady druhou platební cestu.
 * - Částky a bonusy musí odpovídat `create-stripe-checkout` (50→50, 300→310,
 *   500→525, 1200→1280).
 */

type MioCoinPlacementKey = "miocoin_50" | "miocoin_310" | "miocoin_525" | "miocoin_1280";

interface MioCoinTopUpSectionProps {
  placementBanners: Partial<Record<MioCoinPlacementKey, { image_url: string } | null>>;
}

/** Balíčky v pořadí zobrazení. `tier` určuje vzhled karty MIO a tlačítka. */
const PACKAGES: Array<{
  price: number;
  coins: number;
  bonus: number;
  placement: MioCoinPlacementKey;
  tier: "graphite" | "crimson" | "crown" | "holo";
}> = [
  { price: 50, coins: 50, bonus: 0, placement: "miocoin_50", tier: "graphite" },
  { price: 300, coins: 310, bonus: 10, placement: "miocoin_310", tier: "crimson" },
  { price: 500, coins: 525, bonus: 25, placement: "miocoin_525", tier: "crown" },
  { price: 1200, coins: 1280, bonus: 80, placement: "miocoin_1280", tier: "holo" },
];

export const MioCoinTopUpSection = ({ placementBanners }: MioCoinTopUpSectionProps) => {
  // Jediný společný Stripe postup — sdílený s rychlým dobíjením v hlavičce.
  const { startCheckout, loading: topUpLoading, consentDialogProps } = useMioCoinCheckout();
  const handleCoinPurchase = startCheckout;

  // Dobíjecí sekce se v nativní aplikaci nerenderuje (Apple/Google pravidla).
  if (isNativeApp()) return null;

  return (
    <>
      <div className="homepage-miocoin-header flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <h2 className="om-tu-title">
            <span className="om-tu-title-a">Dobij si </span>
            <span className="om-tu-title-b">MIO</span>
          </h2>
          <p className="text-[12.5px] leading-snug text-[#A9AAB3]">Dobij si MIO na otevření voucherů nebo účast ve hře.</p>
        </div>
        <img
          src={avatarHoldsMio}
          alt=""
          aria-hidden="true"
          className="om-tu-avatar h-[104px] w-auto shrink-0 object-contain"
        />
      </div>

      {/* Balíčky 2×2 (na desktopu 4 vedle sebe) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4 flex-1">
        {PACKAGES.map(({ price, coins, bonus, placement, tier }, i) => {
          const banner = placementBanners[placement]?.image_url;
          return (
            <div key={placement} className={`homepage-miocoin-package om-tu-tile om-tu-${tier}`}>
              {banner ? (
                <div className="om-tu-banner">
                  <img src={banner} alt={`MIO ${coins}`} className="w-full h-full object-cover object-center" />
                </div>
              ) : (
                <>
                  <div className="om-tu-stage">
                    <div className="om-tu-tilt" style={{ animationDelay: `${-1.3 * i}s` }}>
                      <MioBadge width={118} tier={tier} />
                    </div>
                    {bonus > 0 && (
                      <span className="om-tu-seal" style={{ animationDelay: `${0.6 * i}s` }}>
                        +{bonus}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="om-tu-num">{coins.toLocaleString("cs-CZ")}</span>
                    <span className="om-tu-unit">MIO</span>
                  </div>
                  <span className="om-tu-sub">
                    {bonus > 0 ? (
                      <>
                        {price.toLocaleString("cs-CZ")} + <b>{bonus} bonus</b>
                      </>
                    ) : (
                      "Základní balíček"
                    )}
                  </span>
                </>
              )}
              <Button
                className={`homepage-miocoin-button om-tu-btn om-tu-btn-${tier}`}
                onClick={() => handleCoinPurchase(price, coins)}
                disabled={topUpLoading}
              >
                {topUpLoading ? "..." : `Dobít · ${price.toLocaleString("cs-CZ")} Kč`}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11.5px] text-[#8E8F98]">Bezpečná platba kartou · MIO platí jen v OneMil</p>
      <MioPurchaseInfo className="mt-1" />
      <ImmediateUseConsentDialog {...consentDialogProps} />
    </>
  );
};

export default MioCoinTopUpSection;
