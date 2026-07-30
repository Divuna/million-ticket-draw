import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  OneMilCartIcon,
  OneMilMioCoinIcon,
  OneMilZapIcon,
  OneMilWalletIcon,
  OneMilVoucherIcon,
  OneMilDiamondIcon,
} from "@/components/icons/OneMilIcons";

/**
 * Partnerský náborový blok na Homepage — část B issue #289.
 *
 * Nahrazuje dřívější dobíjecí panel v levém sloupci. Dobíjení má vlastní
 * stránku `/top-up` a položku `Dobít` ve spodním menu.
 *
 * Pravidla (neměnit):
 * - Blok je čistě informativní odkaz na `/partner/register`. Nevolá Stripe,
 *   Supabase ani žádné platby, proto je viditelný i v nativní aplikaci
 *   (žádný `isNativeApp()` guard).
 * - Text nesmí slibovat automatickou provizi — používá se formulace
 *   „sjednanou provizi“ (schválené znění vlastníka).
 * - Používají se výhradně existující OneMil ikony; žádné nové logo ani cizí
 *   grafika.
 */

const PARTNER_BENEFITS = [
  { icon: OneMilMioCoinIcon, text: "Nastavíte si, kolik MioCoinů zákazník získá." },
  { icon: OneMilZapIcon, text: "Odměny lze posílat automaticky po nákupu." },
  { icon: OneMilWalletIcon, text: "Platíte pouze za skutečně aktivované nebo použité MioCoiny." },
  { icon: OneMilVoucherIcon, text: "Můžete přidávat vlastní vouchery a partnerské nabídky." },
  {
    icon: OneMilDiamondIcon,
    text:
      "Ze zákazníků registrovaných přes vás můžete získávat sjednanou provizi z jejich budoucích placených dobití.",
  },
] as const;

export const PartnerRecruitmentCard = () => {
  return (
    <Card className="homepage-light-panel homepage-miocoin-panel rounded-xl overflow-hidden bg-[hsl(220_45%_6%)] border border-[rgba(255,138,0,0.2)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full">
      <CardContent className="p-5 md:p-6 h-full flex flex-col">
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="space-y-2">
            <h2 className="homepage-premium-orange-heading text-xl md:text-2xl font-bold text-heading-gold flex items-center gap-2">
              <OneMilCartIcon size={24} className="w-6 h-6 md:w-7 md:h-7" />
              Staňte se partnerem OneMil
            </h2>
            <p className="text-sm md:text-base font-semibold text-text-silver">
              Odměňte své zákazníky za nákup. Zaslouží si něco navíc.
            </p>
          </div>

          <ul className="space-y-2.5 flex-1">
            {PARTNER_BENEFITS.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="homepage-light-tile rounded-xl bg-[hsl(220_45%_6%)] border border-[rgba(255,138,0,0.18)] px-3.5 py-3 flex items-start gap-3"
              >
                <Icon size={20} className="w-5 h-5 mt-0.5 shrink-0 text-[#FF8A00]" />
                <span className="text-sm text-text-silver leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>

          <Button
            asChild
            size="lg"
            className="w-full bg-gradient-to-r from-[#FF8A00] to-[#FFB547] hover:from-[#FFB547] hover:to-[#FF8A00] text-black font-bold shadow-[0_8px_24px_rgba(255,138,0,0.22)] transition-all duration-200"
          >
            <Link to="/partner/register">Chci se stát partnerem</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PartnerRecruitmentCard;
